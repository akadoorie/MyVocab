/**
 * Text helpers (PRD §8.2).
 *
 * - `cleanText`: the stored/display form: NFC, trimmed, internal whitespace collapsed.
 * - `normalize`: the matching key used for uniqueness and merges (never shown).
 */

const WHITESPACE = /\s+/gu;
/** Hebrew niqqud and cantillation marks (U+0591–U+05C7), removed for matching. */
const HEBREW_MARKS = /[֑-ׇ]/gu;
/**
 * Arabic short-vowel and Quranic marks (harakat, superscript alef, small high signs), removed for
 * matching like Hebrew niqqud (D-027).
 */
const ARABIC_MARKS =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/gu;
/** The Arabic tatweel (U+0640), a stretching stroke inside words, also removed for matching. */
const ARABIC_TATWEEL = /\u0640/gu;
const LEADING_PUNCTUATION = /^[\p{P}\p{S}\s]+/u;
const TRAILING_PUNCTUATION = /[\p{P}\p{S}\s]+$/u;

export function cleanText(value: string): string {
  return value.normalize('NFC').replace(WHITESPACE, ' ').trim();
}

export function normalize(value: string): string {
  const lowered = cleanText(value)
    .toLowerCase()
    .replace(HEBREW_MARKS, '')
    .replace(ARABIC_MARKS, '')
    .replace(ARABIC_TATWEEL, '');
  return lowered.replace(LEADING_PUNCTUATION, '').replace(TRAILING_PUNCTUATION, '');
}
