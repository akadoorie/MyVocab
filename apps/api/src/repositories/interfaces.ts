import type {
  ExistingItem,
  ImportPlan,
  ItemContent,
  ItemData,
  ItemType,
  LanguageInfo,
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
  /** Signed-in learner: their known items are excluded (every direction). */
  userId: string | null;
};

export interface LoopRepository {
  countPlayable(selection: LoopSelection): Promise<number>;
  /** Random playable items (PRD §11.3), at most `limit`. */
  selectPlayable(selection: LoopSelection, limit: number): Promise<ItemData[]>;
}
