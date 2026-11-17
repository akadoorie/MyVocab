import { describe, expect, it } from 'vitest';
import { foreignLetters, hasForeignLetters } from './script';

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
