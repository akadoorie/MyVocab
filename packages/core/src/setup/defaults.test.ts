import { describe, expect, it } from 'vitest';
import {
  defaultFields,
  differsFromDefaults,
  isSameLanguage,
  resolveStartDefaults,
  type StartContext,
} from './defaults';

const ctx: StartContext = {
  settings: {
    defaults: { sourceLang: 'en', targetLang: 'he', topicId: null },
    sizeOptions: [10, 20, 30, 40, 50],
    defaultSize: 10,
    guestLoopSize: 5,
  },
  activeLanguages: ['en', 'he'],
  activeTopicIds: [1, 2],
  isGuest: false,
};

describe('resolveStartDefaults', () => {
  it('returns the PRD defaults: EN → HE, General, Words, 10', () => {
    expect(resolveStartDefaults(ctx)).toEqual({
      sourceLang: 'en',
      targetLang: 'he',
      topicId: null,
      size: 10,
    });
  });

  it('gives guests the fixed guest amount', () => {
    expect(resolveStartDefaults({ ...ctx, isGuest: true }).size).toBe(5);
  });

  it('falls back when a default language or topic is no longer active', () => {
    const r = resolveStartDefaults({
      ...ctx,
      settings: {
        ...ctx.settings,
        defaults: { ...ctx.settings.defaults, targetLang: 'fr', topicId: 9 },
      },
    });
    expect(r.targetLang).toBe('en');
    expect(r.topicId).toBeNull();
    const withTopic = resolveStartDefaults({
      ...ctx,
      settings: { ...ctx.settings, defaults: { ...ctx.settings.defaults, topicId: 2 } },
    });
    expect(withTopic.topicId).toBe(2);
  });

  it('uses the first size option when the default size is not offered', () => {
    expect(
      resolveStartDefaults({ ...ctx, settings: { ...ctx.settings, defaultSize: 15 } }).size,
    ).toBe(10);
  });

  it('throws without active languages or size options', () => {
    expect(() => resolveStartDefaults({ ...ctx, activeLanguages: [] })).toThrow();
    expect(() =>
      resolveStartDefaults({
        ...ctx,
        settings: { ...ctx.settings, sizeOptions: [], defaultSize: 3 },
      }),
    ).toThrow();
  });
});

describe('default vs selected styling', () => {
  const defaults = resolveStartDefaults(ctx);

  it('marks every field as default on a fresh start', () => {
    expect(defaultFields(defaults, defaults).size).toBe(4);
    expect(differsFromDefaults(defaults, defaults)).toBe(false);
  });

  it('marks changed fields as selected and offers a reset', () => {
    const choices = { ...defaults, size: 20, topicId: 1 };
    expect([...defaultFields(choices, defaults)].sort()).toEqual(['sourceLang', 'targetLang']);
    expect(differsFromDefaults(choices, defaults)).toBe(true);
  });

  it('detects the same-language (explanation) case', () => {
    expect(isSameLanguage({ sourceLang: 'en', targetLang: 'en' })).toBe(true);
    expect(isSameLanguage(defaults)).toBe(false);
  });
});
