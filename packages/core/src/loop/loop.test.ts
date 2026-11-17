import { describe, expect, it } from 'vitest';
import { MAX_RESHUFFLES, orderNextCycle, sameRelativeOrder } from './cycle-order';
import { nextRandom, randomSeed, shuffle } from './random';
import {
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
    const s1 = run(s0, 'FLIP', 'SHOW_HINTS', 'KNOW');
    expect(s1.known).toEqual([{ id: first, cycle: 1 }]);
    expect(s1.lastKnow).toEqual({ id: first, cycle: 1 });
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

  it('Hints works only on the front, is one-way, survives flips and resets on the next card', () => {
    const s0 = createLoop([1, 2], 5);
    expect(canDispatch(run(s0, 'FLIP'), 'SHOW_HINTS')).toBe(false);
    expect(run(s0, 'FLIP', 'SHOW_HINTS').hintsShown).toBe(false);
    const shown = run(s0, 'SHOW_HINTS');
    expect(shown.hintsShown).toBe(true);
    expect(canDispatch(shown, 'SHOW_HINTS')).toBe(false);
    expect(run(shown, 'FLIP', 'FLIP').hintsShown).toBe(true);
    expect(shown.known).toEqual([]);
    expect(shown.phase).toBe('deciding');
    expect(run(shown, 'KNOW').hintsShown).toBe(false);
  });

  it('Hints is still available on the front after Don’t know', () => {
    const s = run(createLoop([1, 2], 5), 'DONT_KNOW', 'FLIP');
    expect(canDispatch(s, 'SHOW_HINTS')).toBe(true);
    expect(run(s, 'SHOW_HINTS').hintsShown).toBe(true);
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

describe('Undo (FR-L27)', () => {
  it('during a cycle: the card returns to the next cycle', () => {
    const s0 = createLoop([1, 2, 3], 8);
    const first = currentCardId(s0);
    const s1 = run(s0, 'KNOW', 'UNDO_KNOW');
    expect(s1.known).toEqual([]);
    expect(s1.nextCycle).toEqual([first]);
    expect(s1.lastKnow).toBeNull();
    expect(s1.phase).toBe('deciding');
    expect(currentCardId(s1)).toBe(s0.order[1]);
  });

  it('at a cycle break: the count updates', () => {
    const s = run(createLoop([1, 2], 8), 'DONT_KNOW', 'NEXT', 'KNOW');
    expect(s.phase).toBe('cycleBreak');
    expect(loopProgress(s).remaining).toBe(1);
    const undone = run(s, 'UNDO_KNOW');
    expect(undone.phase).toBe('cycleBreak');
    expect(loopProgress(undone).remaining).toBe(2);
  });

  it('after the last Know: the summary turns back into a cycle break with that card', () => {
    const s0 = createLoop([1, 2], 8);
    const done = run(s0, 'KNOW', 'KNOW');
    expect(done.phase).toBe('finished');
    const undone = run(done, 'UNDO_KNOW');
    expect(undone.phase).toBe('cycleBreak');
    expect(undone.nextCycle).toEqual([s0.order[1]]);
    expect(undone.known).toEqual([{ id: s0.order[0], cycle: 1 }]);
  });

  it('only the most recent Know can be undone', () => {
    const s0 = createLoop([1, 2, 3], 8);
    const s = run(s0, 'KNOW', 'KNOW', 'UNDO_KNOW');
    expect(s.known).toEqual([{ id: s0.order[0], cycle: 1 }]);
    expect(canDispatch(s, 'UNDO_KNOW')).toBe(false);
    expect(run(s, 'UNDO_KNOW')).toBe(s);
  });

  it('still works after Continue started the next cycle', () => {
    const s = run(createLoop([1, 2], 8), 'DONT_KNOW', 'NEXT', 'KNOW', 'CONTINUE', 'UNDO_KNOW');
    expect(s.cycle).toBe(2);
    expect(s.nextCycle).toHaveLength(1);
  });
});

describe('Stop', () => {
  it('ends the loop and ignores later actions', () => {
    const s = run(createLoop([1, 2], 2), 'KNOW', 'STOP');
    expect(s.phase).toBe('stopped');
    expect(s.known).toHaveLength(1);
    expect(run(s, 'KNOW', 'FLIP', 'UNDO_KNOW', 'CONTINUE')).toBe(s);
    expect(currentCardId(s)).toBeNull();
  });

  it('is allowed at a cycle break', () => {
    const s = run(createLoop([1], 2), 'DONT_KNOW', 'NEXT');
    expect(s.phase).toBe('cycleBreak');
    expect(run(s, 'STOP').phase).toBe('stopped');
  });
});
