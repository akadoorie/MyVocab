import { answerOf, type PracticeState } from '@myvocab/core';

/**
 * The round's progress bar (D-115): one thin segment per card in this round, on the version's
 * line under the header, so the card keeps its room. A card with an answer shows its colour
 * (green, orange or red); the current card glows. It always runs left to right, like the cards
 * and Next, in every language (D-096). Decorative: the counter above says "Card 4 of 10".
 * A round of a single card has no bar: one lone segment says nothing (D-132).
 */
export function RoundBar({ state }: { state: PracticeState }) {
  if (state.order.length < 2) return null;
  return (
    <div className="round-bar" dir="ltr" aria-hidden="true" data-testid="round-bar">
      {state.order.map((id, i) => {
        const answer = answerOf(state, id);
        return (
          <span
            key={id}
            className={`round-bar__seg ${answer ? `is-${answer}` : ''} ${i === state.index ? 'is-current' : ''}`}
          />
        );
      })}
    </div>
  );
}
