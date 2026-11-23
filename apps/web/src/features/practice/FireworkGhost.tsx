import { useEffect, useRef, type CSSProperties } from 'react';
import { FlipCard } from './FlipCard';
import type { KnowRoll } from './RollGhost';

/** The card shrinks into a spark (keep in sync with base.css: firework-shrink). */
const SHRINK_MS = 300;
/** The spark rises to the counter, then bursts there. */
const SKY_MS = 1600;
/** The part of SKY_MS the spark takes to rise; the burst fills the rest. */
const RISE = 0.32;
/** Total length, for removing the ghost. */
export const FIREWORK_MS = SHRINK_MS + SKY_MS;

const COLORS = ['#86efac', '#22c55e', '#bbf7d0', '#cbbcff', '#facc15'];
const SPARKS = 90;

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  trail: { x: number; y: number }[];
};

/**
 * The green Know animation (PRD §9.4, D-103): a visual copy of the card shrinks into a bright
 * green spark, which shoots up to the "known" counter and bursts there like a firework, its sparks
 * falling in short trails. The orange Know keeps the paper roll (RollGhost). Purely decorative:
 * hidden from assistive tech, not interactive; skipped with reduced motion.
 */
export function FireworkGhost({ roll, onDone }: { roll: KnowRoll; onDone: () => void }) {
  const sky = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const id = window.setTimeout(onDone, FIREWORK_MS + 80);
    return () => window.clearTimeout(id);
  }, [onDone]);

  useEffect(() => {
    const canvas = sky.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return; // no canvas (tests): the card copy still shrinks away
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    g.scale(dpr, dpr);
    const { rect, dx, dy } = roll;
    const sx = rect.left + rect.width / 2;
    const sy = rect.top + rect.height / 2;
    const tx = sx + dx;
    const ty = sy + dy;
    const trail: { x: number; y: number }[] = [];
    let sparks: Spark[] | null = null;
    const begin = performance.now() + SHRINK_MS;
    let raf = 0;

    const frame = (now: number) => {
      const t = (now - begin) / SKY_MS;
      g.clearRect(0, 0, w, h);
      if (t >= 0 && t < RISE) {
        // The spark rises along an ease-out path, with a slight wiggle and a fading tail.
        const k = t / RISE;
        const e = 1 - (1 - k) ** 2;
        trail.push({ x: sx + (tx - sx) * e + Math.sin(k * 9) * 3, y: sy + (ty - sy) * e });
        if (trail.length > 14) trail.shift();
        g.shadowColor = '#22c55e';
        g.shadowBlur = 12;
        g.fillStyle = '#bbf7d0';
        trail.forEach((p, i) => {
          const f = i / trail.length;
          g.globalAlpha = f;
          g.beginPath();
          g.arc(p.x, p.y, 2.5 * f + 1, 0, Math.PI * 2);
          g.fill();
        });
      } else if (t >= RISE) {
        sparks ??= Array.from({ length: SPARKS }, (_, i) => {
          const a = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 4;
          return {
            x: tx,
            y: ty,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            color: COLORS[i % COLORS.length]!,
            trail: [],
          };
        });
        g.globalAlpha = Math.max(0, 1 - (t - RISE) / (1 - RISE));
        g.lineWidth = 2;
        g.shadowBlur = 8;
        for (const s of sparks) {
          s.trail.push({ x: s.x, y: s.y });
          if (s.trail.length > 7) s.trail.shift();
          s.vx *= 0.96;
          s.vy = s.vy * 0.96 + 0.09; // a little gravity
          s.x += s.vx;
          s.y += s.vy;
          g.strokeStyle = s.color;
          g.shadowColor = s.color;
          g.beginPath();
          g.moveTo(s.trail[0]!.x, s.trail[0]!.y);
          g.lineTo(s.x, s.y);
          g.stroke();
        }
      }
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [roll]);

  const { rect } = roll;
  const style = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  } as CSSProperties;
  return (
    <div className="firework-ghost" aria-hidden="true" inert>
      <div className="firework-ghost__card" style={style}>
        <FlipCard
          card={roll.card}
          side={roll.side}
          hintsShown={roll.hintsShown}
          onFlip={() => undefined}
          decorative
        />
      </div>
      <canvas ref={sky} className="firework-ghost__sky" />
    </div>
  );
}
