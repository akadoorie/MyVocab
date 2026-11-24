import type { CardAnswer, CardSide, CardView } from '@myvocab/core';
import { useEffect, type CSSProperties } from 'react';
import { FlipCard } from './FlipCard';

export type CardSlide = {
  key: number;
  card: CardView;
  side: CardSide;
  hintsShown: boolean;
  answer: CardAnswer | null;
  /** Where the card was on screen. */
  rect: { top: number; left: number; width: number; height: number };
  /** The way the old card leaves: left for Next, right for Back. */
  to: 'left' | 'right';
};

/** Keep in sync with base.css: slide-out. */
export const SLIDE_MS = 550;

/**
 * Next and Back (PRD §9.4, D-110): a visual copy of the card slides out sideways (left for Next,
 * right for Back) while the new card slides in from the other side. Purely decorative: hidden
 * from assistive tech, not interactive; skipped with reduced motion.
 */
export function SlideGhost({ slide, onDone }: { slide: CardSlide; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, SLIDE_MS + 60);
    return () => window.clearTimeout(id);
  }, [onDone]);

  const { rect } = slide;
  const style = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  } as CSSProperties;
  return (
    <div className={`slide-ghost slide-ghost--${slide.to}`} style={style} aria-hidden="true" inert>
      <FlipCard
        card={slide.card}
        side={slide.side}
        hintsShown={slide.hintsShown}
        answer={slide.answer}
        onFlip={() => undefined}
        decorative
      />
    </div>
  );
}
