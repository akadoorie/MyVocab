import { describe, expect, it } from 'vitest';
import { foreignLetters, hasForeignLetters, isSupportedScript } from './script';

describe('foreignLetters', () => {
  it('finds a Hebrew letter inside English text', () => {
    expect(foreignLetters('A מeedle in a haystack', 'Latn')).toEqual(['מ']);
  });

  it('finds Latin letters inside Hebrew text', () => {
    expect(foreignLetters('מחט בערימת שחת x', 'Hebr')).toEqual(['x']);
  });

  it('ignores digits, punctuation, spaces and combining marks', () => {
    expect(hasForeignLetters("Don't stop - 100% (really)!", 'Latn')).toBe(false);
    expect(hasForeignLetters('שָׁלוֹם, 2026.', 'Hebr')).toBe(false);
  });

  it('accepts accented Latin letters', () => {
    expect(hasForeignLetters('Café déjà vu', 'Latn')).toBe(false);
  });

  it('returns each foreign letter once', () => {
    expect(foreignLetters('ממ', 'Latn')).toEqual(['מ']);
  });

  it('rejects an invalid script code', () => {
    expect(() => foreignLetters('x', 'latin}')).toThrow(/Invalid/);
  });
});

describe('isSupportedScript (D-027)', () => {
  it('accepts ISO 15924 codes that are Unicode script properties', () => {
    for (const code of ['Latn', 'Hebr', 'Arab', 'Cyrl', 'Grek', 'Deva', 'Hani', 'Thai'])
      expect(isSupportedScript(code)).toBe(true);
  });

  it('refuses unknown codes, mixtures and badly formed values', () => {
    for (const code of ['Abcd', 'Jpan', 'Kore', 'latn', 'LATN', 'Lat', 'Latn}', ''])
      expect(isSupportedScript(code)).toBe(false);
  });

  it('finds Latin letters inside Arabic text', () => {
    expect(foreignLetters('كتاب x', 'Arab')).toEqual(['x']);
    expect(foreignLetters('كِتَابٌ', 'Arab')).toEqual([]);
  });
});
