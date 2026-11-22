import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { readJson, writeJson } from '../../lib/storage';
import { strings } from '../../strings';

/**
 * The "Practice completed" celebration (PRD FR-L32a): a burst of confetti and a short applause.
 * Confetti is skipped with "reduce motion"; the sound can be turned off and stays off on this device.
 */

const SOUND_KEY = 'myvocab.sound.v1';
const COLORS = ['#8b6cff', '#b9a6ff', '#22c55e', '#facc15', '#f43f5e', '#38bdf8'];
const DURATION_MS = 3400;
/** As the last confetti falls (before it has fully faded): the crown sets off then. */
export const CELEBRATION_MS = 2400;

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  angle: number;
  spin: number;
  wobble: number;
  color: string;
};

/** Paper pieces shoot up from the bottom corners and flutter down over the screen, then fade. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const count = width < 640 ? 110 : 180;
    const pieces: Piece[] = Array.from({ length: count }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -60 : -120) + (Math.random() - 0.5) * 40; // degrees, upward
      // Enough to reach the upper part of the screen before gravity takes over.
      const speed = Math.sqrt(height) * (0.72 + Math.random() * 0.3);
      return {
        x: fromLeft ? width * 0.1 : width * 0.9,
        y: height + 10,
        vx: Math.cos((angle * Math.PI) / 180) * speed,
        vy: Math.sin((angle * Math.PI) / 180) * speed,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        wobble: Math.random() * Math.PI * 2,
        color: COLORS[i % COLORS.length]!,
      };
    });

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = t > DURATION_MS - 600 ? Math.max(0, (DURATION_MS - t) / 600) : 1;
      for (const p of pieces) {
        p.vy += 0.22; // gravity
        p.vx *= 0.985; // air
        p.vy *= 0.985;
        p.wobble += 0.12;
        p.x += p.vx + Math.sin(p.wobble) * 0.8;
        p.y += p.vy;
        p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(1, Math.cos(p.wobble)); // the paper turns as it falls
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < DURATION_MS) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="confetti"
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
}

/**
 * The yellow crown on the summary card's upper-left corner (FR-L32a; upper-right in Hebrew). After
 * the celebration it flies in from that top corner of the screen and lands there; on later visits
 * it is simply there.
 */
export function Crown({ fly }: { fly: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [from, setFrom] = useState<CSSProperties | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!fly || !el) return;
    // Start just outside the top-left corner of the screen, relative to where it will sit (the
    // outer box isn't rotated, so this is its true resting place).
    const r = el.getBoundingClientRect();
    // Right-to-left, the crown is mirrored (base.css): its "left" is the screen's right.
    const rtl = document.documentElement.dir === 'rtl';
    setFrom({
      '--crown-dx': `${rtl ? -(window.innerWidth - r.left) - 20 : -r.right - 20}px`,
      '--crown-dy': `${-r.bottom - 20}px`,
    } as CSSProperties);
  }, [fly]);
  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-testid="crown"
      className={`crown ${fly && from ? 'crown--fly' : ''}`}
      style={from}
    >
      {/* Sideways, up-and-down, and turn + grow: one smooth curve each (see .crown in base.css). */}
      <span className="crown__x">
        <span className="crown__y">
          <span className="crown__spin">
            <svg viewBox="0 0 64 52" focusable="false">
              <defs>
                <linearGradient id="crown-gold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fde68a" />
                  <stop offset="0.45" stopColor="#facc15" />
                  <stop offset="1" stopColor="#d97706" />
                </linearGradient>
              </defs>
              <path
                d="M6 18 L18 30 L32 8 L46 30 L58 18 L53 42 H11 Z"
                fill="url(#crown-gold)"
                stroke="#b45309"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <rect
                x="10"
                y="41"
                width="44"
                height="8"
                rx="2.5"
                fill="url(#crown-gold)"
                stroke="#b45309"
                strokeWidth="2"
              />
              <circle cx="6" cy="17" r="4" fill="#fde68a" stroke="#b45309" strokeWidth="1.5" />
              <circle cx="32" cy="7" r="4.5" fill="#fde68a" stroke="#b45309" strokeWidth="1.5" />
              <circle cx="58" cy="17" r="4" fill="#fde68a" stroke="#b45309" strokeWidth="1.5" />
              <circle cx="32" cy="34" r="3.5" fill="#f43f5e" />
              <circle cx="20" cy="37" r="2.5" fill="#38bdf8" />
              <circle cx="44" cy="37" r="2.5" fill="#22c55e" />
              <path
                d="M14 24 L18 30"
                stroke="#fff7d6"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.7"
              />
            </svg>
          </span>
        </span>
      </span>
    </span>
  );
}

/** Sound on/off, remembered on this device (on by default). */
export function useSoundSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(
    () => readJson('local', SOUND_KEY, (v): v is boolean => typeof v === 'boolean') ?? true,
  );
  return [
    on,
    (next: boolean) => {
      setOn(next);
      writeJson('local', SOUND_KEY, next);
    },
  ];
}

/**
 * Plays the applause when the screen appears (the last tap allows sound in browsers). Turning the
 * sound off stops it; turning it on plays it again, as a preview.
 */
export function useApplause(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const a = new Audio('/sounds/applause.wav');
    a.volume = 0.8;
    // A browser may still refuse (no recent tap); the confetti alone is fine then.
    void a.play()?.catch(() => undefined);
    return () => a.pause();
  }, [enabled]);
}

/** The small 🔊 / 🔇 switch on the summary. */
export function SoundToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-sm text-muted hover:text-text"
    >
      <span aria-hidden="true">{on ? '🔊' : '🔇'}</span>
      {on ? strings.summary.soundOn : strings.summary.soundOff}
    </button>
  );
}
