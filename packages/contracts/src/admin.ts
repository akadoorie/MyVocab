import { z } from 'zod';
import { dirSchema, itemIdSchema, itemTypeSchema, langCodeSchema } from './common';

/**
 * Admin API contracts (PRD §12.4). Item content limits (lengths, list sizes, duplicates, own
 * language) are enforced by the shared core item validation; these schemas whitelist fields and
 * cap raw sizes.
 */

export const ADMIN_PAGE_SIZE = 50;

const flag = z.enum(['true', 'false']).transform((v) => v === 'true');
const rawEntries = z.array(z.string().max(2000)).max(100);
const rawTranslation = z.record(langCodeSchema, rawEntries);
export const itemStatusSchema = z.enum(['draft', 'published']);

// ---------------------------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------------------------

/** POST /api/admin/items. */
export const adminItemCreateSchema = z
  .object({
    lang: langCodeSchema,
    text: z.string().max(2000),
    type: itemTypeSchema,
    multipleMeanings: z.boolean().optional(),
    status: itemStatusSchema.optional(),
    categoryIds: z.array(itemIdSchema).max(100).optional(),
    translation: rawTranslation.optional(),
    explanation: rawEntries.optional(),
    synonyms: rawEntries.optional(),
    hints: rawEntries.optional(),
  })
  .strict();
export type AdminItemCreate = z.infer<typeof adminItemCreateSchema>;

/**
 * PATCH /api/admin/items/:id. `lang` is not accepted (fixed after creation). A list field replaces
 * that whole list; `translation` replaces the whole object.
 */
export const adminItemPatchSchema = z
  .object({
    version: z.number().int().positive(),
    text: z.string().max(2000).optional(),
    type: itemTypeSchema.optional(),
    multipleMeanings: z.boolean().optional(),
    status: itemStatusSchema.optional(),
    categoryIds: z.array(itemIdSchema).max(100).optional(),
    translation: rawTranslation.optional(),
    explanation: rawEntries.optional(),
    synonyms: rawEntries.optional(),
    hints: rawEntries.optional(),
  })
  .strict();
export type AdminItemPatch = z.infer<typeof adminItemPatchSchema>;

export const itemIssueSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
});
export type ItemIssueView = z.infer<typeof itemIssueSchema>;

/** The full item (PRD §8.1) as the editor sees it. */
export const adminItemSchema = z.object({
  itemId: itemIdSchema,
  text: z.string(),
  type: itemTypeSchema,
  lang: langCodeSchema,
  multipleMeanings: z.boolean(),
  categoryIds: z.array(z.number().int()),
  categories: z.array(z.string()),
  translation: z.record(z.string(), z.array(z.string())),
  explanation: z.array(z.string()),
  synonyms: z.array(z.string()),
  hints: z.array(z.string()),
  status: itemStatusSchema,
  version: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  /** Non-blocking issues (FR-A11). */
  warnings: z.array(itemIssueSchema),
  /** Active target languages this item can be played in (translation or explanation). */
  playableTargets: z.array(langCodeSchema),
});
export type AdminItem = z.infer<typeof adminItemSchema>;

export const adminItemSortSchema = z.enum(['updated', 'text', 'created']);

/** GET /api/admin/items (FR-A10). */
export const adminItemListQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    lang: langCodeSchema.optional(),
    type: itemTypeSchema.optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    status: itemStatusSchema.optional(),
    multipleMeanings: flag.optional(),
    missingTranslation: langCodeSchema.optional(),
    missingExplanation: flag.optional(),
    noHints: flag.optional(),
    notPlayable: flag.optional(),
    sort: adminItemSortSchema.default('updated'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
  })
  .strict();
export type AdminItemListQuery = z.input<typeof adminItemListQuerySchema>;
export type AdminItemListFilter = z.output<typeof adminItemListQuerySchema>;

export const adminItemRowSchema = z.object({
  itemId: itemIdSchema,
  text: z.string(),
  lang: langCodeSchema,
  dir: dirSchema,
  type: itemTypeSchema,
  multipleMeanings: z.boolean(),
  categories: z.array(z.object({ id: z.number().int(), name: z.string() })),
  translationCounts: z.record(z.string(), z.number().int()),
  explanationCount: z.number().int(),
  synonymCount: z.number().int(),
  hintCount: z.number().int(),
  status: itemStatusSchema,
  updatedAt: z.number().int(),
});
export type AdminItemRow = z.infer<typeof adminItemRowSchema>;

export const adminItemListResponseSchema = z.object({
  items: z.array(adminItemRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AdminItemListResponse = z.infer<typeof adminItemListResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Trash (FR-A20–24)
// ---------------------------------------------------------------------------------------------

export const trashItemSchema = z.object({
  itemId: itemIdSchema,
  text: z.string(),
  lang: langCodeSchema,
  dir: dirSchema,
  type: itemTypeSchema,
  deletedAt: z.number().int(),
  deletedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  purgeAt: z.number().int(),
});
export type TrashItem = z.infer<typeof trashItemSchema>;
export const trashListResponseSchema = z.object({
  items: z.array(trashItemSchema),
  retentionHours: z.number().int(),
});
export const purgeRequestSchema = z.object({ confirm: z.literal('PURGE') }).strict();

// ---------------------------------------------------------------------------------------------
// Categories (FR-A30), languages (FR-A35)
// ---------------------------------------------------------------------------------------------

export const categorySlugSchema = z
  .string()
  .max(50)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and dashes');
const categoryName = z.string().trim().min(1).max(60);

export const adminCategorySchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  itemCount: z.number().int(),
});
export type AdminCategory = z.infer<typeof adminCategorySchema>;
export const adminCategoryListSchema = z.object({ categories: z.array(adminCategorySchema) });
export const categoryCreateSchema = z
  .object({ slug: categorySlugSchema, name: categoryName, isActive: z.boolean().optional() })
  .strict();
export const categoryPatchSchema = z
  .object({
    slug: categorySlugSchema.optional(),
    name: categoryName.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export const categoryOrderSchema = z
  .object({ ids: z.array(itemIdSchema).min(1).max(500) })
  .strict();

export const adminLanguageSchema = z.object({
  code: langCodeSchema,
  name: z.string(),
  nativeName: z.string(),
  dir: dirSchema,
  script: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type AdminLanguage = z.infer<typeof adminLanguageSchema>;
export const adminLanguageListSchema = z.object({ languages: z.array(adminLanguageSchema) });
export const languagePatchSchema = z.object({ isActive: z.boolean() }).strict();

// ---------------------------------------------------------------------------------------------
// Users (FR-A40–42)
// ---------------------------------------------------------------------------------------------

export const adminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  isOwner: z.boolean(),
  banned: z.boolean(),
  banReason: z.string().nullable(),
  createdAt: z.number().int(),
  /** Day precision: from the latest session refresh (never written per request). */
  lastSeenAt: z.number().int().nullable(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;
export const adminUserListQuerySchema = z
  .object({ q: z.string().trim().max(100).optional(), cursor: z.string().max(400).optional() })
  .strict();
export const adminUserListResponseSchema = z.object({
  users: z.array(adminUserSchema),
  nextCursor: z.string().nullable(),
});
export const adminUserPatchSchema = z
  .object({
    role: z.enum(['user', 'admin']).optional(),
    banned: z.boolean().optional(),
    banReason: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((v) => v.role !== undefined || v.banned !== undefined, 'Nothing to change');
export type AdminUserPatch = z.infer<typeof adminUserPatchSchema>;

// ---------------------------------------------------------------------------------------------
// Audit log (FR-A70) and dashboard (FR-A1)
// ---------------------------------------------------------------------------------------------

export const auditQuerySchema = z
  .object({
    actor: z.string().trim().max(200).optional(),
    action: z.string().trim().max(60).optional(),
    entityType: z.string().trim().max(40).optional(),
    from: z.coerce.number().int().nonnegative().optional(),
    to: z.coerce.number().int().nonnegative().optional(),
    cursor: z.coerce.number().int().positive().optional(),
  })
  .strict();
export type AuditQuery = z.input<typeof auditQuerySchema>;
export const auditEntrySchema = z.object({
  id: z.number().int(),
  createdAt: z.number().int(),
  actorUserId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  details: z.unknown(),
});
export type AuditEntryView = z.infer<typeof auditEntrySchema>;
export const auditListResponseSchema = z.object({
  entries: z.array(auditEntrySchema),
  nextCursor: z.number().int().nullable(),
});

export const adminStatsSchema = z.object({
  items: z.object({
    total: z.number().int(),
    byLangType: z.array(
      z.object({ lang: z.string(), type: itemTypeSchema, count: z.number().int() }),
    ),
    drafts: z.number().int(),
    missingTranslation: z.record(z.string(), z.number().int()),
    noExplanation: z.number().int(),
    noHints: z.number().int(),
    multipleMeanings: z.number().int(),
  }),
  users: z.object({ total: z.number().int(), admins: z.number().int() }),
  trash: z.number().int(),
  limitEvents24h: z.number().int(),
});
export type AdminStats = z.infer<typeof adminStatsSchema>;

// ---------------------------------------------------------------------------------------------
// CSV import (PRD §8.3, FR-A60–61)
// ---------------------------------------------------------------------------------------------

export const IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export const importQuerySchema = z
  .object({
    dryRun: flag.default(true),
    createMissingCategories: flag.default(false),
  })
  .strict();

const csvIssueSchema = z.object({ row: z.number().int(), column: z.string(), message: z.string() });
export type CsvIssueView = z.infer<typeof csvIssueSchema>;

export const importReportSchema = z.object({
  dryRun: z.boolean(),
  committed: z.boolean(),
  totals: z
    .object({
      newItems: z.number().int(),
      mergedItems: z.number().int(),
      newTranslationEntries: z.number().int(),
      newExplanationEntries: z.number().int(),
      newSynonyms: z.number().int(),
      newHints: z.number().int(),
      newCategories: z.number().int(),
      skippedDuplicates: z.number().int(),
    })
    .nullable(),
  errors: z.array(csvIssueSchema),
  warnings: z.array(csvIssueSchema),
  skippedConcurrent: z.number().int(),
  batches: z.number().int(),
});
export type ImportReportView = z.infer<typeof importReportSchema>;
