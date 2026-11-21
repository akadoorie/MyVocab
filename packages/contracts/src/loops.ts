import { z } from 'zod';
import type { CardView } from '@myvocab/core';
import { dirSchema as dir, langCodeSchema as langCode } from './common';

/** GET /api/meta (PRD §12.1). */
export const metaResponseSchema = z.object({
  languages: z.array(z.object({ code: langCode, name: z.string(), nativeName: z.string(), dir })),
  topics: z.array(z.object({ id: z.number().int(), slug: z.string(), name: z.string() })),
  defaults: z.object({
    sourceLang: langCode,
    targetLang: langCode,
    topicId: z.number().int().nullable(),
    size: z.number().int(),
  }),
  sizeOptions: z.array(z.number().int()),
  guest: z.object({ enabled: z.boolean(), loopSize: z.number().int() }),
  undoWindowSeconds: z.number().int(),
  maintenance: z.object({ enabled: z.boolean(), message: z.string() }),
  turnstileSiteKey: z.string(),
});
export type MetaResponse = z.infer<typeof metaResponseSchema>;

/** GET /api/stats/registered-users: accounts that are not admins and not banned (D-036). */
export const registeredUsersResponseSchema = z.object({
  registeredUsers: z.number().int().nonnegative(),
});
export type RegisteredUsersResponse = z.infer<typeof registeredUsersResponseSchema>;

/** Query of GET /api/loops/available. */
export const availableQuerySchema = z
  .object({
    source: langCode,
    target: langCode,
    topicId: z.coerce.number().int().positive().optional(),
    /** Only the sample set (D-038): forced for guests; admins may ask for it to check the set. */
    sample: z.enum(['true', 'false']).optional(),
  })
  .strict();
export type AvailableQuery = z.infer<typeof availableQuerySchema>;

export const availableResponseSchema = z.object({ available: z.number().int().nonnegative() });
export type AvailableResponse = z.infer<typeof availableResponseSchema>;

/** Body of POST /api/loops. */
export const startLoopRequestSchema = z
  .object({
    source: langCode,
    target: langCode,
    topicId: z.number().int().positive().nullable(),
    size: z.number().int().positive().max(1000).optional(),
    /** Only the sample set (D-038): forced for guests; admins may ask for it. */
    sample: z.boolean().optional(),
    turnstileToken: z.string().min(1).max(4096).optional(),
  })
  .strict();
export type StartLoopRequest = z.infer<typeof startLoopRequestSchema>;

const langDir = { lang: langCode, dir };

/** One card as rendered by the browser (mirrors `CardView` in @myvocab/core). */
export const cardViewSchema = z.object({
  itemId: z.number().int(),
  direction: z.object({ source: langCode, target: langCode }),
  multipleMeanings: z.boolean(),
  front: z.object({ text: z.string(), ...langDir }),
  answer: z.object({
    kind: z.enum(['translation', 'explanation']),
    main: z.enum(['parallel', 'meaning', 'explanation']),
    lines: z.array(z.string()).min(1),
    numbered: z.boolean(),
    meaning: z.array(z.string()),
    literal: z.array(z.string()),
    literalSameAsParallel: z.boolean(),
    ...langDir,
  }),
  hints: z.array(z.string()),
  synonyms: z.array(z.string()),
  extrasLang: z.object(langDir),
}) satisfies z.ZodType<CardView>;

export const startLoopResponseSchema = z.object({
  requested: z.number().int(),
  returned: z.number().int(),
  cards: z.array(cardViewSchema),
});
export type StartLoopResponse = z.infer<typeof startLoopResponseSchema>;
