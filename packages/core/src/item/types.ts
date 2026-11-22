import type { LangCode } from '../lang/languages';

export const ITEM_STATUSES = ['draft', 'published'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Entries per other language: { "he": ["מהיר", "סנונית"] } (PRD §8.1). */
export type Translations = Record<LangCode, string[]>;

/** The learnable content of an item (PRD §8.1), without database bookkeeping. */
export type ItemContent = {
  lang: LangCode;
  /** A word, an expression or anything else: its topics classify it (D-046). */
  text: string;
  multipleMeanings: boolean;
  /**
   * The three kinds of translation into other languages (PRD §8.1, D-024), each optional per
   * language. `parallel`: the equivalent word or expression ("The cat is out of the bag");
   * `meaning`: what it means ("The truth came out"); `literal`: word for word ("The awl came out
   * of the sack"). A plain word keeps only the parallel.
   */
  parallel: Translations;
  meaning: Translations;
  literal: Translations;
  explanation: string[];
  synonyms: string[];
  hints: string[];
};

/** An item as the card builder and practice selection see it. */
export type ItemData = ItemContent & { id: number };

/** The list fields of an item that hold entries in the item's own language. */
export const OWN_LANGUAGE_LISTS = ['explanation', 'synonyms', 'hints'] as const;
export type OwnLanguageList = (typeof OWN_LANGUAGE_LISTS)[number];

/** The per-language translation fields, in display order (PRD §8.1). */
export const TRANSLATION_KINDS = ['meaning', 'parallel', 'literal'] as const;
export type TranslationKind = (typeof TRANSLATION_KINDS)[number];

/**
 * The marker for "the literal translation into this language is the same as its parallel"
 * (D-026): the only entry of `literal[lang]`, so the text is never stored twice and an empty
 * literal still means "not filled in".
 */
export const LITERAL_SAME_AS_PARALLEL = '=parallel';

/** True when a literal list is the "same as the parallel" marker. */
export function isLiteralSameAsParallel(entries: readonly string[] | undefined): boolean {
  return entries?.length === 1 && entries[0] === LITERAL_SAME_AS_PARALLEL;
}
