/**
 * Text helpers (PRD §8.2).
 *
 * - `cleanText`: the stored/display form: NFC, trimmed, internal whitespace collapsed.
 * - `normalize`: the matching key used for uniqueness and merges (never shown).
 */

const WHITESPACE = /\s+/gu;
/** Hebrew niqqud and cantillation marks (U+0591–U+05C7), removed for matching. */
const HEBREW_MARKS = /[֑-ׇ]/gu;
const LEADING_PUNCTUATION = /^[\p{P}\p{S}\s]+/u;
const TRAILING_PUNCTUATION = /[\p{P}\p{S}\s]+$/u;

export function cleanText(value: string): string {
  return value.normalize('NFC').replace(WHITESPACE, ' ').trim();
}

export function normalize(value: string): string {
  const lowered = cleanText(value).toLowerCase().replace(HEBREW_MARKS, '');
  return lowered.replace(LEADING_PUNCTUATION, '').replace(TRAILING_PUNCTUATION, '');
}
