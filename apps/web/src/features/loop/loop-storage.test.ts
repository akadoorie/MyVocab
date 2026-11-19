import { createLoop } from '@myvocab/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { loadLoop } from './loop-storage';

beforeEach(() => window.sessionStorage.clear());

describe('loop storage', () => {
  it('resumes a session saved before D-024 (cards without answer.main / answer.meaning)', () => {
    const card = makeCard(1);
    const { main: _main, meaning: _meaning, ...oldAnswer } = card.answer;
    const explanation = makeCard(2, {
      direction: { source: 'en', target: 'en' },
      answer: { ...card.answer, kind: 'explanation', main: 'explanation', lang: 'en', dir: 'ltr' },
    });
    const { main: _m2, meaning: _mn2, ...oldExplanation } = explanation.answer;
    window.sessionStorage.setItem(
      'myvocab.loop.v1',
      JSON.stringify({
        cards: [
          { ...card, answer: oldAnswer },
          { ...explanation, answer: oldExplanation },
        ],
        state: createLoop([1, 2], 3),
        undoWindowSeconds: 4,
        selection: { sourceLang: 'en', targetLang: 'he', categoryId: null, type: 'word', size: 5 },
        isGuest: true,
      }),
    );
    const loop = loadLoop();
    expect(loop?.cards.map((c) => [c.answer.main, c.answer.meaning])).toEqual([
      ['parallel', []],
      ['explanation', []],
    ]);
  });
});
