import type { LangCode } from '../lang/languages';

export const ITEM_TYPES = ['word', 'expr'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_STATUSES = ['draft', 'published'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Translations into other languages: { "he": ["מהיר", "סנונית"] } (PRD §8.1). */
export type Translations = Record<LangCode, string[]>;

/** The learnable content of an item (PRD §8.1), without database bookkeeping. */
export type ItemContent = {
  lang: LangCode;
  text: string;
  type: ItemType;
  multipleMeanings: boolean;
  translation: Translations;
  /**
   * Word-for-word translations per other language, for expressions whose literal words differ
   * from their meaning. Shown under the translation as "Literal meaning" (PRD §8.1). Optional.
   */
  literal: Translations;
  explanation: string[];
  synonyms: string[];
  hints: string[];
};

/** An item as the card builder and loop selection see it. */
export type ItemData = ItemContent & { id: number };

/** The list fields of an item that hold entries in the item's own language. */
export const OWN_LANGUAGE_LISTS = ['explanation', 'synonyms', 'hints'] as const;
export type OwnLanguageList = (typeof OWN_LANGUAGE_LISTS)[number];
