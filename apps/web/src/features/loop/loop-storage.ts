import { cardViewSchema } from '@myvocab/contracts';
import type { CardView, LoopState, StartChoices } from '@myvocab/core';
import { z } from 'zod';
import { readJson, removeKey, writeJson } from '../../lib/storage';

/**
 * The current loop lives in sessionStorage so a refresh resumes it (PRD FR-L33). It holds item
 * ids, state and the card content of this loop only; it is removed on Stop and when the loop ends.
 */
const KEY = 'myvocab.loop.v1';

const ids = z.array(z.number().int());
const mark = z.object({ id: z.number().int(), cycle: z.number().int().min(1) });

const loopStateSchema = z.object({
  phase: z.enum(['deciding', 'revealed', 'cycleBreak', 'finished', 'stopped']),
  cycle: z.number().int().min(1),
  order: ids,
  index: z.number().int().min(0),
  side: z.enum(['front', 'back']),
  hintsShown: z.boolean(),
  nextCycle: ids,
  known: z.array(mark),
  // `lastKnow` (the old Undo) is gone; Zod drops it from sessions saved before, so they resume.
  totalCards: z.number().int().min(1),
  rng: z.number().int(),
}) satisfies z.ZodType<LoopState>;

const storedLoopSchema = z.object({
  cards: z.array(cardViewSchema).min(1),
  state: loopStateSchema,
  undoWindowSeconds: z.number().int().min(1).max(15),
  selection: z.object({
    sourceLang: z.string(),
    targetLang: z.string(),
    categoryId: z.number().int().nullable(),
    type: z.enum(['word', 'expr']),
    size: z.number().int(),
  }),
  isGuest: z.boolean(),
  /** The summary's celebration was shown (FR-L32a); after Back it isn't repeated. */
  celebrated: z.boolean().optional(),
});

export type StoredLoop = {
  cards: CardView[];
  state: LoopState;
  undoWindowSeconds: number;
  selection: StartChoices;
  isGuest: boolean;
  celebrated?: boolean;
};

const isStoredLoop = (v: unknown): v is StoredLoop => {
  const parsed = storedLoopSchema.safeParse(v);
  if (!parsed.success) return false;
  const cardIds = new Set(parsed.data.cards.map((c) => c.itemId));
  return parsed.data.state.order.every((id) => cardIds.has(id));
};

export function loadLoop(): StoredLoop | null {
  return readJson('session', KEY, isStoredLoop);
}

export function saveLoop(loop: StoredLoop): void {
  writeJson('session', KEY, loop);
}

export function clearLoop(): void {
  removeKey('session', KEY);
}
