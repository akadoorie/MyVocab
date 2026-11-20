import { csvHeader, serializeCsv } from '@myvocab/core';

/**
 * The CSV template (FR-A60, PRD §8.3): the header for every language (D-027) and the
 * illustrative rows (the second shows the three kinds of translation). UTF-8 with BOM so Excel shows Hebrew correctly.
 */
const EXAMPLES: Record<string, string>[] = [
  {
    lang: 'en',
    text: 'Swift',
    type: 'word',
    multiple_meanings: 'true',
    categories: '',
    translation_meaning_he: 'מהיר|סנונית',
    explanation: 'Moving or able to move very fast|A small bird that flies very fast',
    synonyms: 'fast|quick|rapid',
    hints: 'He gave a swift reply.|A swift nested under the roof.',
    status: 'published',
  },
  {
    lang: 'en',
    text: 'sample expression',
    type: 'expr',
    multiple_meanings: 'false',
    categories: '',
    translation_parallel_he: 'ביטוי מקביל לדוגמה',
    translation_meaning_he: 'משמעות לדוגמה',
    translation_literal_he: 'תרגום מילולי לדוגמה',
    explanation: 'What the expression means',
    synonyms: '',
    hints: 'A sentence that uses the sample expression.',
    status: 'published',
  },
  {
    lang: 'he',
    text: 'מהיר',
    type: 'word',
    multiple_meanings: 'false',
    categories: '',
    translation_meaning_en: 'fast|quick',
    explanation: 'שנע או פועל במהירות רבה',
    synonyms: 'זריז',
    hints: 'הרכבת המהירה הגיעה בזמן.',
    status: 'published',
  },
];

export function importTemplateCsv(languages: readonly string[]): string {
  const header = csvHeader(languages);
  const rows = EXAMPLES.filter((e) => languages.includes(e.lang ?? '')).map((e) =>
    header.map((column) => e[column] ?? ''),
  );
  return serializeCsv([header, ...rows], { bom: true });
}
