import type { LangCode, TextDir } from '../lang/languages';
import type { ItemType } from '../item/types';

export type AnswerKind = 'translation' | 'explanation';

export type LangDir = { lang: LangCode; dir: TextDir };

/** One card as the browser renders it (PRD §12.1). Composed only by the server (FR-L41). */
export type CardView = {
  itemId: number;
  type: ItemType;
  direction: { source: LangCode; target: LangCode };
  multipleMeanings: boolean;
  front: { text: string } & LangDir;
  answer: {
    kind: AnswerKind;
    lines: string[];
    numbered: boolean;
    /** Word-for-word meaning in the answer language; only for translations (may be empty). */
    literal: string[];
  } & LangDir;
  hints: string[];
  synonyms: string[];
  extrasLang: LangDir;
};
