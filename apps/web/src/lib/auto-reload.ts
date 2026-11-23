import { useEffect, useState } from 'react';
import { readJson, removeKey, writeJson } from './storage';

/**
 * Retrying after "Something went wrong" (D-092): wait 1 second and try again quietly; then twice
 * more, 2 seconds apart, saying "Refreshing in 2 seconds"; then show the error and stop.
 */
export const RETRY_DELAYS_MS = [1000, 2000, 2000] as const;

/** What to show while retrying: nothing yet, the countdown message, or the error (given up). */
export type RetryState = 'waiting' | 'retrying' | 'failed';

/** The state before retry number `attempt` (0-based); `failed` once all are used. */
export function retryState(attempt: number): RetryState {
  if (attempt >= RETRY_DELAYS_MS.length) return 'failed';
  return attempt === 0 ? 'waiting' : 'retrying';
}

const KEY = 'myvocab.autoReload';
/** Reloads more than this far apart are not a series: start again at the first one. */
export const SERIES_MS = 60_000;

type Series = { n: number; at: number };
const isSeries = (v: unknown): v is Series =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Series).n === 'number' &&
  typeof (v as Series).at === 'number';

/** How many reloads this tab has made for the current series. */
export function reloadsSoFar(now = Date.now()): number {
  const series = readJson('session', KEY, isSeries);
  return series && now - series.at < SERIES_MS ? series.n : 0;
}

const reloadPage = () => window.location.reload();

/**
 * A page that can't load (`status` 'failed') reloads itself on the D-092 timing; the count of
 * reloads is kept in the tab's sessionStorage, so after the last one the error stays. A
 * successful load ('ok') ends the series; 'loading' changes nothing.
 */
export function useAutoReload(
  status: 'loading' | 'failed' | 'ok',
  reload: () => void = reloadPage,
): RetryState | null {
  const [attempt] = useState(() => reloadsSoFar());
  const state = retryState(attempt);
  const failed = status === 'failed';
  useEffect(() => {
    if (status === 'ok') removeKey('session', KEY);
    if (status !== 'failed' || state === 'failed') return;
    const timer = window.setTimeout(() => {
      writeJson('session', KEY, { n: attempt + 1, at: Date.now() });
      reload();
    }, RETRY_DELAYS_MS[attempt]);
    return () => window.clearTimeout(timer);
  }, [status, attempt, state, reload]);
  return failed ? state : null;
}
