import type { LangCode } from '../lang/languages';
import { TRANSLATION_KINDS, type TranslationKind } from '../item/types';

/**
 * CSV columns (PRD §8.3). The three kinds of translation use one column per kind and language:
 * `translation_parallel_<code>`, `translation_meaning_<code>`, `translation_literal_<code>`.
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
  /** true/false: in the sample set guests play (D-038). Empty = new items off, existing unchanged. */
  sample: 'sample',
} as const;

export const REQUIRED_COLUMNS = [CSV_COLUMNS.lang, CSV_COLUMNS.text, CSV_COLUMNS.type] as const;

export function translationColumn(kind: TranslationKind, lang: LangCode): string {
  return `translation_${kind}_${lang}`;
}

/**
 * Column prefixes for the per-language translation columns, longest first. The old names from
 * before D-024 are still read: `translation_<code>` (the meaning, D-025) and `literal_<code>`.
 */
export const TRANSLATION_COLUMN_PREFIXES: readonly { prefix: string; kind: TranslationKind }[] = [
  ...TRANSLATION_KINDS.map((kind) => ({ prefix: `translation_${kind}_`, kind })),
  { prefix: 'translation_', kind: 'meaning' },
  { prefix: 'literal_', kind: 'literal' },
];

/** The kind and language of a per-language translation column, or undefined. */
export function translationColumnOf(
  column: string,
): { kind: TranslationKind; lang: string } | undefined {
  const match = TRANSLATION_COLUMN_PREFIXES.find(({ prefix }) => column.startsWith(prefix));
  return match ? { kind: match.kind, lang: column.slice(match.prefix.length) } : undefined;
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
