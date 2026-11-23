import type { CardSide, CardView } from '@myvocab/core';
import { useEffect, type CSSProperties } from 'react';
import { FlipCard } from './FlipCard';

export type KnowRoll = {
  key: number;
  card: CardView;
  side: CardSide;
  hintsShown: boolean;
  /** Where the card was on screen. */
  rect: { top: number; left: number; width: number; height: number };
  /** Know · ask again: the counter pops amber instead of green (FR-L27a). */
  again?: boolean;
  /** The green Know bursts like a firework (D-103); the orange one rolls up like paper. */
  kind?: 'roll' | 'firework';
  /** From the card's center to the "known" counter's center. */
  dx: number;
  dy: number;
};

/** Total length of the roll + flight (keep in sync with base.css: 560ms + 400ms). */
export const ROLL_MS = 960;

/**
 * The Know animation (PRD §9.4, D-094): a visual copy of the card rolls up like a sheet of paper,
 * from its bottom edge to its top, into a tight scroll; the scroll then flies along a curve into
 * the "N known" counter, while the next card rises in underneath. Purely decorative: hidden from
 * assistive tech, not interactive.
 */
export function RollGhost({ roll, onDone }: { roll: KnowRoll; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, ROLL_MS + 80);
    return () => window.clearTimeout(id);
  }, [onDone]);

  const { rect, dx, dy } = roll;
  const style = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    '--h': `${rect.height}px`,
    '--dx': `${dx}px`,
    '--dy': `${dy}px`,
  } as CSSProperties;

  return (
    <div className="roll-ghost" style={style} aria-hidden="true" inert>
      <div className="roll-ghost__sheet">
        <FlipCard
          card={roll.card}
          side={roll.side}
          hintsShown={roll.hintsShown}
          onFlip={() => undefined}
          decorative
        />
      </div>
      <div className="roll-ghost__x">
        <div className="roll-ghost__y">
          <div className="roll-ghost__tube" />
        </div>
      </div>
    </div>
  );
}
