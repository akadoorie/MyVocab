import { readFlag, writeFlag } from '../../lib/storage';

/**
 * The Flip hint (D-136): until Flip has been used once on this device, a waiting card front shows
 * a hand tapping Flip while the card starts to turn. "I don't know" doesn't count: it shows the
 * answer but doesn't teach the button.
 */
const KEY = 'myvocab.flipHint.learned';

/** The first hint on a card comes after this long without a tap or key. */
export const FLIP_HINT_FIRST_MS = 2500;
/** Then it repeats this long after the previous one ended. */
export const FLIP_HINT_REPEAT_MS = 6000;

export function isFlipLearned(): boolean {
  return readFlag('local', KEY);
}

export function markFlipLearned(): void {
  writeFlag('local', KEY);
}
