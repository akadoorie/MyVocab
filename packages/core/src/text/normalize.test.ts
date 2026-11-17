import { describe, expect, it } from 'vitest';
import { cleanText, normalize } from './normalize';

describe('cleanText', () => {
  it('trims and collapses internal whitespace', () => {
    expect(cleanText('  A   needle \t in\n a haystack ')).toBe('A needle in a haystack');
  });

  it('applies Unicode NFC', () => {
    const decomposed = 'é'; // e + combining acute
    expect(cleanText(decomposed)).toBe('é');
  });

  it('keeps case and punctuation (it is the display form)', () => {
    expect(cleanText('Hello, World!')).toBe('Hello, World!');
  });
});

describe('normalize', () => {
  it('lowercases and strips leading/trailing punctuation', () => {
    expect(normalize('  "Swift!" ')).toBe('swift');
    expect(normalize('...A needle in a haystack?')).toBe('a needle in a haystack');
  });

  it('keeps internal punctuation', () => {
    expect(normalize("Don't")).toBe("don't");
  });

  it('removes Hebrew niqqud so pointed and unpointed text match', () => {
    expect(normalize('שָׁלוֹם')).toBe(normalize('שלום'));
    expect(normalize('שָׁלוֹם')).toBe('שלום');
  });

  it('treats NFC and NFD forms as equal', () => {
    expect(normalize('Café')).toBe(normalize('Café'));
  });

  it('returns an empty string for punctuation-only input', () => {
    expect(normalize(' ?! ')).toBe('');
  });
});
