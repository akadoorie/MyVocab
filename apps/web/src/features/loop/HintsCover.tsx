import { useEffect, useRef, type ReactNode } from 'react';
import { strings } from '../../strings';
import { HintsArea } from './HintsArea';

/** Dots per square pixel of cover (about one dot per 38 px²). */
const DENSITY = 1 / 38;

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
 * over the blurred hints invites a tap. Tapping reveals them (the dots scatter and fade); the
 * "Hide hints" link on the card (or H) covers them again, so a tap while scrolling long hints
 * never hides them (D-050). The cover fills the hints area, ending above the Flip row. The cover is a real button; the hidden text isn't read out until shown.
 * With reduced motion the dots stand still. The animation runs only while covered and visible.
 */
export function HintsCover({
  open,
  onToggle,
  active,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** False on the hidden face or a decorative copy: no animation. */
  active: boolean;
  children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const openRef = useRef(open);
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    openRef.current = open;
    wake.current();
  }, [open]);

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
      for (const d of dots) {
        if (moving) {
          d.x = (d.x + d.vx + width) % width;
          d.y = (d.y + d.vy + height) % height;
        }
        const flicker = moving ? 0.45 + 0.55 * Math.abs(Math.sin(t / 420 + d.phase)) : 0.7;
        const out = scatter * d.speed;
        ctx.globalAlpha = flicker * (1 - scatter);
        ctx.fillStyle = '#ddd5ff';
        ctx.beginPath();
        ctx.arc(d.x + Math.cos(d.angle) * out, d.y + Math.sin(d.angle) * out, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Open and fully scattered, or still (reduced motion): nothing more to draw for now.
      const settled = Math.abs(target - scatter) < 0.01;
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
    <div className={`hints-cover ${open ? 'is-open' : ''}`}>
      {/* The hints scroll on their own when long; covered, they don't (D-050). */}
      <HintsArea locked={!open} hidden={!open}>
        {children}
      </HintsArea>
      {/* Covered: the button over the area, named by its visible label (axe
          label-content-name-mismatch). Open: it stays only for the dots to scatter, out of the
          way of taps and scrolling; "Hide hints" on the card covers them again (D-050). */}
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
            {strings.card.tapForHints}
          </span>
        )}
      </button>
    </div>
  );
}
