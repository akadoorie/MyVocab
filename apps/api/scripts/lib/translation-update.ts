/**
 * The pure part of `pnpm db:update-translations` (D-024): reads a CSV of item ids and their three
 * kinds of translation, and works out each item's new lists and a readable before/after diff.
 *
 * Columns: `id` (required), `text` (optional: checked against the item, to catch a wrong id), and
 * any per-language translation columns (`translation_parallel_<code>`, `translation_meaning_<code>`,
 * `translation_literal_<code>`, or the old `translation_<code>` / `literal_<code>`). A column in
 * the file replaces that list for that language; an empty cell clears it. Lists without a column
 * stay as they are.
 */
import {
  normalize,
  parseCsv,
  splitList,
  translationColumnOf,
  TRANSLATION_KINDS,
  type TranslationKind,
  type Translations,
} from '@myvocab/core';

export type TranslationLists = Record<TranslationKind, Translations>;

export type TranslationUpdateRow = {
  /** Spreadsheet line (header = 1). */
  row: number;
  id: number;
  text: string | undefined;
  /** kind → language → new entries; an empty list clears it. */
  lists: Partial<Record<TranslationKind, Record<string, string[]>>>;
};

export type ParsedTranslationUpdate = {
  rows: TranslationUpdateRow[];
  errors: string[];
};

export function parseTranslationUpdateCsv(text: string): ParsedTranslationUpdate {
  const errors: string[] = [];
  const unBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // a BOM from Excel
  const [header, ...body] = parseCsv(unBom);
  const columns = (header ?? []).map((h) => h.trim().toLowerCase());
  const idAt = columns.indexOf('id');
  const textAt = columns.indexOf('text');
  if (idAt < 0) return { rows: [], errors: ['Missing required column "id"'] };

  const perLanguage = new Map<number, { kind: TranslationKind; lang: string }>();
  columns.forEach((col, i) => {
    if (i === idAt || i === textAt) return;
    const parsed = translationColumnOf(col);
    if (parsed && parsed.lang) perLanguage.set(i, parsed);
    else errors.push(`Unknown column "${col}"`);
  });
  if (perLanguage.size === 0) errors.push('No translation columns in the file');
  if (errors.length > 0) return { rows: [], errors };

  const rows: TranslationUpdateRow[] = [];
  const seenIds = new Set<number>();
  body.forEach((cells, i) => {
    const row = i + 2;
    if (cells.every((c) => c.trim() === '')) return;
    const id = Number((cells[idAt] ?? '').trim());
    if (!Number.isInteger(id) || id <= 0) {
      errors.push(`row ${row}: invalid id "${cells[idAt] ?? ''}"`);
      return;
    }
    if (seenIds.has(id)) {
      errors.push(`row ${row}: item ${id} appears more than once`);
      return;
    }
    seenIds.add(id);
    const lists: TranslationUpdateRow['lists'] = {};
    for (const [at, { kind, lang }] of perLanguage) {
      (lists[kind] ??= {})[lang] = splitList((cells[at] ?? '').trim());
    }
    const itemText = textAt < 0 ? undefined : (cells[textAt] ?? '').trim() || undefined;
    rows.push({ row, id, text: itemText, lists });
  });
  return { rows, errors };
}

/** True when the file's `text` (if given) names the same item. */
export function textMatches(row: TranslationUpdateRow, itemText: string): boolean {
  return row.text === undefined || normalize(row.text) === normalize(itemText);
}

/** The item's lists after applying the row: only the languages and kinds in the file change. */
export function applyRow(current: TranslationLists, row: TranslationUpdateRow): TranslationLists {
  const next = {} as TranslationLists;
  for (const kind of TRANSLATION_KINDS) {
    const lists: Translations = { ...current[kind] };
    for (const [lang, entries] of Object.entries(row.lists[kind] ?? {})) {
      if (entries.length > 0) lists[lang] = entries;
      else delete lists[lang];
    }
    next[kind] = lists;
  }
  return next;
}

const show = (entries: readonly string[] | undefined) =>
  entries && entries.length > 0 ? entries.join(' | ') : '(empty)';

/** One line per changed list: `parallel.en: A | B → C`. Empty when nothing changes. */
export function describeChanges(before: TranslationLists, after: TranslationLists): string[] {
  const lines: string[] = [];
  for (const kind of TRANSLATION_KINDS) {
    const langs = new Set([...Object.keys(before[kind]), ...Object.keys(after[kind])]);
    for (const lang of [...langs].sort()) {
      const a = before[kind][lang];
      const b = after[kind][lang];
      if (JSON.stringify(a ?? []) !== JSON.stringify(b ?? []))
        lines.push(`${kind}.${lang}: ${show(a)} → ${show(b)}`);
    }
  }
  return lines;
}
