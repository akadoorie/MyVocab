import type { MetaResponse } from '@myvocab/contracts';
import type { CardView } from '@myvocab/core';

// Synthetic test data only.
export function makeCard(id: number, over: Partial<CardView> = {}): CardView {
  return {
    itemId: id,
    type: 'word',
    direction: { source: 'en', target: 'he' },
    multipleMeanings: false,
    front: { text: `sample-${id}`, lang: 'en', dir: 'ltr' },
    answer: {
      kind: 'translation',
      main: 'parallel',
      lines: [`מילה-${id}`],
      numbered: false,
      meaning: [],
      literal: [],
      lang: 'he',
      dir: 'rtl',
    },
    hints: [`Hint for sample ${id}.`],
    synonyms: [],
    extrasLang: { lang: 'en', dir: 'ltr' },
    ...over,
  };
}

export const META: MetaResponse = {
  languages: [
    { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
    { code: 'he', name: 'Hebrew', nativeName: 'עברית', dir: 'rtl' },
  ],
  categories: [{ id: 1, slug: 'home', name: 'Home' }],
  types: [
    { id: 'word', label: 'Words' },
    { id: 'expr', label: 'Expressions' },
  ],
  defaults: { sourceLang: 'en', targetLang: 'he', categoryId: null, type: 'word', size: 10 },
  sizeOptions: [10, 20, 30, 40, 50],
  guest: { enabled: true, loopSize: 5 },
  undoWindowSeconds: 4,
  maintenance: { enabled: false, message: '' },
  turnstileSiteKey: 'test-site-key',
};
