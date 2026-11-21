import { orderNextCycle } from './cycle-order';
import { shuffle, type RngState } from './random';

/**
 * The shrinking-loop engine (PRD §6.2, §10.4): a pure reducer with no DOM or I/O. Cards are
 * identified by item id; the UI looks up the card content separately.
 */

export type LoopPhase = 'deciding' | 'revealed' | 'cycleBreak' | 'finished' | 'stopped';
export type CardSide = 'front' | 'back';
/**
 * A Know in this loop. `again`: "Know · ask again" (FR-L27a): a Know for this session that is not
 * recorded in the learner's known items, so the word stays in the pool.
 */
export type KnownMark = { id: number; cycle: number; again?: true };

/** An answer given to a card in the current cycle (FR-L29a). */
export type CardAnswer = 'know' | 'knowAgain' | 'dontKnow';

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
  /**
   * Cards of this cycle whose hints cover was left open (D-048): Back or Next onto them shows
   * it open again. Optional so a session saved before D-048 still loads.
   */
  hintsOpen?: number[];
  /** "Don't know" cards collected for the next cycle. */
  nextCycle: number[];
  /** Cards marked Know in this loop, with the cycle they were marked in. */
  known: KnownMark[];
  totalCards: number;
  rng: RngState;
};

export type LoopAction =
  | { type: 'KNOW' }
  | { type: 'KNOW_AGAIN' }
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
    hintsOpen: [],
    nextCycle: [],
    known: [],
    totalCards: unique.length,
    rng,
  };
}

/** Whether the card at `index` was left with its hints cover open in this cycle (D-048). */
function leftOpen(state: LoopState, index: number): boolean {
  const id = state.order[index];
  return id !== undefined && (state.hintsOpen ?? []).includes(id);
}

/** Moves past the current card: the next card, a cycle break, or the end of the loop. */
function advance(state: LoopState): LoopState {
  const index = state.index + 1;
  if (index < state.order.length) {
    return {
      ...state,
      index,
      phase: 'deciding',
      side: 'front',
      hintsShown: leftOpen(state, index),
    };
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
export function answerOf(state: LoopState, id: number): CardAnswer | null {
  const mark = state.known.find((k) => k.id === id && k.cycle === state.cycle);
  if (mark) return mark.again ? 'knowAgain' : 'know';
  if (state.nextCycle.includes(id)) return 'dontKnow';
  return null;
}

/** Which actions are allowed right now (drives the button states in PRD FR-L24). */
export function canDispatch(state: LoopState, type: LoopActionType): boolean {
  const onCard = state.phase === 'deciding' || state.phase === 'revealed';
  switch (type) {
    case 'KNOW':
    case 'KNOW_AGAIN':
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
    case 'KNOW':
    case 'KNOW_AGAIN': {
      // A first answer, or a change on a card reached with Back (FR-L29a): from Don't know, or
      // between the two Knows (FR-L27a).
      const id = currentId(state);
      const again = action.type === 'KNOW_AGAIN';
      if (answerOf(state, id) === (again ? 'knowAgain' : 'know')) return advance(state);
      const mark: KnownMark = again
        ? { id, cycle: state.cycle, again }
        : { id, cycle: state.cycle };
      return advance({
        ...state,
        known: [...state.known.filter((k) => !(k.id === id && k.cycle === state.cycle)), mark],
        nextCycle: state.nextCycle.filter((n) => n !== id),
      });
    }
    case 'DONT_KNOW': {
      const id = currentId(state);
      const answer = answerOf(state, id);
      return {
        ...state,
        known:
          answer === 'know' || answer === 'knowAgain'
            ? state.known.filter((k) => !(k.id === id && k.cycle === state.cycle))
            : state.known,
        nextCycle: answer === 'dontKnow' ? state.nextCycle : [...state.nextCycle, id],
        phase: 'revealed',
        side: 'back',
      };
    }
    case 'TOGGLE_HINTS': {
      // Remembered per card, so coming back to it keeps the cover as it was left (D-048).
      const id = currentId(state);
      const others = (state.hintsOpen ?? []).filter((n) => n !== id);
      const hintsShown = !state.hintsShown;
      return { ...state, hintsShown, hintsOpen: hintsShown ? [...others, id] : others };
    }
    case 'FLIP':
      return { ...state, side: state.side === 'front' ? 'back' : 'front' };
    case 'NEXT':
      return advance(state);
    case 'BACK': {
      // The card arrives front side up, its hints cover as it was left (FR-L29a, D-048).
      const from = state.phase === 'cycleBreak' || state.phase === 'finished';
      const index = (from ? state.order.length : state.index) - 1;
      return {
        ...state,
        index,
        phase: 'deciding',
        side: 'front',
        hintsShown: leftOpen(state, index),
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
        // A new cycle is a fresh try: every card starts covered again (D-048).
        hintsShown: false,
        hintsOpen: [],
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
