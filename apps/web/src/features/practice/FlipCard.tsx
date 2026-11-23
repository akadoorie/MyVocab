import type { CardAnswer, CardSide, CardView } from '@myvocab/core';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { FlipIcon } from '../../components/Icons';
import { PracticeButton } from './ButtonBar';
import { strings } from '../../strings';
import { en, type Strings } from '../../strings.en';
import { he } from '../../strings.he';
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

/** The smallest size the main text may shrink to (D-095). */
const MIN_FIT_PX = 12;

/**
 * Shrinks the text of a card's upper part until it fits above the line, which sits at the card's
 * middle (D-095): sets `--fit` (1 = full size) on the part, which every size in it is multiplied
 * by. The element marked `data-fit-main` must not go below MIN_FIT_PX. Runs again when the card
 * changes size or the fonts arrive.
 */
function useFitText(part: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const el = part.current;
    if (!el) return;
    const fits = () =>
      el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    const fit = () => {
      el.style.setProperty('--fit', '1');
      if (el.clientHeight === 0 || fits()) return;
      const main = el.querySelector<HTMLElement>('[data-fit-main]');
      const full = main ? parseFloat(getComputedStyle(main).fontSize) : 0;
      let lo = full > 0 ? Math.min(1, MIN_FIT_PX / full) : 0.3;
      let hi = 1;
      // Halve the range a few times: the largest size that fits, to within about 1%.
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        el.style.setProperty('--fit', String(mid));
        if (fits()) lo = mid;
        else hi = mid;
      }
      el.style.setProperty('--fit', String(lo));
    };
    fit();
    void document.fonts?.ready.then(fit);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [part]);
}

/** The answer's labels, in the answer's language (D-097): Hebrew for a Hebrew answer, else English. */
type AnswerLabels = Strings['card'];
const answerLabels = (lang: string): AnswerLabels => (lang === 'he' ? he.card : en.card);

/** The label of the main answer lines (PRD §9.3, D-024, D-097). */
function mainLabel(card: CardView, labels: AnswerLabels): string {
  const { main } = card.answer;
  if (main === 'explanation') return labels.explanation;
  // No parallel: for a plain word the meaning is simply its translation; an expression with a
  // literal translation (its words don't simply translate) keeps "Meaning" (D-097).
  if (main === 'meaning')
    return card.answer.literal.length > 0 ? labels.meaning : labels.translation;
  return card.answer.literalSameAsParallel ? labels.parallelAlsoLiteral : labels.parallel;
}

/**
 * One line of the answer (D-097): the label at the start of the line (right for Hebrew), and the
 * entries after it on the same line; two or more are numbered (D-024). Both cells sit in the
 * answer's two-column grid; this wrapper only carries the size, colour and test id.
 */
function Section(props: {
  label: string;
  entries: string[];
  card: CardView;
  className: string;
  muted?: boolean;
  testId?: string;
  /** The main answer: shrinking to fit stops when its text reaches the smallest size (D-095). */
  main?: boolean;
}) {
  const { label, entries, card, className, muted, testId, main } = props;
  const many = entries.length > 1;
  return (
    <div className={`contents ${className}`} data-testid={testId} data-fit-main={main || undefined}>
      <p className={`flip-card__label ${muted ? 'text-muted' : 'text-accent'}`}>{label}</p>
      {/* Spacing in em, so it shrinks with the text (D-095). */}
      <ol lang={card.answer.lang} dir={card.answer.dir} className="space-y-[0.15em] leading-snug">
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
  stamp = false,
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
  /** Right after "I don't know": an "AGAIN" stamp thumps onto the back, then fades (D-105). */
  stamp?: boolean;
}) {
  const tid = (id: string) => (decorative ? undefined : id);
  const frontTop = useRef<HTMLDivElement>(null);
  const backTop = useRef<HTMLDivElement>(null);
  useFitText(frontTop);
  useFitText(backTop);
  const label = `${card.direction.source.toUpperCase()} → ${card.direction.target.toUpperCase()}`;
  const labels = answerLabels(card.answer.lang);
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
  // The same row on both faces, so the direction and the chip stay put when the card turns
  // (D-049, D-091). The direction stays on the left in every language (D-080): reversed on
  // right-to-left pages, so the answer chip goes right.
  const topRow = (face: 'front' | 'back') => (
    <div className="flip-card__row flex items-center justify-between gap-2 rtl:flex-row-reverse">
      <p className="chip shrink-0">{label}</p>
      {answerChip(face)}
    </div>
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
          {topRow('front')}
          {/* The item sits in the upper half of the card and never moves; hints and synonyms
              appear below the line, which is at the card's middle on both faces (PRD §9.3, D-095).
              A long item shrinks to fit (useFitText). */}
          <div
            ref={frontTop}
            className="flip-card__top flex flex-col items-center gap-4 py-4 text-center [justify-content:safe_center]"
          >
            <p
              lang={card.front.lang}
              dir={card.front.dir}
              data-testid={tid('front-text')}
              data-fit-main
              className="text-[calc(var(--fit,1)*clamp(2.5rem,8vw,5.5rem))] leading-tight font-bold tracking-tight break-words"
            >
              {card.front.text}
            </p>
            {card.multipleMeanings && (
              <span className="rounded-[var(--radius-practice)] bg-surface-2 px-3 py-1 text-sm text-accent">
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
          {topRow('back')}
          {stamp && (
            // Decorative: the "Clicked: I don't know" chip already says it in words.
            <span className="dk-stamp" aria-hidden="true">
              {strings.practice.stampAgain}
            </span>
          )}
          {/* The answer starts on the side its language reads from (right for Hebrew) and shrinks
              to fit above the line (D-095). Each line has its label first, in the answer's
              language, then its entries (D-097). */}
          <div
            ref={backTop}
            dir={card.answer.dir}
            lang={card.answer.lang}
            className="flip-card__top flex flex-col py-2 text-start [justify-content:safe_center]"
          >
            <div className="flip-card__answer">
              {card.answer.kind === 'translation' ? (
                <Section
                  label={mainLabel(card, labels)}
                  entries={card.answer.lines}
                  card={card}
                  main
                  className="text-[calc(var(--fit,1)*clamp(1.75rem,5.5vw,3.25rem))] font-bold"
                />
              ) : (
                <div className="contents">
                  <p className="flip-card__label text-accent">
                    {card.answer.kind === 'explanation' ? mainLabel(card, labels) : ''}
                  </p>
                  <Answer
                    lang={card.answer.lang}
                    dir={card.answer.dir}
                    data-fit-main
                    className={[
                      'space-y-[0.3em] leading-snug font-semibold',
                      card.answer.kind === 'explanation' &&
                      card.answer.lines.some((l) => l.length > 60)
                        ? 'text-[calc(var(--fit,1)*1.125rem)] md:text-[calc(var(--fit,1)*1.25rem)]'
                        : 'text-[calc(var(--fit,1)*clamp(1.75rem,5.5vw,3.25rem))] font-bold',
                      card.answer.numbered ? 'list-inside list-decimal text-start' : '',
                    ].join(' ')}
                  >
                    {card.answer.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </Answer>
                </div>
              )}
              {card.answer.kind === 'translation' && card.answer.meaning.length > 0 && (
                <Section
                  testId={tid('meaning')}
                  label={labels.meaning}
                  entries={card.answer.meaning}
                  card={card}
                  className="text-[calc(var(--fit,1)*1.25rem)] font-semibold text-text md:text-[calc(var(--fit,1)*1.5rem)]"
                />
              )}
              {card.answer.literal.length > 0 && (
                <Section
                  testId={tid('literal')}
                  label={labels.literal}
                  entries={card.answer.literal}
                  card={card}
                  muted
                  className="text-[calc(var(--fit,1)*1rem)] text-muted md:text-[calc(var(--fit,1)*1.125rem)]"
                />
              )}
            </div>
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
