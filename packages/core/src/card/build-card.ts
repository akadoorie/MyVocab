import type { LangCode, LanguageMap, TextDir } from '../lang/languages';
import type { ItemData } from '../item/types';
import { strategyFor } from './strategies';
import type { CardView, LangDir } from './types';

export class CardBuildError extends Error {}

function langDir(lang: LangCode, languages: LanguageMap): LangDir {
  const dir: TextDir | undefined = languages[lang]?.dir;
  if (!dir) throw new CardBuildError(`Unknown language "${lang}"`);
  return { lang, dir };
}

/**
 * Composes one card exactly as the browser shows it (PRD §6.3, FR-L41). Used by `POST /loops`
 * and by the admin preview, so both always match. The source language is the item's language.
 */
export function buildCard(item: ItemData, target: LangCode, languages: LanguageMap): CardView {
  const source = item.lang;
  const strategy = strategyFor(source, target);
  if (!strategy.isPlayable(item, target)) {
    throw new CardBuildError(`Item ${item.id} has no ${strategy.kind} for ${source} → ${target}`);
  }
  const lines = strategy.answerLines(item, target);
  const own = langDir(source, languages);
  return {
    itemId: item.id,
    type: item.type,
    direction: { source, target },
    multipleMeanings: item.multipleMeanings,
    front: { text: item.text, ...own },
    answer: {
      kind: strategy.kind,
      lines,
      numbered: strategy.numbered(lines),
      ...langDir(target, languages),
    },
    hints: [...item.hints],
    synonyms: [...item.synonyms],
    extrasLang: own,
  };
}

/** Text for the Undo bar: "Date → תאריך, תמר", cut at about 40 characters (PRD FR-L27). */
export function undoBarLabel(card: CardView, maxAnswerChars = 40): string {
  const answer = card.answer.lines.join(', ');
  const cut =
    answer.length > maxAnswerChars ? `${answer.slice(0, maxAnswerChars).trimEnd()}…` : answer;
  return `${card.front.text} → ${cut}`;
}
