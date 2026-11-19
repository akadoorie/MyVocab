import { useCallback, useLayoutEffect, useRef } from 'react';

/** How far (px) a release must travel to count, or a shorter quick flick. */
const DISTANCE = 70;
const FLICK_DISTANCE = 30;
const FLICK_SPEED = 0.5; // px per ms
/** Movement (px) before deciding between a horizontal swipe and a vertical drag or a tap. */
const SLOP = 10;
const SLIDE_MS = 180;

export type SwipeOptions = {
  /** Swipe left (Next) is allowed right now. */
  canLeft: boolean;
  /** Swipe right (Back) is allowed right now. */
  canRight: boolean;
  onLeft: () => void;
  onRight: () => void;
  /** Off while a dialog is open. */
  enabled: boolean;
  /** False with "reduce motion": no follow or slide, the action just happens. */
  animate: boolean;
};

/**
 * Touch swipes on the session card (PRD FR-L29b): left = Next, right = Back. The card follows the
 * finger (only a little, with resistance, when that way isn't allowed), then slides out or springs
 * back. Mouse and pen are ignored; a mostly vertical drag is left to the page; the click that ends
 * a swipe is swallowed so it doesn't also flip the card. Returns a ref for the element that moves.
 */
export function useSwipe(options: SwipeOptions) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    let start: { x: number; y: number; t: number; id: number } | null = null;
    let mode: 'pending' | 'drag' | 'ignore' = 'pending';
    let dx = 0;

    const setPose = (x: number, transition: string) => {
      el.style.transition = transition;
      el.style.transform = x === 0 ? '' : `translateX(${x}px) rotate(${x / 30}deg)`;
    };
    const swallowClick = () => {
      const stop = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
      };
      el.addEventListener('click', stop, { capture: true, once: true });
      // If no click follows (e.g. the finger left the card), don't swallow a later real tap.
      window.setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 400);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !latest.current.enabled || start) return;
      start = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
      mode = 'pending';
      dx = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id || mode === 'ignore') return;
      const x = e.clientX - start.x;
      const y = e.clientY - start.y;
      if (mode === 'pending') {
        if (Math.abs(x) < SLOP && Math.abs(y) < SLOP) return;
        if (Math.abs(x) <= Math.abs(y) * 1.2) {
          mode = 'ignore';
          return;
        }
        mode = 'drag';
        el.setPointerCapture?.(e.pointerId);
      }
      dx = x;
      const { canLeft, canRight, animate } = latest.current;
      if (!animate) return;
      const allowed = dx < 0 ? canLeft : canRight;
      setPose(allowed ? dx : dx * 0.2, 'none');
    };
    const onEnd = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dragged = mode === 'drag';
      const elapsed = Math.max(1, e.timeStamp - start.t);
      start = null;
      if (!dragged) return;
      swallowClick();
      const { canLeft, canRight, onLeft, onRight, animate } = latest.current;
      const left = dx < 0;
      const allowed = left ? canLeft : canRight;
      const far = Math.abs(dx) >= DISTANCE;
      const flick = Math.abs(dx) >= FLICK_DISTANCE && Math.abs(dx) / elapsed >= FLICK_SPEED;
      const go = e.type === 'pointerup' && allowed && (far || flick);
      if (!go) {
        if (animate) setPose(0, 'transform 200ms ease-out');
        return;
      }
      const run = left ? onLeft : onRight;
      if (!animate) return run();
      // Slide out, then move on; the next card mounts fresh (and rises in).
      const out = (left ? -1 : 1) * window.innerWidth * 1.1;
      setPose(out, `transform ${SLIDE_MS}ms ease-in`);
      window.setTimeout(() => {
        run();
        setPose(0, 'none'); // in case the same element stays (nothing changed)
      }, SLIDE_MS);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
    };
  }, []);
}
