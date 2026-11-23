import type { CardAnswer, CardSide, CardView } from '@myvocab/core';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { FlipIcon } from '../../components/Icons';
import { PracticeButton } from './ButtonBar';
import { strings } from '../../strings';
import { HintsArea } from './HintsArea';
import { HintsCover } from './HintsCover';

/**
 * The "Clicked: …" chip on a card reached with Back (FR-L29a, D-049): short, its colour tells the
 * two Knows apart; the orange one's caption is there for screen readers only.
 */
// A function, not a constant: it must read the strings of the language active now (D-080).
const chips = (): Record<CardAnswer, { color: string; text: string; extra?: string }> => ({
  know: { color: 'text-know', text: strings.card.answeredKnow },
  knowAgain: {
    color: 'text-again',
    text: strings.card.answeredKnowAgainShort,
    extra: strings.card.answeredKnowAgainExtra,
  },
  dontKnow: { color: 'text-dontknow', text: strings.card.answeredDontKnow },
});

/**
 * Keeps the line under the item (front) and under the answer (back) in the same place, so it
 * doesn't jump when the card turns (D-085). Each upper part is at least 46% of the card
 * (.flip-card__top, base.css); a longer item or answer, or a wrapped chip row, would push its own
 * line lower. Both lines go to the lower of the two (`--top-min`).
 */
function useSameLine(
  frontTop: RefObject<HTMLDivElement | null>,
  backTop: RefObject<HTMLDivElement | null>,
) {
  useLayoutEffect(() => {
    const els = [frontTop.current, backTop.current];
    if (els.some((el) => !el)) return;
    const parts = els as HTMLDivElement[];
    // Exact (fractional) positions from the face's top, so the two lines don't differ by a
    // rounded pixel. Turning the back face around its vertical axis keeps its heights; the card's
    // rise-in scales it a little (96%), so on-screen sizes are divided by that scale.
    const measure = (el: HTMLElement) => {
      const face = el.parentElement!;
      const box = face.getBoundingClientRect();
      const scale = face.offsetHeight > 0 && box.height > 0 ? box.height / face.offsetHeight : 1;
      const r = el.getBoundingClientRect();
      return { top: (r.top - box.top) / scale, height: r.height / scale };
    };
    const sync = () => {
      for (const el of parts) el.style.setProperty('--top-min', '0px');
      const sizes = parts.map(measure);
      const line = Math.max(...sizes.map((m) => m.top + m.height));
      parts.forEach((el, i) => el.style.setProperty('--top-min', `${line - sizes[i]!.top}px`));
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    // The faces (the card's size), the chip rows above, and the parts themselves (their text).
    const observer = new ResizeObserver(sync);
    for (const el of parts) {
      observer.observe(el);
      if (el.parentElement) observer.observe(el.parentElement);
      if (el.previousElementSibling) observer.observe(el.previousElementSibling);
    }
    return () => observer.disconnect();
  }, [frontTop, backTop]);
}

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
  /** Flip pulses gently until it's first used in the practice (D-066). */
  pulse?: boolean;
  /** Pump and shine, or shine alone, with the answer buttons (D-066, D-074); only the shine while it pulses. */
  nudging?: 'full' | 'shine' | null;
}) {
  const tid = (id: string) => (decorative ? undefined : id);
  const frontTop = useRef<HTMLDivElement>(null);
  const backTop = useRef<HTMLDivElement>(null);
  useSameLine(frontTop, backTop);
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
        {/* No ✓ / ✗: the answer buttons have none either (D-089). */}
        {CHIP[answer].extra && <span className="sr-only">{CHIP[answer].extra}</span>}
      </p>
    );
  // The only way to turn the card (with F / Space): a stray tap must not flip it (D-047).
  const flipButton = (
    <PracticeButton
      kind="round"
      icon={<FlipIcon />}
      label={strings.practice.flip}
      // While it pulses (not used yet this practice) it still shines with the others, without the
      // pump, which would fight the pulse (D-074).
      className={`flip-card__flip ${
        pulse
          ? `is-breathing ${nudging ? 'is-shining nudge-4' : ''}`
          : nudging
            ? `${nudging === 'full' ? 'is-nudging' : 'is-shining'} nudge-4`
            : ''
      }`}
      hideLabel
      title={strings.practice.flipTitle}
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
              appear below it in the space kept for them (PRD §9.3). Its height comes from
              .flip-card__top (base.css), the same on the back, so the line stays in place when
              flipping (D-085). */}
          <div
            ref={frontTop}
            className="flip-card__top flex shrink-0 flex-col items-center justify-center gap-4 py-4 text-center"
          >
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
          <div
            ref={backTop}
            className="flip-card__top flex shrink-0 flex-col items-center justify-center py-4 text-center"
          >
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
