import type { LangCode } from '../lang/languages';
import { TRANSLATION_KINDS, type ItemContent, type ItemStatus } from '../item/types';
import { CSV_COLUMNS, joinList, translationColumn } from './columns';
import { serializeCsv } from './rfc4180';

export type ExportItem = {
  content: ItemContent;
  categories: readonly string[];
  status: ItemStatus;
};

/**
 * Translation languages for the header: the given order first (e.g. active languages by
 * sort order), then any other language present in the items, alphabetically.
 */
function translationLanguages(
  items: readonly ExportItem[],
  order: readonly LangCode[],
): LangCode[] {
  const present = new Set<LangCode>(order);
  for (const item of items)
    for (const kind of TRANSLATION_KINDS)
      for (const lang of Object.keys(item.content[kind])) present.add(lang);
  const extra = [...present].filter((l) => !order.includes(l)).sort();
  return [...order, ...extra];
}

export function csvHeader(translationLangs: readonly LangCode[]): string[] {
  return [
    CSV_COLUMNS.lang,
    CSV_COLUMNS.text,
    CSV_COLUMNS.type,
    CSV_COLUMNS.multipleMeanings,
    CSV_COLUMNS.categories,
    ...TRANSLATION_KINDS.flatMap((kind) => translationLangs.map((l) => translationColumn(kind, l))),
    CSV_COLUMNS.explanation,
    CSV_COLUMNS.synonyms,
    CSV_COLUMNS.hints,
    CSV_COLUMNS.status,
  ];
}

/**
 * Serializes items to the import format (PRD §8.3), UTF-8 with BOM so Excel shows Hebrew. Importing
 * the result into an empty database reproduces the same content (round-trip guarantee).
 */
export function serializeItemsCsv(
  items: readonly ExportItem[],
  languageOrder: readonly LangCode[],
): string {
  const langs = translationLanguages(items, languageOrder);
  const rows = items.map(({ content, categories, status }) => [
    content.lang,
    content.text,
    content.type,
    content.multipleMeanings ? 'true' : 'false',
    joinList(categories),
    ...TRANSLATION_KINDS.flatMap((kind) => langs.map((l) => joinList(content[kind][l] ?? []))),
    joinList(content.explanation),
    joinList(content.synonyms),
    joinList(content.hints),
    status,
  ]);
  return serializeCsv([csvHeader(langs), ...rows], { bom: true });
}
