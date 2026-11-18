import type { CardSide, CardView } from '@myvocab/core';
import { useEffect, type CSSProperties } from 'react';
import { FlipCard } from './FlipCard';

export type Crumple = {
  key: number;
  card: CardView;
  side: CardSide;
  hintsShown: boolean;
  /** Where the card was on screen. */
  rect: { top: number; left: number; width: number; height: number };
  /** From the card's center to the "known" counter's center. */
  dx: number;
  dy: number;
};

/** Total length of the crumple + fly-away (keep in sync with base.css). */
const DURATION_MS = 800;

/**
 * Crease points (in % of the card) around a slightly off-center middle: each neighbouring pair
 * plus the middle makes one triangular facet.
 */
const MIDDLE: [number, number] = [47, 53];
const RIM: [number, number][] = [
  [0, 0],
  [34, 0],
  [71, 0],
  [100, 0],
  [100, 42],
  [100, 100],
  [62, 100],
  [27, 100],
  [0, 100],
  [0, 58],
];

type Facet = { clip: string; vars: Record<string, string> };

/** Each facet tilts toward the middle in its own direction; alternate ones fold the other way. */
const FACETS: Facet[] = RIM.map((a, i) => {
  const b = RIM[(i + 1) % RIM.length] as [number, number];
  const cx = (MIDDLE[0] + a[0] + b[0]) / 3;
  const cy = (MIDDLE[1] + a[1] + b[1]) / 3;
  const sign = i % 2 === 0 ? 1 : -0.7;
  const shade = [0.42, 0.08, 0.3, 0.55, 0.14, 0.38, 0.05, 0.48, 0.22, 0.34][i] ?? 0.3;
  return {
    clip: `polygon(${MIDDLE[0]}% ${MIDDLE[1]}%, ${a[0]}% ${a[1]}%, ${b[0]}% ${b[1]}%)`,
    vars: {
      '--fx': `${((50 - cx) * 0.55).toFixed(1)}%`,
      '--fy': `${((50 - cy) * 0.55).toFixed(1)}%`,
      '--rx': `${(((cy - 50) / 50) * 75 * sign).toFixed(1)}deg`,
      '--ry': `${(((50 - cx) / 50) * 75 * sign).toFixed(1)}deg`,
      '--rz': `${(i % 3 === 0 ? 14 : i % 3 === 1 ? -9 : 5) * sign}deg`,
      '--shade': String(shade),
      '--light': String(shade < 0.15 ? 0.16 : 0),
    },
  };
});

/**
 * The Know animation (PRD §9.4): a visual copy of the card folds into ~10 lit and shadowed
 * facets like real crumpled paper and is sucked along a curve into the "N known" counter, while the next card rises in underneath. Purely
 * decorative: hidden from assistive tech, not interactive.
 */
export function CrumpleGhost({ crumple, onDone }: { crumple: Crumple; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, DURATION_MS + 80);
    return () => window.clearTimeout(id);
  }, [onDone]);

  const { rect, dx, dy } = crumple;
  const style = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    '--dx': `${dx}px`,
    '--dy': `${dy}px`,
    '--kx': Math.min(1, rect.height / rect.width),
    '--ky': Math.min(1, rect.width / rect.height),
  } as CSSProperties;

  return (
    <div className="crumple" style={style} aria-hidden="true" inert>
      <div className="crumple__x">
        <div className="crumple__y">
          <div className="paper">
            {FACETS.map((f) => (
              <div
                key={f.clip}
                className="paper__facet"
                style={{ clipPath: f.clip, ...f.vars } as CSSProperties}
              >
                <FlipCard
                  card={crumple.card}
                  side={crumple.side}
                  hintsShown={crumple.hintsShown}
                  onFlip={() => undefined}
                  decorative
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
