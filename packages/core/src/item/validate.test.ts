import { describe, expect, it } from 'vitest';
import { LANGS } from '../test-fixtures';
import { itemIdentityKey } from './identity';
import {
  mixedScriptWarnings,
  multipleMeaningsWarnings,
  validateItem,
  type ItemInput,
} from './validate';

const ctx = { languages: LANGS };
const base: ItemInput = {
  lang: 'en',
  text: 'Swift',
  type: 'word',
  translation: { he: ['מהיר', 'סנונית'] },
  explanation: ['Moving or able to move very fast', 'A small bird that flies very fast'],
  synonyms: ['fast', 'quick'],
  hints: ['He gave a swift reply.'],
};
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('validateItem: valid input', () => {
  it('accepts a full item and cleans whitespace', () => {
    const r = validateItem(
      { ...base, text: '  Swift  ', synonyms: [' fast ', 'quick', '  '] },
      ctx,
    );
    expect(r.errors).toEqual([]);
    expect(r.value.text).toBe('Swift');
    expect(r.value.synonyms).toEqual(['fast', 'quick']);
    expect(r.value.multipleMeanings).toBe(false);
  });

  it('defaults missing lists to empty and drops empty translation lists', () => {
    const r = validateItem(
      { lang: 'EN', text: 'Cat', type: 'WORD', translation: { he: ['  '] }, explanation: ['x'] },
      ctx,
    );
    expect(r.errors).toEqual([]);
    expect(r.value).toMatchObject({ lang: 'en', type: 'word', translation: {}, hints: [] });
  });
});

describe('validateItem: errors', () => {
  it('rejects a translation into the item own language', () => {
    const r = validateItem({ ...base, translation: { en: ['fast'], he: ['מהיר'] } }, ctx);
    expect(r.errors).toEqual([
      expect.objectContaining({ path: 'translation.en', code: 'SAME_LANGUAGE_TRANSLATION' }),
    ]);
    expect(r.value.translation).toEqual({ he: ['מהיר'] });
  });

  it('rejects a literal meaning in the item own language and keeps the others', () => {
    const r = validateItem({ ...base, literal: { en: ['fast'], he: ['מהיר'] } }, ctx);
    expect(r.errors).toEqual([
      expect.objectContaining({ path: 'literal.en', code: 'SAME_LANGUAGE_TRANSLATION' }),
    ]);
    expect(r.value.literal).toEqual({ he: ['מהיר'] });
  });

  it('rejects unknown languages for the item and for translations', () => {
    expect(codes(validateItem({ ...base, lang: 'fr' }, ctx).errors)).toContain('UNKNOWN_LANGUAGE');
    expect(codes(validateItem({ ...base, translation: { de: ['x'] } }, ctx).errors)).toEqual([
      'UNKNOWN_LANGUAGE',
    ]);
    expect(codes(validateItem({ ...base, translation: { '$.x': ['x'] } }, ctx).errors)).toEqual([
      'UNKNOWN_LANGUAGE',
    ]);
  });

  it('requires text (not just punctuation)', () => {
    expect(codes(validateItem({ ...base, text: '  ' }, ctx).errors)).toEqual(['REQUIRED']);
    expect(codes(validateItem({ ...base, text: '?!' }, ctx).errors)).toEqual(['REQUIRED']);
  });

  it('rejects an invalid type', () => {
    expect(codes(validateItem({ ...base, type: 'synonym' }, ctx).errors)).toEqual(['INVALID_TYPE']);
  });

  it('enforces text and entry lengths', () => {
    expect(codes(validateItem({ ...base, text: 'a'.repeat(201) }, ctx).errors)).toEqual([
      'TOO_LONG',
    ]);
    const r = validateItem({ ...base, synonyms: ['a'.repeat(101)] }, ctx);
    expect(r.errors).toEqual([expect.objectContaining({ path: 'synonyms[0]', code: 'TOO_LONG' })]);
  });

  it('enforces the number of entries per list', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `hint ${i}`);
    expect(codes(validateItem({ ...base, hints: many(21) }, ctx).errors)).toEqual(['TOO_MANY']);
    expect(validateItem({ ...base, hints: many(20) }, ctx).errors).toEqual([]);
  });

  it('rejects entries containing the CSV list separator', () => {
    const r = validateItem({ ...base, hints: ['a | b'] }, ctx);
    expect(r.errors).toEqual([
      expect.objectContaining({ path: 'hints[0]', code: 'INVALID_CHARACTER' }),
    ]);
  });

  it('rejects duplicate entries using the normalized form', () => {
    const r = validateItem({ ...base, synonyms: ['Fast', 'fast!'] }, ctx);
    expect(r.errors).toEqual([expect.objectContaining({ path: 'synonyms[1]', code: 'DUPLICATE' })]);
  });
});

describe('warnings', () => {
  it('warns when multiple meanings is on but a list has one entry', () => {
    const r = validateItem(
      { ...base, multipleMeanings: true, translation: { he: ['מהיר'] }, explanation: ['fast'] },
      ctx,
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.path)).toEqual(['translation.he', 'explanation']);
  });

  it('does not warn when multiple meanings is off', () => {
    const r = validateItem({ ...base, multipleMeanings: false, explanation: ['fast'] }, ctx);
    expect(multipleMeaningsWarnings(r.value)).toEqual([]);
  });

  it('warns about mixed scripts in the text, own-language lists and translations', () => {
    const r = validateItem(
      {
        ...base,
        text: 'A מeedle in a haystack',
        type: 'expr',
        hints: ['ok', 'bad ש'],
        translation: { he: ['מחט בערימת שחת x'] },
      },
      ctx,
    );
    expect(r.warnings.filter((w) => w.code === 'MIXED_SCRIPT').map((w) => w.path)).toEqual([
      'text',
      'hints[1]',
      'translation.he[0]',
    ]);
  });

  it('skips the script check for languages without script info', () => {
    const item = validateItem(base, ctx).value;
    expect(mixedScriptWarnings({ ...item, lang: 'xx' }, LANGS)).toEqual([]);
  });
});

describe('itemIdentityKey', () => {
  it('matches the same item regardless of case, spacing and punctuation', () => {
    expect(itemIdentityKey('en', '  Swift! ', 'word')).toBe(itemIdentityKey('en', 'swift', 'word'));
  });

  it('distinguishes language and type', () => {
    expect(itemIdentityKey('en', 'Swift', 'word')).not.toBe(itemIdentityKey('en', 'Swift', 'expr'));
    expect(itemIdentityKey('en', 'Swift', 'word')).not.toBe(itemIdentityKey('he', 'Swift', 'word'));
  });
});
