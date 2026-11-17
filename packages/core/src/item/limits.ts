/** Length and size limits for item content (PRD §8.1, §14.4). */
export const ITEM_LIMITS = {
  textMax: 200,
  translation: { entryMax: 200, maxEntries: 10 },
  explanation: { entryMax: 500, maxEntries: 10 },
  synonyms: { entryMax: 100, maxEntries: 20 },
  hints: { entryMax: 500, maxEntries: 20 },
} as const;

export type ListName = 'translation' | 'explanation' | 'synonyms' | 'hints';
