import type { LangCode, LanguageMap, TextDir } from '../lang/languages';
import { isLiteralSameAsParallel, type ItemData } from '../item/types';
import { mainTranslation, strategyFor } from './strategies';
import type { CardView, LangDir } from './types';

export class CardBuildError extends Error {}

function langDir(lang: LangCode, languages: LanguageMap): LangDir {
  const dir: TextDir | undefined = languages[lang]?.dir;
  if (!dir) throw new CardBuildError(`Unknown language "${lang}"`);
  return { lang, dir };
}

/**
 * Composes one card exactly as the browser shows it (PRD §6.3, FR-L41). Used by `POST /practices`
 * and by the admin preview, so both always match. The source language is the item's language.
 */
export function buildCard(item: ItemData, target: LangCode, languages: LanguageMap): CardView {
  const source = item.lang;
  const strategy = strategyFor(source, target);
  if (!strategy.isPlayable(item, target)) {
    throw new CardBuildError(`Item ${item.id} has no ${strategy.kind} for ${source} → ${target}`);
  }
  const lines = strategy.answerLines(item, target);
  const translation = strategy.kind === 'translation';
  const main = translation ? mainTranslation(item, target) : 'explanation';
  const own = langDir(source, languages);
  const literal = translation ? (item.literal[target] ?? []) : [];
  // The marker is resolved here only, so it never reaches the screen as text (D-026).
  const marker = isLiteralSameAsParallel(literal);
  return {
    itemId: item.id,
    direction: { source, target },
    multipleMeanings: item.multipleMeanings,
    front: { text: item.text, ...own },
    answer: {
      kind: strategy.kind,
      main,
      lines,
      numbered: strategy.numbered(lines),
      meaning: main === 'parallel' ? [...(item.meaning[target] ?? [])] : [],
      literal: marker ? [] : [...literal],
      literalSameAsParallel: marker && main === 'parallel',
      ...langDir(target, languages),
    },
    hints: [...item.hints],
    synonyms: [...item.synonyms],
    extrasLang: own,
  };
}
