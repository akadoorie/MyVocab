import type { ExistingItem, ImportPlan, ItemContent, ItemType, LanguageInfo } from '@myvocab/core';

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
