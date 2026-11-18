import type { LangCode } from '../lang/languages';

/**
 * CSV columns (PRD §8.3). Translations and literal meanings use one `translation_<code>` /
 * `literal_<code>` column per language.
 */
export const CSV_COLUMNS = {
  lang: 'lang',
  text: 'text',
  type: 'type',
  multipleMeanings: 'multiple_meanings',
  categories: 'categories',
  explanation: 'explanation',
  synonyms: 'synonyms',
  hints: 'hints',
  status: 'status',
} as const;

export const REQUIRED_COLUMNS = [CSV_COLUMNS.lang, CSV_COLUMNS.text, CSV_COLUMNS.type] as const;

export const TRANSLATION_PREFIX = 'translation_';

export function translationColumn(lang: LangCode): string {
  return `${TRANSLATION_PREFIX}${lang}`;
}

/** Literal (word-for-word) meanings use one `literal_<code>` column per language. */
export const LITERAL_PREFIX = 'literal_';

export function literalColumn(lang: LangCode): string {
  return `${LITERAL_PREFIX}${lang}`;
}

export const CATEGORY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CSV_LIST_SEPARATOR = '|';

/** Splits a list cell on `|`, trimming entries and dropping empty ones. */
export function splitList(cell: string): string[] {
  return cell
    .split(CSV_LIST_SEPARATOR)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

export function joinList(entries: readonly string[]): string {
  return entries.join(CSV_LIST_SEPARATOR);
}
