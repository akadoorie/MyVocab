import type { LangCode, LanguageMap } from '../lang/languages';
import { ITEM_STATUSES, type ItemContent, type ItemStatus } from '../item/types';
import { validateItem, type ItemIssue } from '../item/validate';
import {
  CATEGORY_SLUG,
  CSV_COLUMNS,
  REQUIRED_COLUMNS,
  LITERAL_PREFIX,
  splitList,
  TRANSLATION_PREFIX,
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

/** Maps a validation path (e.g. `translation.he[2]`) to its CSV column (`translation_he`). */
function columnOf(path: string): string {
  const field = path.replace(/\[\d+\]$/, '');
  if (field.startsWith('translation.'))
    return `${TRANSLATION_PREFIX}${field.slice('translation.'.length)}`;
  if (field.startsWith('literal.')) return `${LITERAL_PREFIX}${field.slice('literal.'.length)}`;
  return field === 'multipleMeanings' ? CSV_COLUMNS.multipleMeanings : field;
}

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
  const translationLangs = new Map<number, LangCode>();
  const literalLangs = new Map<number, LangCode>();
  const seen = new Set<string>();
  columns.forEach((col, i) => {
    if (seen.has(col)) {
      result.errors.push({ row: 1, column: col, message: `Duplicate column "${col}"` });
    }
    seen.add(col);
    const perLanguage = col.startsWith(TRANSLATION_PREFIX)
      ? { prefix: TRANSLATION_PREFIX, map: translationLangs }
      : col.startsWith(LITERAL_PREFIX)
        ? { prefix: LITERAL_PREFIX, map: literalLangs }
        : undefined;
    if (perLanguage) {
      const code = col.slice(perLanguage.prefix.length);
      if (!opts.languages[code]) {
        result.errors.push({
          row: 1,
          column: col,
          message: `Unknown language "${code}" in column "${col}"`,
        });
      } else {
        perLanguage.map.set(i, code);
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

    const perLanguageCells = (langs: Map<number, LangCode>) => {
      const out: Record<string, string[]> = {};
      for (const [i, code] of langs) {
        const entries = splitList((cells[i] ?? '').trim());
        if (entries.length > 0) out[code] = entries;
      }
      return out;
    };
    const translation = perLanguageCells(translationLangs);
    const literal = perLanguageCells(literalLangs);

    const { value, errors } = validateItem(
      {
        lang: cell(CSV_COLUMNS.lang),
        text: cell(CSV_COLUMNS.text),
        type: cell(CSV_COLUMNS.type),
        multipleMeanings: TRUE_VALUES.has(mm),
        translation,
        literal,
        explanation: splitList(cell(CSV_COLUMNS.explanation)),
        synonyms: splitList(cell(CSV_COLUMNS.synonyms)),
        hints: splitList(cell(CSV_COLUMNS.hints)),
      },
      { languages: opts.languages },
    );
    rowErrors.push(
      ...errors.map((issue) =>
        issue.code === 'SAME_LANGUAGE_TRANSLATION' && issue.path.startsWith('literal.')
          ? {
              row,
              column: columnOf(issue.path),
              message: `An item in "${value.lang}" can't have a literal meaning in "${value.lang}"`,
            }
          : issue.code === 'SAME_LANGUAGE_TRANSLATION'
            ? {
                row,
                column: columnOf(issue.path),
                message: `An item in "${value.lang}" can't have a translation into "${value.lang}"; use explanation`,
              }
            : toCsvIssue(row, issue),
      ),
    );
    if (rowErrors.length > 0) {
      result.errors.push(...rowErrors);
      continue;
    }
    result.rows.push({ row, content: value, categories, ...(status ? { status } : {}) });
  }
  return result;
}
