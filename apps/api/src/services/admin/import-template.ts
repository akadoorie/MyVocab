import { csvHeader, serializeCsv } from '@myvocab/core';

/**
 * The CSV template (FR-A60, PRD §8.3): the header for the active languages and the two
 * illustrative rows from the PRD. UTF-8 with BOM so Excel shows Hebrew correctly.
 */
const EXAMPLES: Record<string, string>[] = [
  {
    lang: 'en',
    text: 'Swift',
    type: 'word',
    multiple_meanings: 'true',
    categories: '',
    translation_he: 'מהיר|סנונית',
    explanation: 'Moving or able to move very fast|A small bird that flies very fast',
    synonyms: 'fast|quick|rapid',
    hints: 'He gave a swift reply.|A swift nested under the roof.',
    status: 'published',
  },
  {
    lang: 'he',
    text: 'מהיר',
    type: 'word',
    multiple_meanings: 'false',
    categories: '',
    translation_en: 'fast|quick',
    explanation: 'שנע או פועל במהירות רבה',
    synonyms: 'זריז',
    hints: 'הרכבת המהירה הגיעה בזמן.',
    status: 'published',
  },
];

export function importTemplateCsv(activeLanguages: readonly string[]): string {
  const header = csvHeader(activeLanguages);
  const rows = EXAMPLES.filter((e) => activeLanguages.includes(e.lang ?? '')).map((e) =>
    header.map((column) => e[column] ?? ''),
  );
  return serializeCsv([header, ...rows], { bom: true });
}
