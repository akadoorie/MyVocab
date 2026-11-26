import { beforeEach, describe, expect, it } from 'vitest';
import { isFlipLearned, markFlipLearned } from './flip-hint';

describe('the Flip hint record (D-136)', () => {
  beforeEach(() => window.localStorage.clear());

  it('is unlearned on a new device and learned after the first Flip', () => {
    expect(isFlipLearned()).toBe(false);
    markFlipLearned();
    expect(isFlipLearned()).toBe(true);
  });

  it('treats anything other than the saved flag as unlearned', () => {
    window.localStorage.setItem('myvocab.flipHint.learned', 'yes');
    expect(isFlipLearned()).toBe(false);
  });
});
