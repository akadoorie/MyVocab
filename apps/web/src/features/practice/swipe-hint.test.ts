import { beforeEach, describe, expect, it } from 'vitest';
import {
  markSwipeLearned,
  pickSwipeHint,
  readSwipeHintSeen,
  recordSwipeHintShown,
  SWIPE_HINT_TIMES,
  type SwipeHintSeen,
} from './swipe-hint';

const fresh: SwipeHintSeen = { left: 0, right: 0, leftLearned: false, rightLearned: false };
const only = (dir: 'left' | 'right') => ({ left: dir === 'left', right: dir === 'right' });
const both = { left: true, right: true };

describe('pickSwipeHint (D-135)', () => {
  it('shows the direction that is available: Next (left) after "I don\'t know" on card 1, Back (right) on card 2', () => {
    expect(pickSwipeHint(only('left'), fresh)).toBe('left');
    expect(pickSwipeHint(only('right'), fresh)).toBe('right');
  });

  it('shows both together when both are available and unlearned', () => {
    expect(pickSwipeHint(both, fresh)).toBe('both');
    expect(pickSwipeHint(both, { ...fresh, right: SWIPE_HINT_TIMES })).toBe('left');
  });

  it('nothing when no direction is available', () => {
    expect(pickSwipeHint({ left: false, right: false }, fresh)).toBeNull();
  });

  it(`stops a direction after ${SWIPE_HINT_TIMES} times, or once the user swiped that way`, () => {
    expect(pickSwipeHint(only('left'), { ...fresh, left: SWIPE_HINT_TIMES })).toBeNull();
    expect(pickSwipeHint(only('left'), { ...fresh, left: SWIPE_HINT_TIMES - 1 })).toBe('left');
    expect(pickSwipeHint(only('right'), { ...fresh, rightLearned: true })).toBeNull();
    expect(pickSwipeHint(both, { ...fresh, leftLearned: true })).toBe('right');
  });

  it('leaves out a direction already shown on this card', () => {
    expect(pickSwipeHint(both, fresh, new Set(['right']))).toBe('left');
    expect(pickSwipeHint(only('right'), fresh, new Set(['right']))).toBeNull();
  });
});

describe('the device record', () => {
  beforeEach(() => window.localStorage.clear());

  it('counts each direction a hint showed, and remembers a learned direction', () => {
    expect(readSwipeHintSeen()).toEqual(fresh);
    recordSwipeHintShown('left');
    recordSwipeHintShown('both');
    markSwipeLearned('right');
    expect(readSwipeHintSeen()).toEqual({
      left: 2,
      right: 1,
      leftLearned: false,
      rightLearned: true,
    });
  });

  it('ignores a damaged record', () => {
    window.localStorage.setItem('myvocab.swipeHint', '{"left":"x"}');
    expect(readSwipeHintSeen()).toEqual(fresh);
  });
});
