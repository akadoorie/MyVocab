import type { CardSide, CardView } from '@myvocab/core';
import type { KeyboardEvent } from 'react';
import { strings } from '../../strings';

function Extras({ card }: { card: CardView }) {
  const { hints, synonyms, extrasLang } = card;
  if (hints.length === 0 && synonyms.length === 0) {
    return <p className="text-muted">{strings.card.noHints}</p>;
  }
  return (
    <div
      lang={extrasLang.lang}
      dir={extrasLang.dir}
      className="space-y-2 text-base text-muted md:text-lg"
    >
      {hints.length > 0 && (
        <ul className="space-y-1" aria-label={strings.card.hints}>
          {hints.map((h) => (
            <li key={h} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
      {synonyms.length > 0 && (
        <p>
          <span className="font-medium">{strings.card.synonyms}</span> {synonyms.join(', ')}
        </p>
      )}
    </div>
  );
}

/**
 * The flip card (PRD FR-L22, §9.3–9.4). Front: the item, the multiple-meanings badge and, after
 * Hints, the hints and synonyms. Back: the answer lines, then hints and synonyms (always).
 */
export function FlipCard({
  card,
  side,
  hintsShown,
  onFlip,
}: {
  card: CardView;
  side: CardSide;
  hintsShown: boolean;
  onFlip: () => void;
}) {
  const label = `${card.direction.source.toUpperCase()} → ${card.direction.target.toUpperCase()} · ${strings.types[card.type]}`;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onFlip();
    }
  };
  const front = side === 'front';
  const Answer = card.answer.numbered ? 'ol' : 'ul';

  return (
    <div className={`flip-card ${front ? '' : 'is-flipped'}`}>
      <div
        role="button"
        tabIndex={0}
        aria-label={strings.card.flipLabel(card.front.text, side)}
        className="flip-card__inner"
        onClick={onFlip}
        onKeyDown={onKeyDown}
        data-testid="flip-card"
        data-side={side}
      >
        <div className="flip-card__face flip-card__front" inert={!front} aria-hidden={!front}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
            <p
              lang={card.front.lang}
              dir={card.front.dir}
              className="text-[clamp(2rem,6vw,3.5rem)] leading-tight font-semibold break-words"
            >
              {card.front.text}
            </p>
            {card.multipleMeanings && (
              <span className="rounded-full bg-surface-2 px-3 py-1 text-sm text-accent">
                ◆ {strings.card.multipleMeanings}
              </span>
            )}
          </div>
          {hintsShown && (
            <div className="border-t border-border pt-4" data-testid="front-hints">
              <Extras card={card} />
            </div>
          )}
          <span aria-hidden="true" className="self-end text-muted">
            ↻
          </span>
        </div>

        <div className="flip-card__face flip-card__back" inert={front} aria-hidden={front}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {card.answer.kind === 'translation'
              ? strings.card.translation
              : strings.card.explanation}
          </p>
          <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
            <Answer
              lang={card.answer.lang}
              dir={card.answer.dir}
              className={[
                'space-y-2 font-semibold',
                card.answer.kind === 'explanation' && card.answer.lines.some((l) => l.length > 60)
                  ? 'text-[1.125rem] md:text-[1.25rem]'
                  : 'text-[clamp(1.5rem,4.5vw,2.25rem)]',
                card.answer.numbered ? 'list-inside list-decimal text-start' : '',
              ].join(' ')}
            >
              {card.answer.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </Answer>
          </div>
          <div className="border-t border-border pt-4" data-testid="back-hints">
            <Extras card={card} />
          </div>
        </div>
      </div>
    </div>
  );
}
