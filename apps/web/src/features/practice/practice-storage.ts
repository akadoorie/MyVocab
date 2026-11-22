import { cardViewSchema } from '@myvocab/contracts';
import type { CardView, PracticeState, StartChoices } from '@myvocab/core';
import { z } from 'zod';
import { readJson, removeKey, writeJson } from '../../lib/storage';

/**
 * The current practice lives in sessionStorage so a refresh resumes it (PRD FR-L33). It holds item
 * ids, state and the card content of this practice only; it is removed on Stop and when the practice ends.
 */
const KEY = 'myvocab.practice.v1';

const ids = z.array(z.number().int());
const mark = z.object({
  id: z.number().int(),
  round: z.number().int().min(1),
  /** Know · ask again (FR-L27a); without it a refresh would turn it into a plain Know. */
  again: z.literal(true).optional(),
});

const practiceStateSchema = z.object({
  phase: z.enum(['deciding', 'revealed', 'roundBreak', 'finished', 'stopped']),
  round: z.number().int().min(1),
  order: ids,
  index: z.number().int().min(0),
  side: z.enum(['front', 'back']),
  hintsShown: z.boolean(),
  hintsOpen: z.array(z.number().int()).optional(),
  nextRound: ids,
  known: z.array(mark),
  // `lastKnow` (the old Undo) is gone; Zod drops it from practices saved before, so they resume.
  totalCards: z.number().int().min(1),
  rng: z.number().int(),
}) satisfies z.ZodType<PracticeState>;

const storedPracticeSchema = z.object({
  cards: z.array(cardViewSchema).min(1),
  state: practiceStateSchema,
  undoWindowSeconds: z.number().int().min(1).max(15),
  /** Countdown on the break between rounds, from the settings at start (D-068). */
  continueSeconds: z.number().int().min(0).max(30).optional(),
  /** Next's countdown after "I don't know", from the settings at start (D-069). */
  nextSeconds: z.number().int().min(0).max(30).optional(),
  selection: z.object({
    sourceLang: z.string(),
    targetLang: z.string(),
    topicId: z.number().int().nullable(),
    size: z.number().int(),
    sample: z.boolean().optional(),
  }),
  isGuest: z.boolean(),
  /** The summary's celebration was shown (FR-L32a); after Back it isn't repeated. */
  celebrated: z.boolean().optional(),
  /** Flip was pressed in this practice: it stops pulsing (D-066). */
  flipped: z.boolean().optional(),
});

export type StoredPractice = {
  cards: CardView[];
  state: PracticeState;
  undoWindowSeconds: number;
  continueSeconds?: number;
  nextSeconds?: number;
  selection: StartChoices;
  isGuest: boolean;
  celebrated?: boolean;
  flipped?: boolean;
};

/**
 * Cards saved by an older version lack newer answer fields: fill them in place, so a practice
 * running during a deploy resumes instead of being dropped. Before D-024 there was no
 * `main` / `meaning` (the lines were the translation, now the parallel, or the explanation);
 * before D-026 there was no `literalSameAsParallel`.
 */
function upgradeCards(v: unknown): void {
  const cards = (v as { cards?: unknown } | null)?.cards;
  if (!Array.isArray(cards)) return;
  for (const card of cards) {
    const answer = (card as { answer?: Record<string, unknown> } | null)?.answer;
    if (!answer || typeof answer !== 'object') continue;
    if (!('main' in answer)) {
      answer.main = answer.kind === 'explanation' ? 'explanation' : 'parallel';
      answer.meaning = [];
    }
    if (!('literalSameAsParallel' in answer)) answer.literalSameAsParallel = false;
  }
}

/** A practice saved before D-039 keeps its topic under the old name `categoryId`. */
function upgradeSelection(v: unknown): void {
  const selection = (v as { selection?: Record<string, unknown> } | null)?.selection;
  if (selection && typeof selection === 'object' && !('topicId' in selection)) {
    selection.topicId = selection.categoryId ?? null;
    delete selection.categoryId;
  }
}

const isStoredPractice = (v: unknown): v is StoredPractice => {
  upgradeCards(v);
  upgradeSelection(v);
  const parsed = storedPracticeSchema.safeParse(v);
  if (!parsed.success) return false;
  const cardIds = new Set(parsed.data.cards.map((c) => c.itemId));
  return parsed.data.state.order.every((id) => cardIds.has(id));
};

export function loadPractice(): StoredPractice | null {
  return readJson('session', KEY, isStoredPractice);
}

export function savePractice(practice: StoredPractice): void {
  writeJson('session', KEY, practice);
}

export function clearPractice(): void {
  removeKey('session', KEY);
}
