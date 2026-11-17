import type { LangCode } from '../lang/languages';
import type { ItemContent } from '../item/types';
import type { AnswerKind } from './types';

/**
 * The back of the card is a strategy (PRD §10.4, Open/Closed): different languages show the
 * translation, the same language shows the explanation. Adding another kind of back later means
 * adding one strategy here.
 */
export interface AnswerStrategy {
  readonly kind: AnswerKind;
  appliesTo(source: LangCode, target: LangCode): boolean;
  /** Has at least one entry to show for this target (PRD FR-L40). */
  isPlayable(item: ItemContent, target: LangCode): boolean;
  answerLines(item: ItemContent, target: LangCode): string[];
  numbered(lines: readonly string[]): boolean;
}

export const translationStrategy: AnswerStrategy = {
  kind: 'translation',
  appliesTo: (source, target) => source !== target,
  isPlayable: (item, target) => (item.translation[target]?.length ?? 0) > 0,
  answerLines: (item, target) => [...(item.translation[target] ?? [])],
  numbered: () => false,
};

export const explanationStrategy: AnswerStrategy = {
  kind: 'explanation',
  appliesTo: (source, target) => source === target,
  isPlayable: (item) => item.explanation.length > 0,
  answerLines: (item) => [...item.explanation],
  numbered: (lines) => lines.length >= 2,
};

export const answerStrategies: readonly AnswerStrategy[] = [
  translationStrategy,
  explanationStrategy,
];

export function strategyFor(source: LangCode, target: LangCode): AnswerStrategy {
  const strategy = answerStrategies.find((s) => s.appliesTo(source, target));
  /* c8 ignore next */
  if (!strategy) throw new Error(`No answer strategy for ${source} → ${target}`);
  return strategy;
}

/**
 * Can this item be used for the direction source → target? (PRD FR-L40, minus status/Trash,
 * which the database query checks.) The item's language must be the source.
 */
export function isPlayableFor(item: ItemContent, source: LangCode, target: LangCode): boolean {
  return item.lang === source && strategyFor(source, target).isPlayable(item, target);
}

/** Every direction an item can be played in, given the active languages. */
export function playableTargets(item: ItemContent, activeLangs: readonly LangCode[]): LangCode[] {
  return activeLangs.filter((target) => isPlayableFor(item, item.lang, target));
}
