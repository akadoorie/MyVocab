import type { LanguageMap } from '../lang/languages';
import { itemIdentityKey } from '../item/identity';
import { ITEM_LIMITS, type ListName } from '../item/limits';
import {
  TRANSLATION_KINDS,
  type ItemContent,
  type ItemStatus,
  type Translations,
} from '../item/types';
import {
  missingLiteralWarnings,
  mixedScriptWarnings,
  multipleMeaningsWarnings,
} from '../item/validate';
import { normalize } from '../text/normalize';
import { CSV_COLUMNS, translationColumn } from './columns';
import { toCsvIssue, type CsvIssue, type ParsedRow } from './parse-rows';

/**
 * Plans an append-only import (PRD §8.3): rows are grouped by item identity, merged together and
 * into existing items. Nothing is ever deleted or overwritten; only new entries are appended.
 */

export type ExistingItem = {
  id: number;
  content: ItemContent;
  categories: readonly string[];
  /** In the sample set guests play (D-038). */
  inSampleSet: boolean;
};

export type PlanContext = {
  languages: LanguageMap;
  /** Existing non-deleted items, keyed by `itemIdentityKey`. */
  existing: ReadonlyMap<string, ExistingItem>;
  knownCategories: ReadonlySet<string>;
  createMissingCategories: boolean;
};

export type PlannedCreate = {
  content: ItemContent;
  categories: string[];
  status: ItemStatus;
  /** From the `sample` column; off when the file doesn't say (D-038). */
  inSampleSet: boolean;
  rows: number[];
};

export type PlannedUpdate = {
  id: number;
  /** The full merged content (existing entries first, new ones appended). */
  content: ItemContent;
  categoriesToAdd: string[];
  /**
   * Set only when the `sample` column changes the item's sample-set membership (D-038). The one
   * exception to append-only: the column is an explicit instruction, so it can also turn it off.
   */
  inSampleSet?: boolean;
  rows: number[];
  /** False when the file adds nothing new to this item. */
  changed: boolean;
};

export type ImportTotals = {
  newItems: number;
  mergedItems: number;
  newTranslationEntries: number;
  newMeaningEntries: number;
  newLiteralEntries: number;
  newExplanationEntries: number;
  newSynonyms: number;
  newHints: number;
  newCategories: number;
  skippedDuplicates: number;
  /** Existing items put in or taken out of the sample set (D-038). */
  sampleSetChanges: number;
};

export type ImportPlan = {
  creates: PlannedCreate[];
  updates: PlannedUpdate[];
  newCategories: string[];
  totals: ImportTotals;
  errors: CsvIssue[];
  warnings: CsvIssue[];
};

type Counts = { added: number; skipped: number };

function appendUnique(target: string[], incoming: readonly string[], counts: Counts): void {
  const seen = new Set(target.map(normalize));
  for (const entry of incoming) {
    const key = normalize(entry);
    if (seen.has(key)) {
      counts.skipped++;
    } else {
      seen.add(key);
      target.push(entry);
      counts.added++;
    }
  }
}

const cloneLists = (t: Translations): Translations =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, [...v]]));

function cloneContent(c: ItemContent): ItemContent {
  return {
    ...c,
    parallel: cloneLists(c.parallel),
    meaning: cloneLists(c.meaning),
    literal: cloneLists(c.literal),
    explanation: [...c.explanation],
    synonyms: [...c.synonyms],
    hints: [...c.hints],
  };
}

function emptyContent(from: ItemContent): ItemContent {
  return {
    ...from,
    multipleMeanings: false,
    parallel: {},
    meaning: {},
    literal: {},
    explanation: [],
    synonyms: [],
    hints: [],
  };
}

export function planImport(rows: readonly ParsedRow[], ctx: PlanContext): ImportPlan {
  const plan: ImportPlan = {
    creates: [],
    updates: [],
    newCategories: [],
    totals: {
      newItems: 0,
      mergedItems: 0,
      newTranslationEntries: 0,
      newMeaningEntries: 0,
      newLiteralEntries: 0,
      newExplanationEntries: 0,
      newSynonyms: 0,
      newHints: 0,
      newCategories: 0,
      skippedDuplicates: 0,
      sampleSetChanges: 0,
    },
    errors: [],
    warnings: [],
  };

  const groups = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const key = itemIdentityKey(row.content.lang, row.content.text, row.content.type);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const newCategories = new Set<string>();
  for (const [key, group] of groups) {
    const first = group[0] as ParsedRow;
    const existing = ctx.existing.get(key);
    const content = existing ? cloneContent(existing.content) : emptyContent(first.content);
    const counts = {
      parallel: { added: 0, skipped: 0 },
      meaning: { added: 0, skipped: 0 },
      literal: { added: 0, skipped: 0 },
      explanation: { added: 0, skipped: 0 },
      synonyms: { added: 0, skipped: 0 },
      hints: { added: 0, skipped: 0 },
    } satisfies Record<ListName, Counts>;
    let flagTurnedOn = false;
    const categories = new Set<string>(existing?.categories ?? []);
    const categoriesToAdd: string[] = [];

    for (const row of group) {
      for (const kind of TRANSLATION_KINDS) {
        for (const [lang, entries] of Object.entries(row.content[kind])) {
          const list = (content[kind][lang] ??= []);
          appendUnique(list, entries, counts[kind]);
        }
      }
      appendUnique(content.explanation, row.content.explanation, counts.explanation);
      appendUnique(content.synonyms, row.content.synonyms, counts.synonyms);
      appendUnique(content.hints, row.content.hints, counts.hints);
      if (row.content.multipleMeanings && !content.multipleMeanings) {
        content.multipleMeanings = true;
        flagTurnedOn = true;
      }
      for (const slug of row.categories) {
        if (!ctx.knownCategories.has(slug)) {
          if (ctx.createMissingCategories) {
            newCategories.add(slug);
          } else {
            plan.errors.push({
              row: row.row,
              column: CSV_COLUMNS.categories,
              message: `Unknown category "${slug}" (tick "Create missing categories" to add it)`,
            });
            continue;
          }
        }
        if (!categories.has(slug)) {
          categories.add(slug);
          categoriesToAdd.push(slug);
        }
      }
    }

    if (
      Object.keys(content.parallel).length === 0 &&
      Object.keys(content.meaning).length === 0 &&
      content.explanation.length === 0
    ) {
      plan.errors.push({
        row: first.row,
        column: CSV_COLUMNS.explanation,
        message: 'Add at least one translation or an explanation',
      });
    }

    const lastRow = (group[group.length - 1] as ParsedRow).row;
    const tooMany = (list: ListName, length: number, label: string) => {
      if (length > ITEM_LIMITS[list].maxEntries) {
        plan.errors.push({
          row: lastRow,
          column: label,
          message: `Too many entries after merging (${length}; the limit is ${ITEM_LIMITS[list].maxEntries})`,
        });
      }
    };
    for (const kind of TRANSLATION_KINDS) {
      for (const [lang, entries] of Object.entries(content[kind])) {
        tooMany(kind, entries.length, translationColumn(kind, lang));
      }
    }
    tooMany('explanation', content.explanation.length, CSV_COLUMNS.explanation);
    tooMany('synonyms', content.synonyms.length, CSV_COLUMNS.synonyms);
    tooMany('hints', content.hints.length, CSV_COLUMNS.hints);

    const added =
      counts.parallel.added +
      counts.meaning.added +
      counts.literal.added +
      counts.explanation.added +
      counts.synonyms.added +
      counts.hints.added;
    // The last row with a `sample` value decides (D-038).
    const sample = group.findLast((r) => r.sample !== undefined)?.sample;
    const sampleChange =
      existing && sample !== undefined && sample !== existing.inSampleSet ? sample : undefined;
    const changed =
      !existing ||
      added > 0 ||
      flagTurnedOn ||
      categoriesToAdd.length > 0 ||
      sampleChange !== undefined;
    if (changed) {
      const itemWarnings = [
        ...multipleMeaningsWarnings(content),
        ...mixedScriptWarnings(content, ctx.languages),
        ...missingLiteralWarnings(content),
      ];
      plan.warnings.push(...itemWarnings.map((w) => toCsvIssue(first.row, w)));
    }

    plan.totals.newTranslationEntries += counts.parallel.added;
    plan.totals.newMeaningEntries += counts.meaning.added;
    plan.totals.newLiteralEntries += counts.literal.added;
    plan.totals.newExplanationEntries += counts.explanation.added;
    plan.totals.newSynonyms += counts.synonyms.added;
    plan.totals.newHints += counts.hints.added;
    plan.totals.skippedDuplicates +=
      counts.parallel.skipped +
      counts.meaning.skipped +
      counts.literal.skipped +
      counts.explanation.skipped +
      counts.synonyms.skipped +
      counts.hints.skipped;

    const rowNumbers = group.map((r) => r.row);
    if (existing) {
      plan.totals.mergedItems++;
      if (sampleChange !== undefined) plan.totals.sampleSetChanges++;
      plan.updates.push({
        id: existing.id,
        content,
        categoriesToAdd,
        ...(sampleChange === undefined ? {} : { inSampleSet: sampleChange }),
        rows: rowNumbers,
        changed,
      });
    } else {
      plan.totals.newItems++;
      const status = group.find((r) => r.status !== undefined)?.status ?? 'published';
      plan.creates.push({
        content,
        categories: [...categories],
        status,
        inSampleSet: sample ?? false,
        rows: rowNumbers,
      });
    }
  }

  plan.newCategories = [...newCategories];
  plan.totals.newCategories = newCategories.size;
  return plan;
}
