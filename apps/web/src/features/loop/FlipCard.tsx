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
  decorative = false,
  answer = null,
}: {
  card: CardView;
  side: CardSide;
  hintsShown: boolean;
  onFlip: () => void;
  /** A purely visual copy (the Know animation): no test ids. */
  decorative?: boolean;
  /** The answer already given, on a card reached with Back (FR-L29a): shown as a chip. */
  answer?: 'know' | 'dontKnow' | null;
}) {
  const tid = (id: string) => (decorative ? undefined : id);
  const label = `${card.direction.source.toUpperCase()} → ${card.direction.target.toUpperCase()} · ${strings.types[card.type]}`;
  const front = side === 'front';
  const Answer = card.answer.numbered ? 'ol' : 'ul';
  // On both faces; the test id goes on the front one only.
  const answerChip = (face: 'front' | 'back') =>
    answer && (
      <p
        className={`chip ${answer === 'know' ? 'text-know' : 'text-dontknow'}`}
        data-testid={face === 'front' ? tid('answer-chip') : undefined}
      >
        {answer === 'know' ? strings.card.answeredKnow : strings.card.answeredDontKnow}{' '}
        <span aria-hidden="true">{answer === 'know' ? '✓' : '✗'}</span>
      </p>
    );
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
      <div
        className="flip-card__inner"
        onClick={onFlip}
        data-testid={tid('flip-card')}
        data-side={side}
      >
        <div className="flip-card__face flip-card__front" inert={!front} aria-hidden={!front}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="chip">{label}</p>
            {answerChip('front')}
          </div>
          {/* The item sits in the upper part of the card and never moves; hints and synonyms
              appear below it in the space kept for them (PRD §9.3). */}
          <div className="flex min-h-[46%] shrink-0 flex-col items-center justify-center gap-4 py-4 text-center">
            <p
              lang={card.front.lang}
              dir={card.front.dir}
              data-testid={tid('front-text')}
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
            <div className="border-t border-border pt-4" data-testid={tid('front-hints')}>
              <Extras card={card} />
            </div>
          )}
          {flipButton}
        </div>

        <div className="flip-card__face flip-card__back" inert={front} aria-hidden={front}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="chip">
              {card.answer.kind === 'translation'
                ? strings.card.translation
                : strings.card.explanation}
            </p>
            {answerChip('back')}
          </div>
          <div className="flex min-h-[46%] shrink-0 flex-col items-center justify-center py-4 text-center">
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
              <p className="mt-3 text-lg text-muted" data-testid={tid('literal')}>
                <span className="font-medium">{strings.card.literal}</span>{' '}
                <span lang={card.answer.lang} dir={card.answer.dir}>
                  {card.answer.literal.join(', ')}
                </span>
              </p>
            )}
          </div>
          <div className="border-t border-border pt-4" data-testid={tid('back-hints')}>
            <Extras card={card} />
          </div>
          {flipButton}
        </div>
      </div>
    </div>
  );
}
