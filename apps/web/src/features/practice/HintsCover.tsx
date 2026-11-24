import { useEffect, useRef, useState, type ReactNode } from 'react';
import { strings } from '../../strings';
import { HintsArea } from './HintsArea';

/** A tap that moved more than this is a drag, not a tap (D-078). */
const TAP_SLOP_PX = 10;
/** A tap this soon after the hints scrolled was meant to stop or adjust the scroll (D-078). */
const TAP_AFTER_SCROLL_MS = 350;
/** Dots per square pixel of cover (about one dot per 38 px²). */
const DENSITY = 1 / 38;
/** While the cover is untouched, it shows it can be tapped this often (D-121). */
export const COVER_HINT_MS = 5000;
/** The peek: the dots part in a spot at the top, on the side the hints start, then close. */
const PEEK_MS = 1800;
const PEEK_RADIUS = 46;
const PEEK_EDGE = 18;
/** The spot's centre: this far from the start edge and from the top. */
const PEEK_X = 64;
const PEEK_Y = 34;

/** The peek's radius at `p` (0–1 through the peek): opens, holds, closes. */
function peekRadius(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  const k = p < 0.35 ? p / 0.35 : p < 0.7 ? 1 : (1 - p) / 0.3;
  return PEEK_RADIUS * (0.5 - Math.cos(Math.PI * k) / 2);
}

function motionOK(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ?? false;
}

type Dot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  angle: number;
  speed: number;
};

/**
 * The hints on the card front, under a "live" cover (D-047): a cloud of tiny shimmering dots
 * over the blurred hints invites a tap. Tapping reveals them (the dots scatter and fade); a clean
 * tap on the revealed hints (or H) covers them again, but never a drag, a tap that stops a
 * scroll, or a tap right after scrolling (D-078). The cover reaches the card's bottom, around the
 * Flip button (D-078). The cover is a real button; the hidden text isn't read out until shown.
 * With reduced motion the dots stand still. The animation runs only while covered and visible.
 */
export function HintsCover({
  open,
  onToggle,
  active,
  learned = false,
  onLearned = () => undefined,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** False on the hidden face or a decorative copy: no animation. */
  active: boolean;
  /** The learner has opened and closed the hints once in this practice: no more hints (D-121). */
  learned?: boolean;
  /** Called when the hints are covered again after being open. */
  onLearned?: () => void;
  children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Where and when the last touch or click started, and when the hints last scrolled: only a
  // clean tap covers them again (D-078).
  const press = useRef<{ x: number; y: number; at: number } | null>(null);
  const lastScroll = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const openRef = useRef(open);
  const wake = useRef<() => void>(() => {});
  const coverRef = useRef<HTMLDivElement>(null);
  // When the current peek started (performance.now), or null.
  const peekAt = useRef<number | null>(null);
  // Counts the "you can tap me" hints, so the finger's tap replays each time (D-121).
  const [hinted, setHinted] = useState(0);
  const wasOpen = useRef(open);
  const onLearnedRef = useRef(onLearned);
  useEffect(() => {
    onLearnedRef.current = onLearned;
  });

  useEffect(() => {
    openRef.current = open;
    // Covered again after being open: the learner knows the cover now (D-121).
    if (wasOpen.current && !open) onLearnedRef.current();
    wasOpen.current = open;
    wake.current();
  }, [open]);

  // Every 5 seconds while covered and untouched: a peek at the top and a tap of the finger (D-121).
  const hinting = active && !open && !learned && motionOK();
  useEffect(() => {
    if (!hinting) return;
    const id = window.setInterval(() => {
      peekAt.current = performance.now();
      wake.current();
      setHinted((n) => n + 1);
    }, COVER_HINT_MS);
    return () => window.clearInterval(id);
  }, [hinting]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const button = buttonRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !button || !ctx || !active) return;
    const moving = motionOK();
    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    let scatter = openRef.current ? 1 : 0;
    let raf = 0;

    const resize = () => {
      const rect = button.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = Array.from({ length: Math.round(width * height * DENSITY) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: 0.6 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        angle: Math.random() * Math.PI * 2,
        speed: 30 + Math.random() * 70,
      }));
    };

    const frame = (t: number) => {
      const target = openRef.current ? 1 : 0;
      scatter += (target - scatter) * (moving ? 0.12 : 1);
      ctx.clearRect(0, 0, width, height);
      // The peek (D-121): a spot at the top, on the side the hints start, where the dots part and
      // the sharp copy of the hints shows through (masked to the same spot).
      const started = peekAt.current;
      const p = started === null || openRef.current ? 1 : (performance.now() - started) / PEEK_MS;
      if (p >= 1) peekAt.current = null;
      const r = peekRadius(p);
      const cover = coverRef.current;
      const text = cover?.querySelector('.hints-cover__peek > *');
      const rtl = text ? getComputedStyle(text).direction === 'rtl' : false;
      // The canvas starts 4px outside the cover (the button's inset).
      const px = rtl ? width - 4 - PEEK_X : 4 + PEEK_X;
      const py = 4 + PEEK_Y;
      if (cover) {
        cover.style.setProperty('--peek-r', `${r}px`);
        cover.style.setProperty('--peek-x', `${px - 4}px`);
        cover.style.setProperty('--peek-y', `${py - 4}px`);
      }
      for (const d of dots) {
        if (moving) {
          d.x = (d.x + d.vx + width) % width;
          d.y = (d.y + d.vy + height) % height;
        }
        const flicker = moving ? 0.45 + 0.55 * Math.abs(Math.sin(t / 420 + d.phase)) : 0.7;
        const out = scatter * d.speed;
        const gap = Math.hypot(d.x - px, d.y - py) - r;
        const away = r > 0 ? Math.min(1, Math.max(0, gap / PEEK_EDGE)) : 1;
        ctx.globalAlpha = flicker * (1 - scatter) * away;
        ctx.fillStyle = '#ddd5ff';
        ctx.beginPath();
        ctx.arc(d.x + Math.cos(d.angle) * out, d.y + Math.sin(d.angle) * out, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Open and fully scattered, or still (reduced motion): nothing more to draw for now.
      const settled = Math.abs(target - scatter) < 0.01 && peekAt.current === null;
      raf = settled && (target === 1 || !moving) ? 0 : requestAnimationFrame(frame);
    };

    wake.current = () => {
      if (openRef.current === false) for (const d of dots) d.angle = Math.random() * Math.PI * 2;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    resize();
    raf = requestAnimationFrame(frame);
    const observer = new ResizeObserver(() => {
      resize();
      wake.current();
    });
    observer.observe(button);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      wake.current = () => {};
    };
  }, [active]);

  return (
    // A tap on the revealed hints is a shortcut for pointer users (D-078); keyboard and screen
    // reader users have H and the "Hide hints" button, so this area needs no key handler or role.
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions
    <div
      ref={coverRef}
      className={`hints-cover ${open ? 'is-open' : ''}`}
      onScrollCapture={() => {
        lastScroll.current = Date.now();
      }}
      onPointerDown={(e) => {
        press.current = { x: e.clientX, y: e.clientY, at: Date.now() };
      }}
      onClick={(e) => {
        if (!open) return;
        const start = press.current;
        const now = Date.now();
        const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 0;
        const scrolling = now - lastScroll.current < TAP_AFTER_SCROLL_MS;
        if (moved > TAP_SLOP_PX || scrolling) return;
        e.stopPropagation();
        onToggle();
      }}
    >
      {/* The hints scroll on their own when long; covered, they don't (D-050). */}
      <HintsArea locked={!open} hidden={!open}>
        {children}
      </HintsArea>
      {/* The peek's sharp copy of the hints, seen only through the spot (D-121); decorative. */}
      {hinting && (
        <div className="hints-cover__peek" aria-hidden="true" inert>
          {children}
        </div>
      )}
      {/* Covered: the button over the area, named by its visible label (axe
          label-content-name-mismatch). Open: it stays only for the dots to scatter, out of the
          way of taps and scrolling; a tap on the hints covers them again (D-078). */}
      <button
        ref={buttonRef}
        type="button"
        className="hints-cover__button"
        aria-expanded={open}
        aria-label={strings.card.tapForHints}
        aria-hidden={open || undefined}
        tabIndex={open ? -1 : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (!open) onToggle();
        }}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        {!open && (
          <span className="hints-cover__tap" aria-hidden="true">
            {/* A small finger that taps with each hint (D-121); keyed so the tap replays. */}
            <span key={hinted} className={`hints-cover__finger ${hinted > 0 ? 'is-tapping' : ''}`}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
                <path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v2" />
                <path d="M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.6-2.2L4.5 15.6a1.5 1.5 0 0 1 2.3-1.9L9 16" />
              </svg>
              <i />
            </span>
            {strings.card.tapForHints}
          </span>
        )}
      </button>
    </div>
  );
}
