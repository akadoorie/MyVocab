import { useEffect, useRef, type RefObject } from 'react';
import type { SwipeHintDirs } from './swipe-hint';
import { Hand } from './Hand';

type Frame = { offset: number; transform?: string; opacity?: number };
type Plan = {
  duration: number;
  hand: Frame[];
  dot: Frame[];
  card: Frame[] | null;
  left: Frame[] | null;
  right: Frame[] | null;
};

const f = (offset: number, transform?: string, opacity?: number): Frame => ({
  offset,
  ...(transform === undefined ? {} : { transform }),
  ...(opacity === undefined ? {} : { opacity }),
});
const REST = 'translateX(0px) rotate(0deg)';
const cardAt = (x: number) => `translateX(${x}px) rotate(${(x / 26) * 0.9}deg)`;
const handAt = (x: number, y = 0) => `translate(${x}px, ${y}px)`;
const arrowAt = (x: number) => `translateX(${x}px)`;

/** One direction (s = -1 left, 1 right): the hand drags the card that way and lets go. */
function oneWay(s: number): Plan {
  const arrow = [
    f(0, arrowAt(0), 0),
    f(0.24, arrowAt(0), 0),
    f(0.4, arrowAt(4 * s), 1),
    f(0.66, arrowAt(4 * s), 1),
    f(0.82, arrowAt(0), 0),
    f(1, arrowAt(0), 0),
  ];
  return {
    duration: 2200,
    hand: [
      f(0, handAt(0, 14), 0),
      f(0.14, handAt(0), 1),
      f(0.22, handAt(0), 1),
      f(0.52, handAt(70 * s), 1),
      f(0.66, handAt(70 * s), 1),
      f(0.84, handAt(40 * s, 8), 0),
      f(1, handAt(40 * s, 8), 0),
    ],
    dot: [
      f(0, 'scale(0.4)', 0),
      f(0.18, 'scale(0.4)', 0),
      f(0.22, 'scale(1)', 1),
      f(0.68, 'scale(1)', 1),
      f(0.8, 'scale(0.4)', 0),
      f(1, 'scale(0.4)', 0),
    ],
    card: [
      f(0, REST),
      f(0.22, REST),
      f(0.52, cardAt(26 * s)),
      f(0.66, cardAt(26 * s)),
      f(0.84, REST),
      f(1, REST),
    ],
    left: s < 0 ? arrow : null,
    right: s > 0 ? arrow : null,
  };
}

/** Both directions: left, back to the middle, then right; each arrow lights as the card moves. */
const BOTH: Plan = {
  duration: 3600,
  hand: [
    f(0, handAt(0, 14), 0),
    f(0.1, handAt(0), 1),
    f(0.16, handAt(0), 1),
    f(0.36, handAt(-70), 1),
    f(0.44, handAt(-70), 1),
    f(0.52, handAt(0), 1),
    f(0.6, handAt(0), 1),
    f(0.8, handAt(70), 1),
    f(0.88, handAt(70), 1),
    f(1, handAt(40, 10), 0),
  ],
  dot: [
    f(0, 'scale(0.4)', 0),
    f(0.12, 'scale(0.4)', 0),
    f(0.16, 'scale(1)', 1),
    f(0.84, 'scale(1)', 1),
    f(1, 'scale(0.4)', 0),
  ],
  card: [
    f(0, REST),
    f(0.16, REST),
    f(0.36, cardAt(-26)),
    f(0.44, cardAt(-26)),
    f(0.52, REST),
    f(0.6, REST),
    f(0.8, cardAt(26)),
    f(0.88, cardAt(26)),
    f(1, REST),
  ],
  left: [
    f(0, arrowAt(0), 0),
    f(0.18, arrowAt(0), 0),
    f(0.3, arrowAt(-4), 1),
    f(0.46, arrowAt(-4), 1),
    f(0.56, arrowAt(0), 0),
    f(1, arrowAt(0), 0),
  ],
  right: [
    f(0, arrowAt(0), 0),
    f(0.62, arrowAt(0), 0),
    f(0.74, arrowAt(4), 1),
    f(0.9, arrowAt(4), 1),
    f(1, arrowAt(0), 0),
  ],
};

/** With "reduce motion": the hand and the arrows appear, stay still, and fade. */
function still(dirs: SwipeHintDirs): Plan {
  const fade = [
    f(0, undefined, 0),
    f(0.12, undefined, 1),
    f(0.8, undefined, 1),
    f(1, undefined, 0),
  ];
  return {
    duration: 2400,
    hand: fade,
    dot: [f(0, 'scale(1)', 0), f(0.12, 'scale(1)', 1), f(0.8, 'scale(1)', 1), f(1, 'scale(1)', 0)],
    card: null,
    left: dirs === 'right' ? null : fade,
    right: dirs === 'left' ? null : fade,
  };
}

function planFor(dirs: SwipeHintDirs, animate: boolean): Plan {
  if (!animate) return still(dirs);
  return dirs === 'both' ? BOTH : oneWay(dirs === 'left' ? -1 : 1);
}

type Props = {
  dirs: SwipeHintDirs;
  /** The element that moves with a swipe: the hint moves it the same way. */
  card: RefObject<HTMLElement | null>;
  animate: boolean;
  onDone: () => void;
};

/**
 * The swipe hint (D-135): a hand drags the card the way it can be swiped, and the arrow on that
 * side lights up. Driven by script (Web Animations) so its timing doesn't depend on CSS; any touch
 * or key ends it at once and the card is back where it was, ready for a real swipe.
 */
export function SwipeHint({ dirs, card, animate, onDone }: Props) {
  const hand = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  const right = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const plan = planFor(dirs, animate);
    const parts: [HTMLElement | null, Frame[] | null][] = [
      [hand.current, plan.hand],
      [dot.current, plan.dot],
      [card.current, plan.card],
      [left.current, plan.left],
      [right.current, plan.right],
    ];
    const running: Animation[] = [];
    for (const [el, frames] of parts) {
      if (!el || !frames || typeof el.animate !== 'function') continue;
      // Easing per step, as in CSS keyframes.
      const keyframes = frames.map((fr) => ({ ...fr, easing: 'ease-in-out' }));
      running.push(el.animate(keyframes, { duration: plan.duration, fill: 'both' }));
    }
    // Let go of the card at once, so a swipe starting with this touch moves it freely.
    const end = () => {
      for (const a of running) a.cancel();
      onDone();
    };
    const timer = window.setTimeout(end, plan.duration);
    document.addEventListener('pointerdown', end, true);
    document.addEventListener('keydown', end, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', end, true);
      document.removeEventListener('keydown', end, true);
      for (const a of running) a.cancel();
    };
  }, [dirs, animate, card, onDone]);

  return (
    <div className="swipe-hint" aria-hidden="true" data-testid="swipe-hint" data-dirs={dirs}>
      {dirs !== 'right' && (
        <span ref={left} className="swipe-hint__arrow swipe-hint__arrow--left">
          <svg width="12" height="18" viewBox="0 0 12 18">
            <path d="M9 2 3 9l6 7" />
          </svg>
        </span>
      )}
      {dirs !== 'left' && (
        <span ref={right} className="swipe-hint__arrow swipe-hint__arrow--right">
          <svg width="12" height="18" viewBox="0 0 12 18">
            <path d="m3 2 6 7-6 7" />
          </svg>
        </span>
      )}
      <div className="swipe-hint__spot">
        <div ref={hand} className="swipe-hint__hand">
          <span ref={dot} className="swipe-hint__dot" />
          <Hand />
        </div>
      </div>
    </div>
  );
}
