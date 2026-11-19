import { describe, expect, it } from 'vitest';
import { LANGS, makeItem } from '../test-fixtures';
import { buildCard, CardBuildError } from './build-card';
import {
  explanationStrategy,
  isPlayableFor,
  playableTargets,
  strategyFor,
  translationStrategy,
} from './strategies';

describe('strategyFor', () => {
  it('uses the translation for different languages and the explanation for the same one', () => {
    expect(strategyFor('en', 'he')).toBe(translationStrategy);
    expect(strategyFor('en', 'en')).toBe(explanationStrategy);
  });
});

describe('playability (FR-L40)', () => {
  it('needs a translation into the target, or an explanation for the same language', () => {
    const item = makeItem();
    expect(isPlayableFor(item, 'en', 'he')).toBe(true);
    expect(isPlayableFor(item, 'en', 'en')).toBe(true);
    expect(isPlayableFor(makeItem({ parallel: {} }), 'en', 'he')).toBe(false);
    expect(isPlayableFor(makeItem({ explanation: [] }), 'en', 'en')).toBe(false);
  });

  it('requires the item language to be the source', () => {
    expect(isPlayableFor(makeItem(), 'he', 'en')).toBe(false);
  });

  it('lists every playable target', () => {
    expect(playableTargets(makeItem(), ['en', 'he'])).toEqual(['en', 'he']);
    expect(playableTargets(makeItem({ explanation: [] }), ['en', 'he'])).toEqual(['he']);
  });
});

describe('buildCard', () => {
  it('builds a translation card (EN → HE)', () => {
    const card = buildCard(makeItem(), 'he', LANGS);
    expect(card).toEqual({
      itemId: 1,
      type: 'word',
      direction: { source: 'en', target: 'he' },
      multipleMeanings: true,
      front: { text: 'Date', lang: 'en', dir: 'ltr' },
      answer: {
        kind: 'translation',
        main: 'parallel',
        lines: ['תאריך', 'תמר'],
        numbered: false,
        meaning: [],
        literal: [],
        lang: 'he',
        dir: 'rtl',
      },
      hints: ['What is the date today?', 'Dates grow on palm trees.'],
      synonyms: [],
      extrasLang: { lang: 'en', dir: 'ltr' },
    });
  });

  it('shows the parallel as the main answer, with the meaning and literal under it (D-024)', () => {
    const item = makeItem({
      type: 'expr',
      multipleMeanings: false,
      parallel: { he: ['מקבילה-1'] },
      meaning: { he: ['משמעות-1'] },
      literal: { he: ['מילולי-1'] },
    });
    expect(buildCard(item, 'he', LANGS).answer).toMatchObject({
      main: 'parallel',
      lines: ['מקבילה-1'],
      meaning: ['משמעות-1'],
      literal: ['מילולי-1'],
    });
  });

  it('uses the meaning as the main answer when there is no parallel', () => {
    const item = makeItem({ parallel: {}, meaning: { he: ['משמעות-1', 'משמעות-2'] } });
    expect(isPlayableFor(item, 'en', 'he')).toBe(true);
    expect(buildCard(item, 'he', LANGS).answer).toMatchObject({
      main: 'meaning',
      lines: ['משמעות-1', 'משמעות-2'],
      meaning: [], // not repeated under itself
    });
  });

  it('a literal translation alone does not make an item playable', () => {
    const item = makeItem({ parallel: {}, meaning: {}, literal: { he: ['מילולי-1'] } });
    expect(isPlayableFor(item, 'en', 'he')).toBe(false);
  });

  it('same-language cards show the explanation, with no meaning or literal', () => {
    const item = makeItem({ meaning: { he: ['משמעות-1'] }, literal: { he: ['מילולי-1'] } });
    expect(buildCard(item, 'en', LANGS).answer).toMatchObject({
      main: 'explanation',
      meaning: [],
      literal: [],
    });
  });

  it('adds the literal meaning to translation cards only', () => {
    const item = makeItem({
      text: 'sample expression',
      type: 'expr',
      multipleMeanings: false,
      parallel: { he: ['משמעות-1'] },
      literal: { he: ['מילולי-1'] },
    });
    expect(buildCard(item, 'he', LANGS).answer.literal).toEqual(['מילולי-1']);
    expect(buildCard(item, 'en', LANGS).answer.literal).toEqual([]);
  });

  it('builds an explanation card (EN → EN), numbered when there are two or more lines', () => {
    const card = buildCard(makeItem(), 'en', LANGS);
    expect(card.answer).toMatchObject({
      kind: 'explanation',
      numbered: true,
      lang: 'en',
      dir: 'ltr',
    });
    expect(card.answer.lines).toHaveLength(2);
    const single = buildCard(makeItem({ explanation: ['One meaning'] }), 'en', LANGS);
    expect(single.answer.numbered).toBe(false);
  });

  it('builds a Hebrew item card with RTL front and LTR answer', () => {
    const item = makeItem({ lang: 'he', text: 'מהיר', parallel: { en: ['fast', 'quick'] } });
    const card = buildCard(item, 'en', LANGS);
    expect(card.front).toEqual({ text: 'מהיר', lang: 'he', dir: 'rtl' });
    expect(card.extrasLang.dir).toBe('rtl');
    expect(card.answer.dir).toBe('ltr');
  });

  it('returns copies of the lists', () => {
    const item = makeItem();
    const card = buildCard(item, 'he', LANGS);
    card.hints.push('x');
    card.answer.lines.push('y');
    expect(item.hints).toHaveLength(2);
    expect(item.parallel.he).toHaveLength(2);
  });

  it('refuses an unplayable item or an unknown language', () => {
    expect(() => buildCard(makeItem({ parallel: {} }), 'he', LANGS)).toThrow(CardBuildError);
    expect(() => buildCard(makeItem({ parallel: { fr: ['x'] } }), 'fr', LANGS)).toThrow(
      /Unknown language/,
    );
  });
});
