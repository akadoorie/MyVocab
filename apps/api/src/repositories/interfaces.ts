import type {
  ExistingItem,
  ImportPlan,
  ItemContent,
  ItemData,
  ItemType,
  LanguageInfo,
  TextDir,
} from '@myvocab/core';

/**
 * Repository interfaces (PRD §10.4, dependency inversion): services depend on these, the D1
 * implementations live in ./d1. Tests can inject fakes.
 */

export type Actor = { userId: string; email: string } | null;

export type LanguageRow = LanguageInfo & {
  name: string;
  nativeName: string;
  isActive: boolean;
  sortOrder: number;
};

export interface LanguageRepository {
  /** All languages, by sort order. */
  listAll(): Promise<LanguageRow[]>;
}

export type CategoryRow = {
  id: number;
  slug: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

export interface CategoryRepository {
  listAll(): Promise<CategoryRow[]>;
}

export type IdentityKey = { lang: string; type: ItemType; normalizedText: string };

export type ExistingItemWithVersion = ExistingItem & { version: number };

export interface ItemRepository {
  /** Non-deleted items matching the given identities, keyed by `itemIdentityKey`. */
  findByIdentities(keys: readonly IdentityKey[]): Promise<Map<string, ExistingItemWithVersion>>;
}

export type ImportWriteResult = {
  /** Items whose update was skipped because they changed while the import ran. */
  skippedConcurrent: number;
  /** Number of D1 batches used (1 unless the import had to be chunked). */
  batches: number;
};

export type ImportAuditInfo = {
  fileName: string;
  sha256: string;
  totals: ImportPlan['totals'];
};

export interface ImportWriter {
  /**
   * Writes an import plan: new categories, new items, appended entries and category links, plus
   * one `csv.import` audit entry. `versions` holds the version each updated item was read at.
   */
  write(
    plan: ImportPlan,
    versions: ReadonlyMap<number, number>,
    actor: Actor,
    audit: ImportAuditInfo,
  ): Promise<ImportWriteResult>;
}

export type { ItemContent };

export interface SettingsRepository {
  /** Raw stored values (JSON-decoded), keyed by setting key. Missing keys use defaults. */
  getAll(): Promise<Record<string, unknown>>;
}

export interface UsageRepository {
  get(subject: string, period: string): Promise<number>;
  increment(subject: string, period: string, by: number, now: number): Promise<void>;
  /** Inserts a marker row once per subject/period; true only the first time. */
  markOnce(subject: string, period: string, now: number): Promise<boolean>;
}

export type AuditEntry = {
  actor: Actor;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: unknown;
};

export interface AuditRepository {
  insert(entry: AuditEntry, now: number): Promise<void>;
}

export type LoopSelection = {
  source: string;
  target: string;
  type: ItemType;
  categoryId: number | null;
  /** Only items in the sample set (guests; admins checking it, D-038). */
  sampleOnly: boolean;
  /** Signed-in learner: their items known in this direction (`target`) are excluded (D-028). */
  userId: string | null;
};

export interface LoopRepository {
  countPlayable(selection: LoopSelection): Promise<number>;
  /** Random playable items (PRD §11.3), at most `limit`. */
  selectPlayable(selection: LoopSelection, limit: number): Promise<ItemData[]>;
}

export type KnownMarkRow = { itemId: number; target: string; cycle: number };

export type KnownFilterInput = {
  q?: string | undefined;
  lang?: string | undefined;
  target?: string | undefined;
  type?: ItemType | undefined;
  categoryId?: number | undefined;
};

export type KnownSortKey = 'newest' | 'oldest' | 'az';

/**
 * Position after the last row of a page: the sort value, then item id and target language, which
 * together identify a row (keyset pagination, D-028).
 */
export type KnownCursor = { key: number | string; itemId: number; target: string };

export type KnownListRow = {
  itemId: number;
  text: string;
  normalizedText: string;
  lang: string;
  type: ItemType;
  multipleMeanings: boolean;
  parallel: Record<string, string[]>;
  meaning: Record<string, string[]>;
  explanation: string[];
  knownTarget: string;
  knownInCycle: number;
  knownAt: number;
};

export interface KnownRepository {
  /**
   * Idempotent per item + target (D-028): existing rows are kept (earliest `known_at`); missing or
   * trashed items skipped.
   */
  insertMany(userId: string, marks: readonly KnownMarkRow[], now: number): Promise<number>;
  /** One direction of an item, or every direction when `target` is undefined. */
  remove(userId: string, itemId: number, target?: string): Promise<number>;
  /** Removes the given items in every direction (only ones not in Trash). */
  removeMany(userId: string, itemIds: readonly number[]): Promise<number>;
  /** Removes the given rows: an item in one direction each (only items not in Trash). */
  removeKeys(userId: string, keys: readonly { itemId: number; target: string }[]): Promise<number>;
  /** Removes every known item matching the filter (not in Trash). */
  removeByFilter(userId: string, filter: KnownFilterInput): Promise<number>;
  list(
    userId: string,
    filter: KnownFilterInput,
    sort: KnownSortKey,
    cursor: KnownCursor | null,
    limit: number,
  ): Promise<KnownListRow[]>;
  count(userId: string, filter: KnownFilterInput): Promise<number>;
  categoriesFor(itemIds: readonly number[]): Promise<Map<number, { id: number; name: string }[]>>;
}

export type AccountRow = { id: string; role: string };

export interface AccountRepository {
  find(userId: string): Promise<AccountRow | null>;
  /** Admins that are not banned. */
  countActiveAdmins(): Promise<number>;
  /** Accounts that are not admins and not banned (the home page count, D-036). */
  countRegisteredUsers(): Promise<number>;
  /**
   * Deletes the user and everything that belongs to them in one batch: sessions, accounts and
   * known items (FK cascade), usage counters, plus an audit entry.
   */
  deleteUser(userId: string, now: number): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Admin (PRD §7, §12.4). Every mutation writes its audit entry in the same D1 batch.
// ---------------------------------------------------------------------------------------------

export type ItemRecord = ItemContent & {
  id: number;
  normalizedText: string;
  status: 'draft' | 'published';
  inSampleSet: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deletedBy: string | null;
  categoryIds: number[];
  categorySlugs: string[];
};

export type NewItem = ItemContent & {
  normalizedText: string;
  status: 'draft' | 'published';
  inSampleSet: boolean;
  categoryIds: number[];
};

/** The columns an update may change (never `lang`). */
export type ItemChanges = Partial<
  Pick<
    ItemContent,
    | 'text'
    | 'type'
    | 'multipleMeanings'
    | 'parallel'
    | 'meaning'
    | 'literal'
    | 'explanation'
    | 'synonyms'
    | 'hints'
  > & { normalizedText: string; status: 'draft' | 'published'; inSampleSet: boolean }
>;

export type AdminItemFilter = {
  q?: string | undefined;
  lang?: string | undefined;
  type?: ItemType | undefined;
  categoryId?: number | undefined;
  status?: 'draft' | 'published' | undefined;
  multipleMeanings?: boolean | undefined;
  inSampleSet?: boolean | undefined;
  missingTranslation?: string | undefined;
  missingExplanation?: boolean | undefined;
  noHints?: boolean | undefined;
  notPlayable?: boolean | undefined;
  sort: 'updated' | 'text' | 'created';
};

export type AdminItemListRow = {
  id: number;
  text: string;
  lang: string;
  type: ItemType;
  multipleMeanings: boolean;
  parallel: Record<string, string[]>;
  meaning: Record<string, string[]>;
  explanationCount: number;
  synonymCount: number;
  hintCount: number;
  status: 'draft' | 'published';
  inSampleSet: boolean;
  updatedAt: number;
};

export type TrashRow = {
  id: number;
  text: string;
  lang: string;
  type: ItemType;
  deletedAt: number;
  deletedBy: { id: string; name: string } | null;
};

export type AuditDetails = { action: string; details: unknown };

export interface AdminItemRepository {
  /** Any item, including one in Trash. */
  get(id: number): Promise<ItemRecord | null>;
  /** A non-deleted item with this identity (other than `excludeId`). */
  findDuplicate(
    lang: string,
    normalizedText: string,
    type: ItemType,
    excludeId?: number,
  ): Promise<number | null>;
  list(
    filter: AdminItemFilter,
    activeLangs: readonly string[],
    limit: number,
    offset: number,
  ): Promise<{ rows: AdminItemListRow[]; total: number }>;
  categoriesFor(itemIds: readonly number[]): Promise<Map<number, { id: number; name: string }[]>>;
  /** Inserts the item, its category links and the audit entry; returns the new id. */
  create(item: NewItem, actor: Actor, audit: AuditDetails, now: number): Promise<number>;
  /** Optimistic update: false if `version` is stale (nothing written, no audit). */
  update(
    id: number,
    version: number,
    changes: ItemChanges,
    categoryIds: number[] | undefined,
    actor: Actor,
    audit: AuditDetails,
    now: number,
  ): Promise<boolean>;
  trash(
    id: number,
    version: number,
    actor: Actor,
    audit: AuditDetails,
    now: number,
  ): Promise<boolean>;
  restore(
    id: number,
    version: number,
    actor: Actor,
    audit: AuditDetails,
    now: number,
  ): Promise<boolean>;
  purge(
    id: number,
    version: number,
    actor: Actor,
    audit: AuditDetails,
    now: number,
  ): Promise<boolean>;
  listTrash(limit: number): Promise<TrashRow[]>;
  /** Trashed items deleted at or before `cutoff`, oldest first. */
  expiredTrash(cutoff: number, limit: number): Promise<ItemRecord[]>;
  /** Purges several trashed items in one batch, each with its audit entry; returns the count. */
  purgeMany(
    entries: readonly { id: number; version: number; audit: AuditDetails }[],
    actor: Actor,
    now: number,
  ): Promise<number>;
}

export type CategoryWithCount = CategoryRow & { itemCount: number };

export interface AdminCategoryRepository {
  listWithCounts(): Promise<CategoryWithCount[]>;
  get(id: number): Promise<CategoryWithCount | null>;
  findBySlug(slug: string): Promise<CategoryRow | null>;
  create(
    input: { slug: string; name: string; isActive: boolean },
    actor: Actor,
    now: number,
  ): Promise<number>;
  update(
    id: number,
    changes: Partial<{ slug: string; name: string; isActive: boolean }>,
    actor: Actor,
    audit: AuditDetails,
    now: number,
  ): Promise<boolean>;
  /** Deletes only when no item links to it; false otherwise. */
  delete(id: number, actor: Actor, audit: AuditDetails, now: number): Promise<boolean>;
  reorder(ids: readonly number[], actor: Actor, now: number): Promise<void>;
}

export type LanguageChanges = Partial<{ name: string; nativeName: string; isActive: boolean }>;

export interface AdminLanguageRepository {
  /** Inserts an inactive language at the end of the order (D-027); false if the code exists. */
  create(
    input: { code: string; name: string; nativeName: string; dir: TextDir; script: string },
    actor: Actor,
    now: number,
  ): Promise<boolean>;
  update(code: string, changes: LanguageChanges, actor: Actor, now: number): Promise<boolean>;
}

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: number;
  lastSeenAt: number | null;
};

export interface AdminUserRepository {
  get(id: string): Promise<AdminUserRow | null>;
  list(
    q: string | undefined,
    cursor: { createdAt: number; id: string } | null,
    limit: number,
  ): Promise<AdminUserRow[]>;
  countActiveAdmins(): Promise<number>;
  /** Applies role/ban changes (banning revokes every session) with their audit entries. */
  apply(
    id: string,
    changes: { role?: string; banned?: boolean; banReason?: string | null },
    audits: readonly AuditDetails[],
    actor: Actor,
    now: number,
  ): Promise<void>;
}

export interface AdminSettingsRepository {
  write(
    values: Readonly<Record<string, unknown>>,
    actor: Actor,
    audit: AuditDetails,
    now: number,
  ): Promise<void>;
}

export type AuditRow = {
  id: number;
  createdAt: number;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
};

export type AuditFilter = {
  actor?: string | undefined;
  action?: string | undefined;
  entityType?: string | undefined;
  from?: number | undefined;
  to?: number | undefined;
  beforeId?: number | undefined;
};

export interface AuditQueryRepository {
  list(filter: AuditFilter, limit: number): Promise<AuditRow[]>;
}

export interface StatsRepository {
  stats(
    activeLangs: readonly string[],
    since: number,
  ): Promise<{
    total: number;
    drafts: number;
    noExplanation: number;
    noHints: number;
    multipleMeanings: number;
    sampleSet: number;
    sampleByDirection: { source: string; target: string; type: ItemType; count: number }[];
    byLangType: { lang: string; type: ItemType; count: number }[];
    missingTranslation: Record<string, number>;
    users: number;
    admins: number;
    trash: number;
    limitEvents: number;
  }>;
}
