import type { LangCode, LanguageMap } from '../lang/languages';
import {
  ITEM_STATUSES,
  TRANSLATION_KINDS,
  type ItemContent,
  type ItemStatus,
  type TranslationKind,
} from '../item/types';
import { validateItem, type ItemIssue } from '../item/validate';
import {
  CATEGORY_SLUG,
  CSV_COLUMNS,
  REQUIRED_COLUMNS,
  splitList,
  translationColumn,
  translationColumnOf,
} from './columns';
import { CsvSyntaxError, parseCsv } from './rfc4180';

/** A problem found in the file. `row` is the spreadsheet line (header = 1); 0 = the whole file. */
export type CsvIssue = { row: number; column: string; message: string };

export type ParsedRow = {
  row: number;
  content: ItemContent;
  categories: string[];
  /** Only set when the cell had a value; applies to newly created items. */
  status?: ItemStatus;
  /** Only set when the cell had a value: puts the item in or out of the sample set (D-038). */
  sample?: boolean;
};

export type ParseRowsResult = {
  rows: ParsedRow[];
  errors: CsvIssue[];
  dataRowCount: number;
};

export type ParseRowsOptions = {
  /** Active languages: item languages and per-language columns must be among them. */
  languages: LanguageMap;
  /** Admin uploads are limited to 5,000 rows (PRD §8.3); seeding has no limit. */
  maxRows?: number;
};

const KNOWN_COLUMNS = new Set<string>(Object.values(CSV_COLUMNS));
const TRUE_VALUES = new Set(['true', '1', 'yes']);
const FALSE_VALUES = new Set(['false', '0', 'no', '']);

/** Maps a validation path (`meaning.he[2]`) to its CSV column (`translation_meaning_he`). */
function columnOf(path: string): string {
  const field = path.replace(/\[\d+\]$/, '');
  const [kind, lang] = field.split('.');
  if (lang && (TRANSLATION_KINDS as readonly string[]).includes(kind ?? ''))
    return translationColumn(kind as TranslationKind, lang);
  return field === 'multipleMeanings' ? CSV_COLUMNS.multipleMeanings : field;
}

const SAME_LANGUAGE_CSV: Record<TranslationKind, (lang: string) => string> = {
  parallel: (l) => `An item in "${l}" can't have a translation into "${l}"; use explanation`,
  meaning: (l) => `An item in "${l}" can't have a meaning in "${l}"; use explanation`,
  literal: (l) => `An item in "${l}" can't have a literal translation in "${l}"`,
};

export function toCsvIssue(row: number, issue: ItemIssue): CsvIssue {
  return { row, column: columnOf(issue.path), message: issue.message };
}

/**
 * Parses an import CSV into item rows, reporting file-level and row-level errors. Warnings are
 * computed by the merge planner on the merged result (rows of the same item combine first).
 */
export function parseImportCsv(text: string, opts: ParseRowsOptions): ParseRowsResult {
  const result: ParseRowsResult = { rows: [], errors: [], dataRowCount: 0 };
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (e) {
    /* c8 ignore next */
    const line = e instanceof CsvSyntaxError ? e.line : 0;
    result.errors.push({ row: line, column: '', message: 'Invalid CSV: unclosed quote' });
    return result;
  }

  const [header, ...body] = table;
  if (!header || header.every((h) => h.trim() === '')) {
    result.errors.push({
      row: 0,
      column: '',
      message: 'The file is empty (a header row is required)',
    });
    return result;
  }

  const columns = header.map((h) => h.trim().toLowerCase());
  const perLanguageColumns = new Map<number, { kind: TranslationKind; lang: LangCode }>();
  // Errors name the column as it is in the file (an old name stays the old name).
  const asInFile = new Map<string, string>();
  const seen = new Set<string>();
  columns.forEach((col, i) => {
    const perLanguage = translationColumnOf(col);
    // An old and a new name for the same list (`translation_he` + `translation_meaning_he`)
    // count as a duplicate too.
    const key = perLanguage ? translationColumn(perLanguage.kind, perLanguage.lang) : col;
    if (seen.has(key)) {
      result.errors.push({ row: 1, column: col, message: `Duplicate column "${col}"` });
    }
    seen.add(key);
    asInFile.set(key, col);
    if (perLanguage) {
      if (!opts.languages[perLanguage.lang]) {
        result.errors.push({
          row: 1,
          column: col,
          message: `Unknown language "${perLanguage.lang}" in column "${col}"`,
        });
      } else {
        perLanguageColumns.set(i, perLanguage);
      }
    } else if (!KNOWN_COLUMNS.has(col)) {
      result.errors.push({ row: 1, column: col, message: `Unknown column "${col}"` });
    }
  });
  for (const required of REQUIRED_COLUMNS) {
    if (!columns.includes(required)) {
      result.errors.push({
        row: 1,
        column: required,
        message: `Missing required column "${required}"`,
      });
    }
  }
  if (result.errors.length > 0) return result;

  const dataRows = body
    .map((cells, i) => ({ cells, row: i + 2 }))
    .filter(({ cells }) => cells.some((c) => c.trim() !== ''));
  result.dataRowCount = dataRows.length;
  if (opts.maxRows !== undefined && dataRows.length > opts.maxRows) {
    result.errors.push({
      row: 0,
      column: '',
      message: `Too many rows: ${dataRows.length} (the limit is ${opts.maxRows})`,
    });
    return result;
  }

  const index = (name: string) => columns.indexOf(name);
  for (const { cells, row } of dataRows) {
    const cell = (name: string) => {
      const i = index(name);
      return i < 0 ? '' : (cells[i] ?? '').trim();
    };
    const rowErrors: CsvIssue[] = [];

    const mm = cell(CSV_COLUMNS.multipleMeanings).toLowerCase();
    if (!TRUE_VALUES.has(mm) && !FALSE_VALUES.has(mm)) {
      rowErrors.push({ row, column: CSV_COLUMNS.multipleMeanings, message: 'Use true or false' });
    }

    const statusCell = cell(CSV_COLUMNS.status).toLowerCase();
    let status: ItemStatus | undefined;
    if (statusCell !== '') {
      if ((ITEM_STATUSES as readonly string[]).includes(statusCell))
        status = statusCell as ItemStatus;
      else rowErrors.push({ row, column: CSV_COLUMNS.status, message: 'Use published or draft' });
    }

    const sampleCell = cell(CSV_COLUMNS.sample).toLowerCase();
    let sample: boolean | undefined;
    if (sampleCell !== '') {
      if (TRUE_VALUES.has(sampleCell)) sample = true;
      else if (FALSE_VALUES.has(sampleCell)) sample = false;
      else rowErrors.push({ row, column: CSV_COLUMNS.sample, message: 'Use true or false' });
    }

    const categories = [
      ...new Set(splitList(cell(CSV_COLUMNS.categories)).map((c) => c.toLowerCase())),
    ];
    for (const slug of categories) {
      if (!CATEGORY_SLUG.test(slug)) {
        rowErrors.push({
          row,
          column: CSV_COLUMNS.categories,
          message: `Invalid category slug "${slug}"`,
        });
      }
    }

    const perLanguageCells = (kind: TranslationKind) => {
      const out: Record<string, string[]> = {};
      for (const [i, col] of perLanguageColumns) {
        if (col.kind !== kind) continue;
        const entries = splitList((cells[i] ?? '').trim());
        if (entries.length > 0) out[col.lang] = entries;
      }
      return out;
    };

    const { value, errors } = validateItem(
      {
        lang: cell(CSV_COLUMNS.lang),
        text: cell(CSV_COLUMNS.text),
        type: cell(CSV_COLUMNS.type),
        multipleMeanings: TRUE_VALUES.has(mm),
        parallel: perLanguageCells('parallel'),
        meaning: perLanguageCells('meaning'),
        literal: perLanguageCells('literal'),
        explanation: splitList(cell(CSV_COLUMNS.explanation)),
        synonyms: splitList(cell(CSV_COLUMNS.synonyms)),
        hints: splitList(cell(CSV_COLUMNS.hints)),
      },
      { languages: opts.languages },
    );
    rowErrors.push(
      ...errors.map((issue) => {
        const column = asInFile.get(columnOf(issue.path)) ?? columnOf(issue.path);
        return issue.code === 'SAME_LANGUAGE_TRANSLATION'
          ? {
              row,
              column,
              message: SAME_LANGUAGE_CSV[issue.path.split('.')[0] as TranslationKind](value.lang),
            }
          : { ...toCsvIssue(row, issue), column };
      }),
    );
    if (rowErrors.length > 0) {
      result.errors.push(...rowErrors);
      continue;
    }
    result.rows.push({
      row,
      content: value,
      categories,
      ...(status ? { status } : {}),
      ...(sample === undefined ? {} : { sample }),
    });
  }
  return result;
}
