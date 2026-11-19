import { orderNextCycle } from './cycle-order';
import { shuffle, type RngState } from './random';

/**
 * The shrinking-loop engine (PRD §6.2, §10.4): a pure reducer with no DOM or I/O. Cards are
 * identified by item id; the UI looks up the card content separately.
 */

export type LoopPhase = 'deciding' | 'revealed' | 'cycleBreak' | 'finished' | 'stopped';
export type CardSide = 'front' | 'back';
export type KnownMark = { id: number; cycle: number };

export type LoopState = {
  phase: LoopPhase;
  /** 1-based cycle number. */
  cycle: number;
  /** Card ids of the current cycle, in the order shown. */
  order: number[];
  /** Position of the current card in `order`. */
  index: number;
  side: CardSide;
  /** Whether the current card's hints are shown on the front (FR-L25). */
  hintsShown: boolean;
  /** "Don't know" cards collected for the next cycle. */
  nextCycle: number[];
  /** Cards marked Know in this loop, with the cycle they were marked in. */
  known: KnownMark[];
  totalCards: number;
  rng: RngState;
};

export type LoopAction =
  | { type: 'KNOW' }
  | { type: 'DONT_KNOW' }
  | { type: 'TOGGLE_HINTS' }
  | { type: 'FLIP' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'CONTINUE' }
  | { type: 'STOP' };

export type LoopActionType = LoopAction['type'];

/** Starts a loop: cycle 1 is every card, shuffled. */
export function createLoop(cardIds: readonly number[], seed: RngState): LoopState {
  const unique = [...new Set(cardIds)];
  if (unique.length === 0) throw new Error('A loop needs at least one card');
  const [order, rng] = shuffle(unique, seed);
  return {
    phase: 'deciding',
    cycle: 1,
    order,
    index: 0,
    side: 'front',
    hintsShown: false,
    nextCycle: [],
    known: [],
    totalCards: unique.length,
    rng,
  };
}

/** Moves past the current card: the next card, a cycle break, or the end of the loop. */
function advance(state: LoopState): LoopState {
  const index = state.index + 1;
  if (index < state.order.length) {
    return { ...state, index, phase: 'deciding', side: 'front', hintsShown: false };
  }
  return {
    ...state,
    index: state.order.length,
    phase: state.nextCycle.length > 0 ? 'cycleBreak' : 'finished',
    side: 'front',
    hintsShown: false,
  };
}

/**
 * The answer already given to a card in the current cycle (PRD FR-L29a): Know, Don't know, or null
 * when it hasn't been answered yet. Derived from `known` and `nextCycle`, so it can't drift.
 */
export function answerOf(state: LoopState, id: number): 'know' | 'dontKnow' | null {
  if (state.known.some((k) => k.id === id && k.cycle === state.cycle)) return 'know';
  if (state.nextCycle.includes(id)) return 'dontKnow';
  return null;
}

/** Which actions are allowed right now (drives the button states in PRD FR-L24). */
export function canDispatch(state: LoopState, type: LoopActionType): boolean {
  const onCard = state.phase === 'deciding' || state.phase === 'revealed';
  switch (type) {
    case 'KNOW':
    case 'DONT_KNOW':
      return state.phase === 'deciding';
    case 'TOGGLE_HINTS':
      // A toggle while the front is showing (the back always shows the hints).
      return onCard && state.side === 'front';
    case 'FLIP':
      return onCard;
    case 'NEXT':
      // After Don't know, or on a card answered earlier (reached with Back, FR-L29a).
      return (
        state.phase === 'revealed' ||
        (state.phase === 'deciding' && answerOf(state, currentId(state)) !== null)
      );
    case 'BACK':
      // Card by card to the first card of this cycle; from the cycle break or the summary to its
      // last card. Earlier cycles are out of reach.
      return (
        (onCard && state.index > 0) || state.phase === 'cycleBreak' || state.phase === 'finished'
      );
    case 'CONTINUE':
      return state.phase === 'cycleBreak';
    case 'STOP':
      return onCard || state.phase === 'cycleBreak';
  }
}

export function loopReducer(state: LoopState, action: LoopAction): LoopState {
  if (!canDispatch(state, action.type)) return state;
  switch (action.type) {
    case 'KNOW': {
      // A first answer, or a change from Don't know on a card reached with Back (FR-L29a).
      const id = currentId(state);
      if (answerOf(state, id) === 'know') return advance(state);
      return advance({
        ...state,
        known: [...state.known, { id, cycle: state.cycle }],
        nextCycle: state.nextCycle.filter((n) => n !== id),
      });
    }
    case 'DONT_KNOW': {
      const id = currentId(state);
      const answer = answerOf(state, id);
      return {
        ...state,
        known:
          answer === 'know'
            ? state.known.filter((k) => !(k.id === id && k.cycle === state.cycle))
            : state.known,
        nextCycle: answer === 'dontKnow' ? state.nextCycle : [...state.nextCycle, id],
        phase: 'revealed',
        side: 'back',
      };
    }
    case 'TOGGLE_HINTS':
      return { ...state, hintsShown: !state.hintsShown };
    case 'FLIP':
      return { ...state, side: state.side === 'front' ? 'back' : 'front' };
    case 'NEXT':
      return advance(state);
    case 'BACK': {
      // The card always arrives front side up, hints hidden (FR-L29a).
      const from = state.phase === 'cycleBreak' || state.phase === 'finished';
      return {
        ...state,
        index: (from ? state.order.length : state.index) - 1,
        phase: 'deciding',
        side: 'front',
        hintsShown: false,
      };
    }
    case 'CONTINUE': {
      const [order, rng] = orderNextCycle(state.nextCycle, state.order, state.rng);
      return {
        ...state,
        cycle: state.cycle + 1,
        order,
        index: 0,
        nextCycle: [],
        phase: 'deciding',
        side: 'front',
        hintsShown: false,
        rng,
      };
    }
    case 'STOP':
      return { ...state, phase: 'stopped' };
  }
}

function currentId(state: LoopState): number {
  return state.order[state.index] as number;
}

/** The card on screen, or null outside the deciding/revealed phases. */
export function currentCardId(state: LoopState): number | null {
  if (state.phase !== 'deciding' && state.phase !== 'revealed') return null;
  return state.order[state.index] ?? null;
}

/** Header progress: "Cycle 2 · Card 1/3 · 2 known" (FR-L23). */
export function loopProgress(state: LoopState) {
  return {
    cycle: state.cycle,
    cardNumber: Math.min(state.index + 1, state.order.length),
    cycleSize: state.order.length,
    knownCount: state.known.length,
    /** Cards left for the next cycle (shown on the cycle break). */
    remaining: state.nextCycle.length,
  };
}

/** End-of-loop summary (FR-L32). */
export function loopSummary(state: LoopState) {
  const alreadyKnew = state.known.filter((k) => k.cycle === 1).length;
  return {
    totalCards: state.totalCards,
    cycles: state.cycle,
    alreadyKnew,
    learnedHere: state.known.length - alreadyKnew,
  };
}
