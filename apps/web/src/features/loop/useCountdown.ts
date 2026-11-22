import { useEffect, useRef, useState } from 'react';

/**
 * Counts down from `seconds` and calls `onDone` at 0: Continue on the break between rounds
 * (D-067) and Next after "I don't know" (D-069). Any tap, click, key or mouse-wheel scroll stops
 * it for good; it pauses while `paused` (the "Are you sure?" question) or while the page is
 * hidden. `seconds` 0 or `enabled` false: no countdown. A new `resetKey` starts it afresh.
 */
export function useCountdown(
  seconds: number,
  onDone: () => void,
  {
    paused = false,
    enabled = true,
    resetKey = '',
  }: { paused?: boolean; enabled?: boolean; resetKey?: string } = {},
) {
  const [key, setKey] = useState(resetKey);
  const [left, setLeft] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden');
  // A new card (or a new break): start over.
  if (key !== resetKey) {
    setKey(resetKey);
    setLeft(seconds);
    setCancelled(false);
  }
  const counting = enabled && !cancelled && seconds > 0;
  useEffect(() => {
    if (!counting) return;
    const cancel = () => setCancelled(true);
    const visibility = () => setHidden(document.visibilityState === 'hidden');
    window.addEventListener('pointerdown', cancel, true);
    window.addEventListener('keydown', cancel, true);
    window.addEventListener('wheel', cancel, { capture: true, passive: true });
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointerdown', cancel, true);
      window.removeEventListener('keydown', cancel, true);
      window.removeEventListener('wheel', cancel, { capture: true });
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [counting]);
  // The latest callback, so a parent re-render doesn't restart the count.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const running = counting && !paused && !hidden;
  useEffect(() => {
    if (!running) return;
    if (left <= 0) {
      done.current();
      return;
    }
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [running, left]);
  return { left, counting, running };
}
