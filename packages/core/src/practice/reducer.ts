import { orderNextRound } from './round-order';
import { shuffle, type RngState } from './random';

/**
 * The shrinking-practice engine (PRD §6.2, §10.4): a pure reducer with no DOM or I/O. Cards are
 * identified by item id; the UI looks up the card content separately.
 */

export type PracticePhase = 'deciding' | 'revealed' | 'roundBreak' | 'finished' | 'stopped';
export type CardSide = 'front' | 'back';
/**
 * A Know in this practice. `again`: "Know · ask again" (FR-L27a): a Know for this practice that is not
 * recorded in the learner's known items, so the word stays in the pool.
 */
export type KnownMark = { id: number; round: number; again?: true };

/** An answer given to a card in the current round (FR-L29a). */
export type CardAnswer = 'know' | 'knowAgain' | 'dontKnow';

export type PracticeState = {
  phase: PracticePhase;
  /** 1-based round number. */
  round: number;
  /** Card ids of the current round, in the order shown. */
  order: number[];
  /** Position of the current card in `order`. */
  index: number;
  side: CardSide;
  /** Whether the current card's hints are shown on the front (FR-L25). */
  hintsShown: boolean;
  /**
   * Cards of this round whose hints cover was left open (D-048): Back or Next onto them shows
   * it open again. Optional so a practice saved before D-048 still loads.
   */
  hintsOpen?: number[];
  /** "Don't know" cards collected for the next round. */
  nextRound: number[];
  /** Cards marked Know in this practice, with the round they were marked in. */
  known: KnownMark[];
  totalCards: number;
  rng: RngState;
};

export type PracticeAction =
  | { type: 'KNOW' }
  | { type: 'KNOW_AGAIN' }
  | { type: 'DONT_KNOW' }
  | { type: 'TOGGLE_HINTS' }
  | { type: 'FLIP' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'CONTINUE' }
  | { type: 'STOP' };

export type PracticeActionType = PracticeAction['type'];

/** Starts a practice: round 1 is every card, shuffled. */
export function createPractice(cardIds: readonly number[], seed: RngState): PracticeState {
  const unique = [...new Set(cardIds)];
  if (unique.length === 0) throw new Error('A practice needs at least one card');
  const [order, rng] = shuffle(unique, seed);
  return {
    phase: 'deciding',
    round: 1,
    order,
    index: 0,
    side: 'front',
    hintsShown: false,
    hintsOpen: [],
    nextRound: [],
    known: [],
    totalCards: unique.length,
    rng,
  };
}

/** Whether the card at `index` was left with its hints cover open in this round (D-048). */
function leftOpen(state: PracticeState, index: number): boolean {
  const id = state.order[index];
  return id !== undefined && (state.hintsOpen ?? []).includes(id);
}

/** Moves past the current card: the next card, a round break, or the end of the practice. */
function advance(state: PracticeState): PracticeState {
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
    phase: state.nextRound.length > 0 ? 'roundBreak' : 'finished',
    side: 'front',
    hintsShown: false,
  };
}

/**
 * The answer already given to a card in the current round (PRD FR-L29a): Know, Don't know, or null
 * when it hasn't been answered yet. Derived from `known` and `nextRound`, so it can't drift.
 */
export function answerOf(state: PracticeState, id: number): CardAnswer | null {
  const mark = state.known.find((k) => k.id === id && k.round === state.round);
  if (mark) return mark.again ? 'knowAgain' : 'know';
  if (state.nextRound.includes(id)) return 'dontKnow';
  return null;
}

/** Which actions are allowed right now (drives the button states in PRD FR-L24). */
export function canDispatch(state: PracticeState, type: PracticeActionType): boolean {
  const onCard = state.phase === 'deciding' || state.phase === 'revealed';
  switch (type) {
    case 'KNOW':
    case 'KNOW_AGAIN':
    case 'DONT_KNOW': {
      if (!onCard) return false;
      // The answer the card already has is off: only a change is offered. On a card reached with
      // Back (D-107), and right after "I don't know", where both Knows stay on to change one's
      // mind (D-109). Next moves on without a change.
      const given = answerOf(state, currentId(state));
      const same = type === 'KNOW' ? 'know' : type === 'KNOW_AGAIN' ? 'knowAgain' : 'dontKnow';
      return given !== same;
    }
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
      // Card by card to the first card of this round; from the round break or the summary to its
      // last card. Earlier rounds are out of reach.
      return (
        (onCard && state.index > 0) || state.phase === 'roundBreak' || state.phase === 'finished'
      );
    case 'CONTINUE':
      return state.phase === 'roundBreak';
    case 'STOP':
      return onCard || state.phase === 'roundBreak';
  }
}

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  if (!canDispatch(state, action.type)) return state;
  switch (action.type) {
    case 'KNOW':
    case 'KNOW_AGAIN': {
      // A first answer, or a change on a card reached with Back (FR-L29a): from Don't know, or
      // between the two Knows (FR-L27a).
      const id = currentId(state);
      const again = action.type === 'KNOW_AGAIN';
      const mark: KnownMark = again
        ? { id, round: state.round, again }
        : { id, round: state.round };
      return advance({
        ...state,
        known: [...state.known.filter((k) => !(k.id === id && k.round === state.round)), mark],
        nextRound: state.nextRound.filter((n) => n !== id),
      });
    }
    case 'DONT_KNOW': {
      const id = currentId(state);
      const answer = answerOf(state, id);
      return {
        ...state,
        known:
          answer === 'know' || answer === 'knowAgain'
            ? state.known.filter((k) => !(k.id === id && k.round === state.round))
            : state.known,
        nextRound: answer === 'dontKnow' ? state.nextRound : [...state.nextRound, id],
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
      const from = state.phase === 'roundBreak' || state.phase === 'finished';
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
      const [order, rng] = orderNextRound(state.nextRound, state.order, state.rng);
      return {
        ...state,
        round: state.round + 1,
        order,
        index: 0,
        nextRound: [],
        phase: 'deciding',
        side: 'front',
        // A new round is a fresh try: every card starts covered again (D-048).
        hintsShown: false,
        hintsOpen: [],
        rng,
      };
    }
    case 'STOP':
      return { ...state, phase: 'stopped' };
  }
}

function currentId(state: PracticeState): number {
  return state.order[state.index] as number;
}

/** The card on screen, or null outside the deciding/revealed phases. */
export function currentCardId(state: PracticeState): number | null {
  if (state.phase !== 'deciding' && state.phase !== 'revealed') return null;
  return state.order[state.index] ?? null;
}

/** Header progress: "Round 2 · Card 1/3 · 2 known" (FR-L23). */
export function practiceProgress(state: PracticeState) {
  return {
    round: state.round,
    cardNumber: Math.min(state.index + 1, state.order.length),
    roundSize: state.order.length,
    knownCount: state.known.length,
    /** Cards left for the next round (shown on the round break). */
    remaining: state.nextRound.length,
  };
}

/** End-of-practice summary (FR-L32). */
export function practiceSummary(state: PracticeState) {
  const alreadyKnew = state.known.filter((k) => k.round === 1).length;
  return {
    totalCards: state.totalCards,
    rounds: state.round,
    alreadyKnew,
    learnedHere: state.known.length - alreadyKnew,
  };
}
