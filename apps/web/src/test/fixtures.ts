import type { MetaResponse } from '@myvocab/contracts';
import type { CardView } from '@myvocab/core';

// Synthetic test data only.
export function makeCard(id: number, over: Partial<CardView> = {}): CardView {
  return {
    itemId: id,
    direction: { source: 'en', target: 'he' },
    multipleMeanings: false,
    front: { text: `sample-${id}`, lang: 'en', dir: 'ltr' },
    answer: {
      kind: 'translation',
      main: 'meaning',
      lines: [`מילה-${id}`],
      numbered: false,
      meaning: [],
      literal: [],
      literalSameAsParallel: false,
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
  topics: [{ id: 1, slug: 'home', name: 'Home', nameHe: 'בית' }],
  defaults: { sourceLang: 'en', targetLang: 'he', topicId: null, size: 10 },
  sizeOptions: [10, 20, 30, 40, 50],
  guest: { enabled: true, loopSize: 5 },
  undoWindowSeconds: 4,
  continueSeconds: 10,
  nextSeconds: 10,
  maintenance: { enabled: false, message: '' },
  turnstileSiteKey: 'test-site-key',
};
