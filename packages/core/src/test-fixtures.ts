// Shared, synthetic test data for packages/core tests (not exported from the package).
import { toLanguageMap, type LanguageMap } from './lang/languages';
import type { ItemData } from './item/types';

export const LANGS: LanguageMap = toLanguageMap([
  { code: 'en', dir: 'ltr', script: 'Latn' },
  { code: 'he', dir: 'rtl', script: 'Hebr' },
]);

export function makeItem(overrides: Partial<ItemData> = {}): ItemData {
  return {
    id: 1,
    lang: 'en',
    text: 'Date',
    type: 'word',
    multipleMeanings: true,
    parallel: { he: ['תאריך', 'תמר'] },
    meaning: {},
    literal: {},
    explanation: [
      'A particular day of the month or year',
      'The sweet brown fruit of the date palm',
    ],
    synonyms: [],
    hints: ['What is the date today?', 'Dates grow on palm trees.'],
    ...overrides,
  };
}
