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
  /** The most recent Know, which Undo can still reverse (FR-L27). */
  lastKnow: KnownMark | null;
  totalCards: number;
  rng: RngState;
};

export type LoopAction =
  | { type: 'KNOW' }
  | { type: 'DONT_KNOW' }
  | { type: 'SHOW_HINTS' }
  | { type: 'FLIP' }
  | { type: 'NEXT' }
  | { type: 'CONTINUE' }
  | { type: 'UNDO_KNOW' }
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
    lastKnow: null,
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

/** Which actions are allowed right now (drives the button states in PRD FR-L24). */
export function canDispatch(state: LoopState, type: LoopActionType): boolean {
  const onCard = state.phase === 'deciding' || state.phase === 'revealed';
  switch (type) {
    case 'KNOW':
    case 'DONT_KNOW':
      return state.phase === 'deciding';
    case 'SHOW_HINTS':
      return onCard && state.side === 'front' && !state.hintsShown;
    case 'FLIP':
      return onCard;
    case 'NEXT':
      return state.phase === 'revealed';
    case 'CONTINUE':
      return state.phase === 'cycleBreak';
    case 'UNDO_KNOW':
      return state.lastKnow !== null && state.phase !== 'stopped';
    case 'STOP':
      return onCard || state.phase === 'cycleBreak';
  }
}

export function loopReducer(state: LoopState, action: LoopAction): LoopState {
  if (!canDispatch(state, action.type)) return state;
  switch (action.type) {
    case 'KNOW': {
      const mark: KnownMark = { id: currentId(state), cycle: state.cycle };
      return advance({ ...state, known: [...state.known, mark], lastKnow: mark });
    }
    case 'DONT_KNOW':
      return {
        ...state,
        nextCycle: [...state.nextCycle, currentId(state)],
        phase: 'revealed',
        side: 'back',
      };
    case 'SHOW_HINTS':
      return { ...state, hintsShown: true };
    case 'FLIP':
      return { ...state, side: state.side === 'front' ? 'back' : 'front' };
    case 'NEXT':
      return advance(state);
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
    case 'UNDO_KNOW': {
      const undone = state.lastKnow as KnownMark;
      const known = state.known.filter((k) => !(k.id === undone.id && k.cycle === undone.cycle));
      const nextCycle = [...state.nextCycle, undone.id];
      const phase = state.phase === 'finished' ? 'cycleBreak' : state.phase;
      return { ...state, known, nextCycle, lastKnow: null, phase };
    }
    case 'STOP':
      return { ...state, phase: 'stopped', lastKnow: null };
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
