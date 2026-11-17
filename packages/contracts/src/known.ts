import { z } from 'zod';
import { dirSchema, itemIdSchema, itemTypeSchema, langCodeSchema } from './common';

/** Known items (PRD §6.4–6.5, §12.3). */
export const KNOWN_BATCH_MAX = 100;
export const KNOWN_RESTORE_IDS_MAX = 500;
export const KNOWN_PAGE_SIZE = 50;

/** One Know mark. `target` is kept for display only (FR-L50). */
export const knownMarkSchema = z
  .object({
    itemId: itemIdSchema,
    target: langCodeSchema,
    cycle: z.number().int().min(1).max(10_000),
  })
  .strict();
export type KnownMarkInput = z.infer<typeof knownMarkSchema>;

/** POST /api/me/known. */
export const postKnownRequestSchema = z
  .object({ items: z.array(knownMarkSchema).min(1).max(KNOWN_BATCH_MAX) })
  .strict();
export type PostKnownRequest = z.infer<typeof postKnownRequestSchema>;
export const postKnownResponseSchema = z.object({ saved: z.number().int().nonnegative() });

/** DELETE /api/me/known/:itemId. */
export const knownItemParamSchema = z.object({ itemId: z.coerce.number().int().positive() });
export const deleteKnownResponseSchema = z.object({ removed: z.number().int().nonnegative() });

const searchText = z.string().trim().max(100);

/** The filters of "My known words" (FR-L61), shared by the list and "Return all filtered". */
export const knownFilterSchema = z
  .object({
    q: searchText.optional(),
    lang: langCodeSchema.optional(),
    type: itemTypeSchema.optional(),
    categoryId: itemIdSchema.optional(),
  })
  .strict();
export type KnownFilter = z.infer<typeof knownFilterSchema>;

/** POST /api/me/known/restore: by ids or by filter (FR-L62). */
export const restoreKnownRequestSchema = z.union([
  z.object({ itemIds: z.array(itemIdSchema).min(1).max(KNOWN_RESTORE_IDS_MAX) }).strict(),
  z.object({ filter: knownFilterSchema }).strict(),
]);
export type RestoreKnownRequest = z.infer<typeof restoreKnownRequestSchema>;
export const restoreKnownResponseSchema = z.object({ restored: z.number().int().nonnegative() });

export const knownSortSchema = z.enum(['newest', 'oldest', 'az']);
export type KnownSort = z.infer<typeof knownSortSchema>;

/** GET /api/me/known query. */
export const knownListQuerySchema = z
  .object({
    q: searchText.optional(),
    lang: langCodeSchema.optional(),
    type: itemTypeSchema.optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    sort: knownSortSchema.default('newest'),
    cursor: z.string().min(1).max(600).optional(),
  })
  .strict();
export type KnownListQuery = z.input<typeof knownListQuerySchema>;

/** One row of "My known words" (FR-L60). */
export const knownItemSchema = z.object({
  itemId: itemIdSchema,
  text: z.string(),
  lang: langCodeSchema,
  dir: dirSchema,
  type: itemTypeSchema,
  multipleMeanings: z.boolean(),
  knownTarget: langCodeSchema,
  /** The answer in the direction where it was marked (may be empty if the item changed since). */
  answer: z.object({
    kind: z.enum(['translation', 'explanation']),
    lines: z.array(z.string()),
    numbered: z.boolean(),
    lang: langCodeSchema,
    dir: dirSchema,
  }),
  categories: z.array(z.object({ id: z.number().int(), name: z.string() })),
  knownAt: z.number().int(),
  knownInCycle: z.number().int().min(1),
});
export type KnownItem = z.infer<typeof knownItemSchema>;

export const knownListResponseSchema = z.object({
  items: z.array(knownItemSchema),
  nextCursor: z.string().nullable(),
  /** Total matching the filters; only on the first page (no cursor). */
  total: z.number().int().nonnegative().nullable(),
});
export type KnownListResponse = z.infer<typeof knownListResponseSchema>;
