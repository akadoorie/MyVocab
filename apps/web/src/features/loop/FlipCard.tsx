import type { CardAnswer, CardSide, CardView } from '@myvocab/core';
import { FlipIcon } from '../../components/Icons';
import { LoopButton } from './ButtonBar';
import { strings } from '../../strings';
import { HintsArea } from './HintsArea';
import { HintsCover } from './HintsCover';

/**
 * The "Clicked: …" chip on a card reached with Back (FR-L29a, D-049): short, its colour tells the
 * two Knows apart; the orange one's caption is there for screen readers only.
 */
// A function, not a constant: it must read the strings of the language active now (D-080).
const chips = (): Record<
  CardAnswer,
  { color: string; text: string; extra?: string; mark: string }
> => ({
  know: { color: 'text-know', text: strings.card.answeredKnow, mark: '✓' },
  knowAgain: {
    color: 'text-again',
    text: strings.card.answeredKnowAgainShort,
    extra: strings.card.answeredKnowAgainExtra,
    mark: '✓',
  },
  dontKnow: { color: 'text-dontknow', text: strings.card.answeredDontKnow, mark: '✗' },
});

/** The chip above the answer: what the main answer lines are (PRD §9.3, D-024). */
function mainHeadline(card: CardView): string {
  const { main } = card.answer;
  if (main === 'explanation') return strings.card.explanation;
  if (main === 'meaning') return strings.card.meaning;
  return card.answer.literalSameAsParallel
    ? strings.card.parallelAlsoLiteral
    : strings.card.parallel;
}

/** A labelled group of answer entries; two or more are numbered (D-024). */
function Section(props: {
  label: string;
  entries: string[];
  card: CardView;
  className: string;
  muted?: boolean;
  testId?: string;
}) {
  const { label, entries, card, className, muted, testId } = props;
  const many = entries.length > 1;
  return (
    <div className={className} data-testid={testId}>
      <p
        className={`mb-1 text-xs font-semibold tracking-wide uppercase md:text-sm ${muted ? 'opacity-80' : 'text-accent'}`}
      >
        {label}
      </p>
      <ol lang={card.answer.lang} dir={card.answer.dir} className="space-y-1">
        {entries.map((e, i) => (
          <li key={e}>
            {many && <span className="me-2 opacity-60">{i + 1}.</span>}
            {e}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Extras({ card }: { card: CardView }) {
  const { hints, synonyms, extrasLang } = card;
  if (hints.length === 0 && synonyms.length === 0) {
    return <p className="text-muted">{strings.card.noHints}</p>;
  }
  return (
    <div lang={extrasLang.lang} dir={extrasLang.dir} className="space-y-2 text-lg text-muted">
      {/* Synonyms first, then the hint sentences after one empty line (D-050). */}
      {synonyms.length > 0 && (
        <p>
          {/* The label a little brighter than the muted text around it. It is UI text inside a
              line in the content's direction: isolated, with the colon outside it (D-080). */}
          <bdi lang={strings.locale.lang} className="font-medium text-[#cdc6e6]">
            {strings.card.synonyms}
          </bdi>
          : {synonyms.join(', ')}
        </p>
      )}
      {hints.length > 0 && (
        // After synonyms, a gap: one empty line on desktop (pt-5 + the 0.5rem gap = 1.75rem), a
        // tighter 1rem on phones, where the hints area is short (D-051).
        <ul
          className={`space-y-1 ${synonyms.length > 0 ? 'pt-2 md:pt-5' : ''}`}
          aria-label={strings.card.hints}
        >
          {hints.map((h) => (
            <li key={h} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The flip card (PRD FR-L22, §9.3–9.4). Front: the item, the multiple-meanings badge, and the
 * hints and synonyms under a live cover that a tap reveals (D-047). Back: the answer lines and,
 * for a translation, the literal meaning if any; then hints and synonyms (always, uncovered).
 * Only the round Flip button (or F / Space) turns the card: a tap elsewhere does nothing (D-047).
 */
export function FlipCard({
  card,
  side,
  hintsShown,
  onFlip,
  onToggleHints = () => undefined,
  decorative = false,
  answer = null,
  pulse = false,
  nudging = null,
}: {
  card: CardView;
  side: CardSide;
  hintsShown: boolean;
  onFlip: () => void;
  /** Tapping the cover over the hints (D-047). */
  onToggleHints?: () => void;
  /** A purely visual copy (the Know animation): no test ids. */
  decorative?: boolean;
  /** The answer already given, on a card reached with Back (FR-L29a): shown as a chip. */
  answer?: CardAnswer | null;
  /** Flip pulses gently until it's first used in the session (D-066). */
  pulse?: boolean;
  /** Pump and shine, or shine alone, with the answer buttons (D-066, D-074); only the shine while it pulses. */
  nudging?: 'full' | 'shine' | null;
}) {
  const tid = (id: string) => (decorative ? undefined : id);
  const label = `${card.direction.source.toUpperCase()} → ${card.direction.target.toUpperCase()}`;
  const front = side === 'front';
  const Answer = card.answer.numbered ? 'ol' : 'ul';
  // On both faces; the test id goes on the front one only.
  const CHIP = chips();
  const answerChip = (face: 'front' | 'back') =>
    answer && (
      <p
        className={`chip shrink-0 whitespace-nowrap ${CHIP[answer].color}`}
        data-testid={face === 'front' ? tid('answer-chip') : undefined}
      >
        {CHIP[answer].text}
        {CHIP[answer].extra && <span className="sr-only">{CHIP[answer].extra}</span>}{' '}
        <span aria-hidden="true">{CHIP[answer].mark}</span>
      </p>
    );
  // The only way to turn the card (with F / Space): a stray tap must not flip it (D-047).
  const flipButton = (
    <LoopButton
      kind="round"
      icon={<FlipIcon />}
      label={strings.loop.flip}
      // While it pulses (not used yet this session) it still shines with the others, without the
      // pump, which would fight the pulse (D-074).
      className={`flip-card__flip ${
        pulse
          ? `is-breathing ${nudging ? 'is-shining nudge-4' : ''}`
          : nudging
            ? `${nudging === 'full' ? 'is-nudging' : 'is-shining'} nudge-4`
            : ''
      }`}
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
      <div className="flip-card__inner" data-testid={tid('flip-card')} data-side={side}>
        <div className="flip-card__face flip-card__front" inert={!front} aria-hidden={!front}>
          {/* One line with the direction, on phones too (D-049). The direction stays on the left in
              every language (D-080): reversed on right-to-left pages, so the answer chip goes right. */}
          <div className="flex items-center justify-between gap-2 rtl:flex-row-reverse">
            <p className="chip shrink-0">{label}</p>
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
          {/* Hints and synonyms under a live cover; nothing to cover when there are none (D-047). */}
          <div
            className="flex min-h-0 flex-1 flex-col border-t border-border pt-4"
            data-testid={hintsShown ? tid('front-hints') : undefined}
          >
            {card.hints.length === 0 && card.synonyms.length === 0 ? (
              <Extras card={card} />
            ) : (
              <HintsCover open={hintsShown} onToggle={onToggleHints} active={front && !decorative}>
                <Extras card={card} />
              </HintsCover>
            )}
          </div>
          {hintsShown && (card.hints.length > 0 || card.synonyms.length > 0) && (
            // A tap on the hints covers them again (D-078); this button stays for the keyboard and
            // screen readers, out of sight until it has keyboard focus.
            <button
              type="button"
              className="hints-hide sr-only focus-visible:not-sr-only"
              onClick={(e) => {
                e.stopPropagation();
                onToggleHints();
              }}
            >
              {strings.card.hideHints}
            </button>
          )}
          {flipButton}
        </div>

        <div className="flip-card__face flip-card__back" inert={front} aria-hidden={front}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {card.answer.kind === 'explanation' ? (
              <p className="chip">{mainHeadline(card)}</p>
            ) : (
              <span />
            )}
            {answerChip('back')}
          </div>
          <div className="flex min-h-[46%] shrink-0 flex-col items-center justify-center py-4 text-center">
            {card.answer.kind === 'translation' ? (
              <Section
                label={mainHeadline(card)}
                entries={card.answer.lines}
                card={card}
                className="text-[clamp(1.75rem,5.5vw,3.25rem)] font-bold"
              />
            ) : (
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
            )}
            {card.answer.kind === 'translation' && card.answer.meaning.length > 0 && (
              <Section
                testId={tid('meaning')}
                label={strings.card.meaning}
                entries={card.answer.meaning}
                card={card}
                className="mt-5 text-xl font-semibold text-text md:text-2xl"
              />
            )}
            {card.answer.literal.length > 0 && (
              <Section
                testId={tid('literal')}
                label={strings.card.literal}
                entries={card.answer.literal}
                card={card}
                muted
                className="mt-4 text-base text-muted md:text-lg"
              />
            )}
          </div>
          <div
            className="flex min-h-0 flex-1 flex-col border-t border-border pt-4"
            data-testid={tid('back-hints')}
          >
            {/* Long hints scroll on their own under the answer (D-050). */}
            <HintsArea>
              <Extras card={card} />
            </HintsArea>
          </div>
          {flipButton}
        </div>
      </div>
    </div>
  );
}
