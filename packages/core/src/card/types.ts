import type { LangCode, TextDir } from '../lang/languages';
import type { ItemType } from '../item/types';

export type AnswerKind = 'translation' | 'explanation';

/** What the main answer lines are (PRD §9.3, D-024). */
export type AnswerMain = 'parallel' | 'meaning' | 'explanation';

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
    /** What `lines` are: the parallel, the meaning (no parallel), or the explanation. */
    main: AnswerMain;
    lines: string[];
    numbered: boolean;
    /** The meaning, shown under a parallel (empty otherwise, or when there is none). */
    meaning: string[];
    /** Word-for-word translation in the answer language; only for translations (may be empty). */
    literal: string[];
  } & LangDir;
  hints: string[];
  synonyms: string[];
  extrasLang: LangDir;
};
