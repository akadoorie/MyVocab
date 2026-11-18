import type { CardSide, CardView } from '@myvocab/core';
import { FlipIcon } from '../../components/Icons';
import { LoopButton } from './ButtonBar';
import { strings } from '../../strings';

function Extras({ card }: { card: CardView }) {
  const { hints, synonyms, extrasLang } = card;
  if (hints.length === 0 && synonyms.length === 0) {
    return <p className="text-muted">{strings.card.noHints}</p>;
  }
  return (
    <div lang={extrasLang.lang} dir={extrasLang.dir} className="space-y-2 text-lg text-muted">
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
 * Hints, the hints and synonyms. Back: the answer lines and, for a translation, the literal
 * meaning if any; then hints and synonyms (always).
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
  const front = side === 'front';
  const Answer = card.answer.numbered ? 'ol' : 'ul';
  // The Flip button is the keyboard control; a tap anywhere else on the card is a pointer shortcut.
  const flipButton = (
    <LoopButton
      kind="round"
      icon={<FlipIcon />}
      label={strings.loop.flip}
      className="flip-card__flip"
      hideLabel
      title={strings.loop.flipTitle}
      onClick={(e) => {
        e.stopPropagation();
        onFlip();
      }}
    />
  );

  // The hidden face is inert and aria-hidden, so only the visible face's Flip button is reachable.
  return (
    <div className={`flip-card ${front ? '' : 'is-flipped'}`}>
      {/* A pointer shortcut: the Flip button and the F/Space keys are the keyboard controls. */}
      {/* eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions */}
      <div className="flip-card__inner" onClick={onFlip} data-testid="flip-card" data-side={side}>
        <div className="flip-card__face flip-card__front" inert={!front} aria-hidden={!front}>
          <p className="chip self-start">{label}</p>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
            <p
              lang={card.front.lang}
              dir={card.front.dir}
              data-testid="front-text"
              className="text-[clamp(2.5rem,8vw,5.5rem)] leading-tight font-bold tracking-tight break-words"
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
          {flipButton}
        </div>

        <div className="flip-card__face flip-card__back" inert={front} aria-hidden={front}>
          <p className="chip self-start">
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
                  : 'text-[clamp(1.75rem,5.5vw,3.25rem)] font-bold',
                card.answer.numbered ? 'list-inside list-decimal text-start' : '',
              ].join(' ')}
            >
              {card.answer.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </Answer>
            {card.answer.literal.length > 0 && (
              <p className="mt-3 text-lg text-muted" data-testid="literal">
                <span className="font-medium">{strings.card.literal}</span>{' '}
                <span lang={card.answer.lang} dir={card.answer.dir}>
                  {card.answer.literal.join(', ')}
                </span>
              </p>
            )}
          </div>
          <div className="border-t border-border pt-4" data-testid="back-hints">
            <Extras card={card} />
          </div>
          {flipButton}
        </div>
      </div>
    </div>
  );
}
