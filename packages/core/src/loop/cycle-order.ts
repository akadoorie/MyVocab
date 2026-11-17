import { shuffle, type RngState } from './random';

export const MAX_RESHUFFLES = 10;

/** True when the shared cards of both orders appear in the same relative order. */
export function sameRelativeOrder(next: readonly number[], previous: readonly number[]): boolean {
  const inNext = new Set(next);
  const inPrev = new Set(previous);
  const a = next.filter((id) => inPrev.has(id));
  const b = previous.filter((id) => inNext.has(id));
  if (a.length <= 1) return false; // one shared card or fewer: the order can't repeat
  return a.every((id, i) => id === b[i]);
}

/**
 * Orders the cards of a new cycle (PRD FR-L21): shuffled, and — when the cycle has more than one
 * card — different from their relative order in the previous cycle. Up to 10 re-shuffles, then a
 * rotation by one, which always differs.
 */
export function orderNextCycle(
  cards: readonly number[],
  previousOrder: readonly number[],
  state: RngState,
): [number[], RngState] {
  let s = state;
  let order: number[] = [...cards];
  for (let attempt = 0; attempt < MAX_RESHUFFLES; attempt++) {
    [order, s] = shuffle(cards, s);
    if (!sameRelativeOrder(order, previousOrder)) return [order, s];
  }
  const [first, ...rest] = order;
  return [first === undefined ? order : [...rest, first], s];
}
