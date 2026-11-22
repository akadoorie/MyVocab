/**
 * A small seedable PRNG (mulberry32). The practice keeps the generator state inside its own state, so
 * the reducer stays pure and a practice restored from sessionStorage continues identically.
 */

export type RngState = number;

/** Returns a float in [0, 1) and the next generator state. */
export function nextRandom(state: RngState): [number, RngState] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Fisher–Yates shuffle (PRD FR-L21). Returns a new array and the next generator state. */
export function shuffle<T>(items: readonly T[], state: RngState): [T[], RngState] {
  const result = [...items];
  let s = state;
  for (let i = result.length - 1; i > 0; i--) {
    let r: number;
    [r, s] = nextRandom(s);
    const j = Math.floor(r * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return [result, s];
}

/** A random 32-bit seed for a new practice (uses crypto when available). */
export function randomSeed(): RngState {
  const buf = new Uint32Array(1);
  const { crypto } = globalThis as unknown as {
    crypto: { getRandomValues(array: Uint32Array): Uint32Array };
  };
  crypto.getRandomValues(buf);
  return buf[0] ?? 0;
}
