import { describe, expect, it } from 'vitest';
import { MAX_RESHUFFLES, orderNextCycle, sameRelativeOrder } from './cycle-order';
import { nextRandom, randomSeed, shuffle } from './random';
import {
  answerOf,
  canDispatch,
  createLoop,
  currentCardId,
  loopProgress,
  loopReducer,
  loopSummary,
  type LoopAction,
  type LoopState,
} from './reducer';

const A = (type: LoopAction['type']): LoopAction => ({ type });
const run = (state: LoopState, ...types: LoopAction['type'][]) =>
  types.reduce((s, t) => loopReducer(s, A(t)), state);

describe('random', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const [a, s1] = nextRandom(42);
    const [b] = nextRandom(42);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(nextRandom(s1)[0]).not.toBe(a);
  });

  it('shuffles without losing or duplicating items', () => {
    const [out] = shuffle([1, 2, 3, 4, 5], 7);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('produces a 32-bit seed', () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});

describe('cycle order (FR-L21)', () => {
  it('compares the relative order of shared cards', () => {
    expect(sameRelativeOrder([3, 1], [1, 2, 3])).toBe(false);
    expect(sameRelativeOrder([1, 3], [1, 2, 3])).toBe(true);
    expect(sameRelativeOrder([1], [1, 2])).toBe(false);
    expect(sameRelativeOrder([9, 8], [1, 2])).toBe(false);
  });

  it('always differs from the previous relative order when there are 2+ cards', () => {
    const previous = [10, 20, 30, 40];
    for (let seed = 0; seed < 500; seed++) {
      const [order] = orderNextCycle([10, 30, 40], previous, seed);
      expect(sameRelativeOrder(order, previous)).toBe(false);
      expect([...order].sort()).toEqual([10, 30, 40]);
    }
  });

  it('falls back to a rotation after too many identical shuffles', () => {
    // Find a seed whose first 10 shuffles of [1, 2] all keep the order [1, 2].
    let seed = 0;
    for (; seed < 1_000_000; seed++) {
      let s = seed;
      let same = 0;
      for (let i = 0; i < MAX_RESHUFFLES; i++) {
        let out: number[];
        [out, s] = shuffle([1, 2], s);
        if (out[0] === 1) same++;
      }
      if (same === MAX_RESHUFFLES) break;
    }
    const [order] = orderNextCycle([1, 2], [1, 2], seed);
    expect(order).toEqual([2, 1]);
  });

  it('keeps a single card as is', () => {
    expect(orderNextCycle([5], [5, 6], 1)[0]).toEqual([5]);
  });
});

describe('createLoop', () => {
  it('starts cycle 1 with every card, shuffled, front side up, hints hidden', () => {
    const s = createLoop([1, 2, 3, 4, 5], 123);
    expect(s).toMatchObject({
      phase: 'deciding',
      cycle: 1,
      index: 0,
      side: 'front',
      hintsShown: false,
    });
    expect([...s.order].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(s.totalCards).toBe(5);
    expect(createLoop([1, 2, 3, 4, 5], 123).order).toEqual(s.order);
  });

  it('removes duplicate ids and refuses an empty loop', () => {
    expect(createLoop([1, 1, 2], 1).totalCards).toBe(2);
    expect(() => createLoop([], 1)).toThrow();
  });
});

describe('Know and Don’t know', () => {
  it('Know records the card in this cycle and shows the next card immediately', () => {
    const s0 = createLoop([1, 2, 3], 9);
    const first = currentCardId(s0);
    const s1 = run(s0, 'FLIP', 'TOGGLE_HINTS', 'KNOW');
    expect(s1.known).toEqual([{ id: first, cycle: 1 }]);
    expect(s1).toMatchObject({ index: 1, phase: 'deciding', side: 'front', hintsShown: false });
  });

  it('Don’t know flips to the back, reveals, and queues the card for the next cycle', () => {
    const s0 = createLoop([1, 2, 3], 9);
    const s1 = run(s0, 'DONT_KNOW');
    expect(s1).toMatchObject({ phase: 'revealed', side: 'back', index: 0 });
    expect(s1.nextCycle).toEqual([currentCardId(s0)]);
    expect(canDispatch(s1, 'KNOW')).toBe(false);
    expect(canDispatch(s1, 'DONT_KNOW')).toBe(false);
    expect(canDispatch(s1, 'NEXT')).toBe(true);
    expect(run(s1, 'KNOW')).toBe(s1); // ignored
  });

  it('Next is only enabled after Don’t know and moves to the next card front side up', () => {
    const s0 = createLoop([1, 2], 3);
    expect(canDispatch(s0, 'NEXT')).toBe(false);
    expect(run(s0, 'NEXT')).toBe(s0);
    const s2 = run(s0, 'DONT_KNOW', 'FLIP', 'NEXT');
    expect(s2).toMatchObject({ index: 1, phase: 'deciding', side: 'front', hintsShown: false });
  });

  it('Know works from the back side too', () => {
    const s = run(createLoop([1, 2], 3), 'FLIP', 'KNOW');
    expect(s.known).toHaveLength(1);
  });
});

describe('Flip and Hints never affect grading', () => {
  it('Flip toggles the side any number of times in both phases', () => {
    const s0 = createLoop([1, 2], 5);
    expect(run(s0, 'FLIP').side).toBe('back');
    expect(run(s0, 'FLIP', 'FLIP', 'FLIP', 'FLIP').side).toBe('front');
    const revealed = run(s0, 'DONT_KNOW');
    expect(run(revealed, 'FLIP').side).toBe('front');
    expect(run(revealed, 'FLIP', 'FLIP').side).toBe('back');
    const flipped = run(s0, 'FLIP', 'FLIP', 'FLIP');
    expect(flipped.known).toEqual(s0.known);
    expect(flipped.nextCycle).toEqual(s0.nextCycle);
    expect(flipped.phase).toBe('deciding');
  });

  it('Hints toggles on the front only, survives flips and resets on the next card', () => {
    const s0 = createLoop([1, 2], 5);
    expect(canDispatch(run(s0, 'FLIP'), 'TOGGLE_HINTS')).toBe(false);
    expect(run(s0, 'FLIP', 'TOGGLE_HINTS').hintsShown).toBe(false);
    const shown = run(s0, 'TOGGLE_HINTS');
    expect(shown.hintsShown).toBe(true);
    expect(canDispatch(shown, 'TOGGLE_HINTS')).toBe(true);
    const hidden = run(shown, 'TOGGLE_HINTS');
    expect(hidden.hintsShown).toBe(false); // back to exactly as before
    expect(hidden).toEqual(s0);
    expect(run(shown, 'FLIP', 'FLIP').hintsShown).toBe(true);
    expect(shown.known).toEqual([]);
    expect(shown.phase).toBe('deciding');
    expect(run(shown, 'KNOW').hintsShown).toBe(false);
  });

  it('Hints is still available on the front after Don’t know', () => {
    const s = run(createLoop([1, 2], 5), 'DONT_KNOW', 'FLIP');
    expect(canDispatch(s, 'TOGGLE_HINTS')).toBe(true);
    expect(run(s, 'TOGGLE_HINTS').hintsShown).toBe(true);
  });
});

describe('cycles and the end of the loop', () => {
  it('a cycle with Don’t know cards ends in a cycle break, then Continue starts the next cycle', () => {
    const s0 = createLoop([1, 2, 3], 11);
    const [a, b, c] = s0.order as [number, number, number];
    const brk = run(s0, 'KNOW', 'DONT_KNOW', 'NEXT', 'DONT_KNOW', 'NEXT');
    expect(brk.phase).toBe('cycleBreak');
    expect(loopProgress(brk).remaining).toBe(2);
    expect(currentCardId(brk)).toBeNull();
    const c2 = run(brk, 'CONTINUE');
    expect(c2).toMatchObject({ phase: 'deciding', cycle: 2, index: 0, nextCycle: [] });
    expect([...c2.order].sort()).toEqual([b, c].sort());
    expect(c2.order).not.toEqual([b, c]); // order differs from the previous cycle
    expect(c2.known).toEqual([{ id: a, cycle: 1 }]);
  });

  it('a cycle with only Know ends the loop, with a summary', () => {
    const s0 = createLoop([1, 2, 3], 4);
    const c2 = run(s0, 'KNOW', 'DONT_KNOW', 'NEXT', 'KNOW', 'CONTINUE');
    const done = run(c2, 'KNOW');
    expect(done.phase).toBe('finished');
    expect(loopSummary(done)).toEqual({ totalCards: 3, cycles: 2, alreadyKnew: 2, learnedHere: 1 });
    expect(canDispatch(done, 'STOP')).toBe(false);
  });

  it('reports header progress', () => {
    const s = run(createLoop([1, 2, 3], 4), 'KNOW');
    expect(loopProgress(s)).toEqual({
      cycle: 1,
      cardNumber: 2,
      cycleSize: 3,
      knownCount: 1,
      remaining: 0,
    });
  });
});

describe('Back and changing an answer (FR-L29a)', () => {
  it('goes back card by card, front side up with hints hidden, to the first card of the cycle', () => {
    const s0 = createLoop([1, 2, 3], 8);
    expect(canDispatch(s0, 'BACK')).toBe(false);
    const s = run(s0, 'KNOW', 'DONT_KNOW');
    expect(s).toMatchObject({ index: 1, phase: 'revealed', side: 'back' });
    const back = run(s, 'BACK');
    expect(back).toMatchObject({ index: 0, phase: 'deciding', side: 'front', hintsShown: false });
    expect(canDispatch(back, 'BACK')).toBe(false);
    expect(back.known).toEqual(s.known); // looking back changes nothing
    expect(back.nextCycle).toEqual(s.nextCycle);
  });

  it('Next steps forward over answered cards and stops at the first unanswered card', () => {
    const s0 = createLoop([1, 2, 3], 8);
    const back = run(s0, 'KNOW', 'DONT_KNOW', 'NEXT', 'BACK', 'BACK');
    expect(back.index).toBe(0);
    expect(answerOf(back, s0.order[0]!)).toBe('know');
    expect(canDispatch(back, 'NEXT')).toBe(true);
    const second = run(back, 'NEXT');
    expect(second).toMatchObject({ index: 1, phase: 'deciding', side: 'front' });
    expect(answerOf(second, s0.order[1]!)).toBe('dontKnow');
    const third = run(second, 'NEXT');
    expect(third.index).toBe(2);
    expect(answerOf(third, s0.order[2]!)).toBeNull();
    expect(canDispatch(third, 'NEXT')).toBe(false);
  });

  it('Know replaces Don’t know: the card leaves the next cycle and the session moves on', () => {
    const s0 = createLoop([1, 2, 3], 8);
    const s = run(s0, 'DONT_KNOW', 'NEXT', 'BACK', 'KNOW');
    expect(s.known).toEqual([{ id: s0.order[0], cycle: 1 }]);
    expect(s.nextCycle).toEqual([]);
    expect(s).toMatchObject({ index: 1, phase: 'deciding' });
  });

  it('Don’t know replaces Know, reveals the answer, and never queues a card twice', () => {
    const s0 = createLoop([1, 2, 3], 8);
    const s = run(s0, 'KNOW', 'BACK', 'DONT_KNOW');
    expect(s.known).toEqual([]);
    expect(s.nextCycle).toEqual([s0.order[0]]);
    expect(s).toMatchObject({ index: 0, phase: 'revealed', side: 'back' });
    const again = run(s, 'NEXT', 'BACK', 'DONT_KNOW');
    expect(again.nextCycle).toEqual([s0.order[0]]);
  });

  it('Know on a card already known just moves on', () => {
    const s0 = createLoop([1, 2, 3], 8);
    const s = run(s0, 'KNOW', 'BACK', 'KNOW');
    expect(s.known).toEqual([{ id: s0.order[0], cycle: 1 }]);
    expect(s.index).toBe(1);
  });

  it('from the cycle break: back to the last card, and a changed answer updates the count', () => {
    const s = run(createLoop([1, 2], 8), 'DONT_KNOW', 'NEXT', 'KNOW');
    expect(s.phase).toBe('cycleBreak');
    expect(loopProgress(s).remaining).toBe(1);
    const back = run(s, 'BACK');
    expect(back).toMatchObject({ index: 1, phase: 'deciding', side: 'front' });
    const brk = run(back, 'DONT_KNOW', 'NEXT');
    expect(brk.phase).toBe('cycleBreak');
    expect(loopProgress(brk).remaining).toBe(2);
  });

  it('from the summary: back to the last card; Don’t know turns the end into a cycle break', () => {
    const s0 = createLoop([1, 2], 8);
    const done = run(s0, 'KNOW', 'KNOW');
    expect(done.phase).toBe('finished');
    const back = run(done, 'BACK');
    expect(back).toMatchObject({ index: 1, phase: 'deciding' });
    const brk = run(back, 'DONT_KNOW', 'NEXT');
    expect(brk.phase).toBe('cycleBreak');
    expect(brk.nextCycle).toEqual([s0.order[1]]);
    expect(brk.known).toEqual([{ id: s0.order[0], cycle: 1 }]);
  });

  it('cards of earlier cycles are out of reach', () => {
    const s = run(createLoop([1, 2], 8), 'KNOW', 'DONT_KNOW', 'NEXT', 'CONTINUE');
    expect(s).toMatchObject({ cycle: 2, index: 0 });
    expect(canDispatch(s, 'BACK')).toBe(false);
    expect(answerOf(s, s.order[0]!)).toBeNull(); // a new cycle starts unanswered
  });
});

describe('Know · ask again (FR-L27a)', () => {
  it('acts like Know in the session, with an "again" mark', () => {
    const s0 = createLoop([1, 2, 3], 9);
    const first = currentCardId(s0)!;
    const s1 = run(s0, 'FLIP', 'KNOW_AGAIN');
    expect(s1.known).toEqual([{ id: first, cycle: 1, again: true }]);
    expect(s1).toMatchObject({ index: 1, phase: 'deciding', side: 'front' });
    expect(answerOf(s1, first)).toBe('knowAgain');
    expect(loopProgress(s1).knownCount).toBe(1);
  });

  it('is allowed exactly when Know is', () => {
    const s0 = createLoop([1, 2], 9);
    expect(canDispatch(s0, 'KNOW_AGAIN')).toBe(true);
    const revealed = run(s0, 'DONT_KNOW');
    expect(canDispatch(revealed, 'KNOW_AGAIN')).toBe(false);
    expect(run(revealed, 'KNOW_AGAIN')).toBe(revealed);
  });

  it('counts in the summary like Know', () => {
    const done = run(createLoop([1, 2], 9), 'KNOW', 'KNOW_AGAIN');
    expect(done.phase).toBe('finished');
    expect(loopSummary(done)).toEqual({ totalCards: 2, cycles: 1, alreadyKnew: 2, learnedHere: 0 });
  });

  it('switches with Know on a card reached with Back, keeping one mark', () => {
    const s0 = createLoop([1, 2, 3], 8);
    const id = s0.order[0]!;
    const toAgain = run(s0, 'KNOW', 'BACK', 'KNOW_AGAIN');
    expect(toAgain.known).toEqual([{ id, cycle: 1, again: true }]);
    expect(toAgain.index).toBe(1);
    const toKnow = run(toAgain, 'BACK', 'KNOW');
    expect(toKnow.known).toEqual([{ id, cycle: 1 }]);
    expect(run(toAgain, 'BACK', 'KNOW_AGAIN').known).toEqual(toAgain.known); // same answer
  });

  it('replaces Don’t know, and Don’t know replaces it', () => {
    const s0 = createLoop([1, 2, 3], 8);
    const id = s0.order[0]!;
    const s = run(s0, 'DONT_KNOW', 'NEXT', 'BACK', 'KNOW_AGAIN');
    expect(s.known).toEqual([{ id, cycle: 1, again: true }]);
    expect(s.nextCycle).toEqual([]);
    const back = run(s, 'BACK', 'DONT_KNOW');
    expect(back.known).toEqual([]);
    expect(back.nextCycle).toEqual([id]);
    expect(back.phase).toBe('revealed');
  });
});

describe('Stop', () => {
  it('ends the loop and ignores later actions', () => {
    const s = run(createLoop([1, 2], 2), 'KNOW', 'STOP');
    expect(s.phase).toBe('stopped');
    expect(s.known).toHaveLength(1);
    expect(run(s, 'KNOW', 'FLIP', 'BACK', 'CONTINUE')).toBe(s);
    expect(currentCardId(s)).toBeNull();
  });

  it('is allowed at a cycle break', () => {
    const s = run(createLoop([1], 2), 'DONT_KNOW', 'NEXT');
    expect(s.phase).toBe('cycleBreak');
    expect(run(s, 'STOP').phase).toBe('stopped');
  });
});
