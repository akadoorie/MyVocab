import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { Hand } from './Hand';

type Frame = { offset: number; transform?: string; opacity?: number };

const f = (offset: number, transform?: string, opacity?: number): Frame => ({
  offset,
  ...(transform === undefined ? {} : { transform }),
  ...(opacity === undefined ? {} : { opacity }),
});

const DURATION = 3200;
const STILL_DURATION = 2400;
/** The tap lands at this point of the animation; the card turns right after it. */
const TAP = 0.35;

const AWAY = 'translate(40px, 50px) scale(1)';
const ON = 'translate(0px, 0px) scale(1)';
const HAND: Frame[] = [
  f(0, AWAY, 0),
  f(0.18, ON, 1),
  f(TAP - 0.05, ON, 1),
  f(TAP, 'translate(0px, 0px) scale(0.88)', 1),
  f(TAP + 0.07, ON, 1),
  f(0.78, ON, 1),
  f(1, AWAY, 0),
];
const PRESS: Frame[] = [
  f(0, 'scale(1)'),
  f(TAP - 0.02, 'scale(1)'),
  f(TAP + 0.01, 'scale(0.9)'),
  f(TAP + 0.08, 'scale(1)'),
  f(1, 'scale(1)'),
];
const RIPPLE: Frame[] = [
  f(0, 'scale(0.7)', 0),
  f(TAP, 'scale(0.7)', 0),
  f(TAP + 0.02, 'scale(0.9)', 0.9),
  f(TAP + 0.18, 'scale(2.1)', 0),
  f(1, 'scale(2.1)', 0),
];
const PEEK: Frame[] = [
  f(0, 'rotateY(0deg)'),
  f(TAP + 0.01, 'rotateY(0deg)'),
  f(0.52, 'rotateY(-20deg)'),
  f(0.7, 'rotateY(0deg)'),
  f(1, 'rotateY(0deg)'),
];
/** With "reduce motion": a still ring around Flip that fades in and out. */
const STILL_RING: Frame[] = [
  f(0, 'scale(1.15)', 0),
  f(0.12, 'scale(1.15)', 1),
  f(0.8, 'scale(1.15)', 1),
  f(1, 'scale(1.15)', 0),
];

type Props = {
  /** The box around the card: the hint is drawn over it, and finds Flip and the card inside it. */
  container: RefObject<HTMLElement | null>;
  animate: boolean;
  onDone: () => void;
};

/**
 * The Flip hint (D-136): a hand taps Flip, a ripple spreads from it and the card starts to turn,
 * then settles back. Driven by script (Web Animations), like the swipe hint; any touch, click or
 * key ends it at once and puts everything back.
 */
export function FlipHint({ container, animate, onDone }: Props) {
  const spot = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);

  // Put the fingertip and the ring on Flip, wherever it is at this screen size and language.
  useLayoutEffect(() => {
    const box = container.current;
    const button = box?.querySelector<HTMLElement>('.flip-card__front .flip-card__flip');
    if (!box || !button || !spot.current || !ring.current) return;
    // The visible rounded square is the button's shape layer.
    const shape = button.querySelector<HTMLElement>('.lbtn__shape') ?? button;
    const outer = box.getBoundingClientRect();
    const b = shape.getBoundingClientRect();
    const cx = b.left - outer.left + b.width / 2;
    const cy = b.top - outer.top + b.height / 2;
    spot.current.style.left = `${cx - 25}px`;
    spot.current.style.top = `${cy - 2}px`;
    Object.assign(ring.current.style, {
      left: `${b.left - outer.left}px`,
      top: `${b.top - outer.top}px`,
      width: `${b.width}px`,
      height: `${b.height}px`,
      borderRadius: getComputedStyle(shape).borderRadius,
    });
  }, [container]);

  useEffect(() => {
    const box = container.current;
    const button = box?.querySelector<HTMLElement>('.flip-card__front .flip-card__flip') ?? null;
    const card = box?.querySelector<HTMLElement>('.flip-card__inner') ?? null;
    const duration = animate ? DURATION : STILL_DURATION;
    const parts: [HTMLElement | null, Frame[]][] = animate
      ? [
          [hand.current, HAND],
          [button, PRESS],
          [ring.current, RIPPLE],
          [card, PEEK],
        ]
      : [[ring.current, STILL_RING]];
    const running: Animation[] = [];
    for (const [el, frames] of parts) {
      if (!el || typeof el.animate !== 'function') continue;
      // Easing per step, as in CSS keyframes.
      const keyframes = frames.map((fr) => ({ ...fr, easing: 'ease-in-out' }));
      running.push(el.animate(keyframes, { duration, fill: 'both' }));
    }
    const end = () => {
      for (const a of running) a.cancel();
      onDone();
    };
    const timer = window.setTimeout(end, duration);
    document.addEventListener('pointerdown', end, true);
    document.addEventListener('keydown', end, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', end, true);
      document.removeEventListener('keydown', end, true);
      for (const a of running) a.cancel();
    };
  }, [container, animate, onDone]);

  return (
    <div className="flip-hint" aria-hidden="true" data-testid="flip-hint">
      <span ref={ring} className={`flip-hint__ring ${animate ? '' : 'flip-hint__ring--still'}`} />
      {animate && (
        <div ref={spot} className="flip-hint__spot">
          <div ref={hand} className="flip-hint__hand">
            <Hand />
          </div>
        </div>
      )}
    </div>
  );
}
