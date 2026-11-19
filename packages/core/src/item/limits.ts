/** Length and size limits for item content (PRD §8.1, §14.4). */
export const ITEM_LIMITS = {
  textMax: 200,
  parallel: { entryMax: 200, maxEntries: 10 },
  meaning: { entryMax: 300, maxEntries: 10 },
  literal: { entryMax: 200, maxEntries: 5 },
  explanation: { entryMax: 500, maxEntries: 10 },
  synonyms: { entryMax: 100, maxEntries: 20 },
  hints: { entryMax: 500, maxEntries: 20 },
} as const;

export type ListName = 'parallel' | 'meaning' | 'literal' | 'explanation' | 'synonyms' | 'hints';
