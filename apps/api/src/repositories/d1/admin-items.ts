import type { ItemType, Translations } from '@myvocab/core';
import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { AFTER_ONE_CHANGE, auditInsert, runBatch } from '../../db/batch';
import type { Db } from '../../db/client';
import { items } from '../../db/schema';
import type {
  Actor,
  AdminItemFilter,
  AdminItemListRow,
  AdminItemRepository,
  AuditDetails,
  ItemChanges,
  ItemRecord,
  NewItem,
  TrashRow,
} from '../interfaces';
import { categoriesForItems, itemSearchCondition } from './shared';

type ItemRow = {
  id: number;
  lang: string;
  text: string;
  normalized_text: string;
  type: ItemType;
  multiple_meanings: number;
  translation: string;
  literal: string;
  explanation: string;
  synonyms: string;
  hints: string;
  status: 'draft' | 'published';
  version: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  deleted_by: string | null;
  category_ids: string;
  category_slugs: string;
};

const ITEM_COLUMNS = sql`
  i.id, i.lang, i.text, i.normalized_text, i.type, i.multiple_meanings, i.translation, i.literal,
  i.explanation, i.synonyms, i.hints, i.status, i.version, i.created_at, i.updated_at,
  i.deleted_at, i.deleted_by,
  (SELECT json_group_array(ic.category_id) FROM item_categories ic WHERE ic.item_id = i.id)
    AS category_ids,
  (SELECT json_group_array(c.slug) FROM item_categories ic JOIN categories c ON c.id = ic.category_id
    WHERE ic.item_id = i.id) AS category_slugs`;

function toRecord(r: ItemRow): ItemRecord {
  return {
    id: r.id,
    lang: r.lang,
    text: r.text,
    normalizedText: r.normalized_text,
    type: r.type,
    multipleMeanings: r.multiple_meanings === 1,
    translation: JSON.parse(r.translation) as Translations,
    literal: JSON.parse(r.literal) as Translations,
    explanation: JSON.parse(r.explanation) as string[],
    synonyms: JSON.parse(r.synonyms) as string[],
    hints: JSON.parse(r.hints) as string[],
    status: r.status,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    deletedBy: r.deleted_by,
    categoryIds: (JSON.parse(r.category_ids) as number[]).sort((a, b) => a - b),
    categorySlugs: (JSON.parse(r.category_slugs) as string[]).sort(),
  };
}

/** Links an item to the given (existing) categories; ids travel as one JSON parameter. */
function linkCategories(itemId: SQL | number, categoryIds: readonly number[], when?: SQL): SQL {
  return sql`
    INSERT OR IGNORE INTO item_categories (item_id, category_id)
    SELECT ${itemId}, c.id FROM categories AS c
    WHERE c.id IN (SELECT value FROM json_each(${JSON.stringify(categoryIds)}))
    ${when ? sql`AND ${when}` : sql``}`;
}

function listConditions(f: AdminItemFilter, activeLangs: readonly string[]): SQL[] {
  const conds: SQL[] = [sql`i.deleted_at IS NULL`];
  if (f.q) {
    const search = itemSearchCondition(f.q);
    if (search) conds.push(search);
  }
  if (f.lang) conds.push(sql`i.lang = ${f.lang}`);
  if (f.type) conds.push(sql`i.type = ${f.type}`);
  if (f.status) conds.push(sql`i.status = ${f.status}`);
  if (f.multipleMeanings !== undefined) {
    conds.push(sql`i.multiple_meanings = ${f.multipleMeanings ? 1 : 0}`);
  }
  if (f.categoryId !== undefined) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM item_categories ic WHERE ic.item_id = i.id AND ic.category_id = ${f.categoryId})`,
    );
  }
  if (f.missingTranslation) {
    conds.push(sql`i.lang <> ${f.missingTranslation}
      AND COALESCE(json_array_length(i.translation, '$."' || ${f.missingTranslation} || '"'), 0) = 0`);
  }
  if (f.missingExplanation) conds.push(sql`json_array_length(i.explanation) = 0`);
  if (f.noHints) conds.push(sql`json_array_length(i.hints) = 0`);
  if (f.notPlayable) {
    // No explanation and no translation into any other active language (FR-L40).
    conds.push(sql`json_array_length(i.explanation) = 0 AND NOT EXISTS (
      SELECT 1 FROM json_each(i.translation) AS t
      WHERE t.key IN (SELECT value FROM json_each(${JSON.stringify(activeLangs)}))
        AND json_array_length(t.value) > 0)`);
  }
  return conds;
}

const LIST_ORDER: Record<AdminItemFilter['sort'], SQL> = {
  updated: sql`i.updated_at DESC, i.id DESC`,
  text: sql`i.normalized_text ASC, i.id ASC`,
  created: sql`i.created_at DESC, i.id DESC`,
};

export class D1AdminItemRepository implements AdminItemRepository {
  constructor(
    private readonly db: Db,
    private readonly d1: D1Database,
  ) {}

  async get(id: number): Promise<ItemRecord | null> {
    const row = await this.db.get<ItemRow>(
      sql`SELECT ${ITEM_COLUMNS} FROM items AS i WHERE i.id = ${id}`,
    );
    return row ? toRecord(row) : null;
  }

  async findDuplicate(
    lang: string,
    normalizedText: string,
    type: ItemType,
    excludeId?: number,
  ): Promise<number | null> {
    const row = await this.db.get<{ id: number }>(sql`
      SELECT id FROM items
      WHERE lang = ${lang} AND normalized_text = ${normalizedText} AND type = ${type}
        AND deleted_at IS NULL ${excludeId === undefined ? sql`` : sql`AND id <> ${excludeId}`}
    `);
    return row?.id ?? null;
  }

  async list(
    filter: AdminItemFilter,
    activeLangs: readonly string[],
    limit: number,
    offset: number,
  ): Promise<{ rows: AdminItemListRow[]; total: number }> {
    const where = sql.join(listConditions(filter, activeLangs), sql` AND `);
    const [rows, count] = await Promise.all([
      this.db.all<{
        id: number;
        text: string;
        lang: string;
        type: ItemType;
        multiple_meanings: number;
        translation: string;
        explanation_count: number;
        synonym_count: number;
        hint_count: number;
        status: 'draft' | 'published';
        updated_at: number;
      }>(sql`
        SELECT i.id, i.text, i.lang, i.type, i.multiple_meanings, i.translation,
               json_array_length(i.explanation) AS explanation_count,
               json_array_length(i.synonyms) AS synonym_count,
               json_array_length(i.hints) AS hint_count, i.status, i.updated_at
        FROM items AS i WHERE ${where}
        ORDER BY ${LIST_ORDER[filter.sort]}
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM items AS i WHERE ${where}`),
    ]);
    return {
      rows: rows.map((r) => ({
        id: r.id,
        text: r.text,
        lang: r.lang,
        type: r.type,
        multipleMeanings: r.multiple_meanings === 1,
        translation: JSON.parse(r.translation) as Record<string, string[]>,
        explanationCount: r.explanation_count,
        synonymCount: r.synonym_count,
        hintCount: r.hint_count,
        status: r.status,
        updatedAt: r.updated_at,
      })),
      total: count?.n ?? 0,
    };
  }

  categoriesFor(itemIds: readonly number[]) {
    return categoriesForItems(this.db, itemIds);
  }

  async create(item: NewItem, actor: Actor, audit: AuditDetails, now: number): Promise<number> {
    // The new id is found by its identity (unique among non-deleted items) inside the batch.
    const newId = sql`SELECT id FROM items WHERE lang = ${item.lang} AND type = ${item.type}
      AND normalized_text = ${item.normalizedText} AND deleted_at IS NULL`;
    const statements: (SQL | { toSQL(): { sql: string; params: unknown[] } })[] = [
      this.db.insert(items).values({
        lang: item.lang,
        text: item.text,
        normalizedText: item.normalizedText,
        type: item.type,
        multipleMeanings: item.multipleMeanings,
        translation: item.translation,
        literal: item.literal,
        explanation: item.explanation,
        synonyms: item.synonyms,
        hints: item.hints,
        status: item.status,
        createdBy: actor?.userId ?? null,
        createdAt: now,
        updatedAt: now,
      }),
    ];
    if (item.categoryIds.length > 0) {
      statements.push(linkCategories(sql`(${newId})`, item.categoryIds));
    }
    statements.push(
      auditInsert(
        {
          actor,
          action: audit.action,
          entityType: 'item',
          entityId: sql`CAST((${newId}) AS TEXT)`,
          details: audit.details,
        },
        now,
      ),
    );
    await runBatch(this.d1, statements);
    const created = await this.findDuplicate(item.lang, item.normalizedText, item.type);
    if (created === null) throw new Error('created item not found');
    return created;
  }

  async update(
    id: number,
    version: number,
    changes: ItemChanges,
    categoryIds: number[] | undefined,
    actor: Actor,
    audit: AuditDetails,
    now: number,
  ): Promise<boolean> {
    // Inside one transaction the item's version can't change between statements, so the
    // category statements check the expected version before the UPDATE bumps it.
    const current = sql`EXISTS (SELECT 1 FROM items WHERE id = ${id} AND version = ${version} AND deleted_at IS NULL)`;
    const statements: (SQL | { toSQL(): { sql: string; params: unknown[] } })[] = [];
    if (categoryIds !== undefined) {
      statements.push(sql`DELETE FROM item_categories WHERE item_id = ${id} AND ${current}`);
      if (categoryIds.length > 0) statements.push(linkCategories(id, categoryIds, current));
    }
    statements.push(
      this.db
        .update(items)
        .set({ ...changes, version: sql`${items.version} + 1`, updatedAt: now })
        .where(and(eq(items.id, id), eq(items.version, version), isNull(items.deletedAt))),
      auditInsert(
        {
          actor,
          action: audit.action,
          entityType: 'item',
          entityId: String(id),
          details: audit.details,
        },
        now,
        AFTER_ONE_CHANGE,
      ),
    );
    const results = await runBatch(this.d1, statements);
    return (results[results.length - 2]?.meta.changes ?? 0) > 0;
  }

  private async stateChange(
    update: { toSQL(): { sql: string; params: unknown[] } },
    id: number,
    actor: Actor,
    audit: AuditDetails,
    now: number,
  ): Promise<boolean> {
    const [result] = await runBatch(this.d1, [
      update,
      auditInsert(
        {
          actor,
          action: audit.action,
          entityType: 'item',
          entityId: String(id),
          details: audit.details,
        },
        now,
        AFTER_ONE_CHANGE,
      ),
    ]);
    // D1 counts rows removed by ON DELETE CASCADE too: any change means it applied.
    return (result?.meta.changes ?? 0) > 0;
  }

  trash(id: number, version: number, actor: Actor, audit: AuditDetails, now: number) {
    return this.stateChange(
      this.db
        .update(items)
        .set({
          deletedAt: now,
          deletedBy: actor?.userId ?? null,
          version: sql`${items.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(items.id, id), eq(items.version, version), isNull(items.deletedAt))),
      id,
      actor,
      audit,
      now,
    );
  }

  restore(id: number, version: number, actor: Actor, audit: AuditDetails, now: number) {
    return this.stateChange(
      this.db
        .update(items)
        .set({
          deletedAt: null,
          deletedBy: null,
          version: sql`${items.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(items.id, id), eq(items.version, version), isNotNull(items.deletedAt))),
      id,
      actor,
      audit,
      now,
    );
  }

  purge(id: number, version: number, actor: Actor, audit: AuditDetails, now: number) {
    // Cascades to category links and users' known marks (FR-A23).
    return this.stateChange(
      this.db
        .delete(items)
        .where(and(eq(items.id, id), eq(items.version, version), isNotNull(items.deletedAt))),
      id,
      actor,
      audit,
      now,
    );
  }

  async purgeMany(
    entries: readonly { id: number; version: number; audit: AuditDetails }[],
    actor: Actor,
    now: number,
  ): Promise<number> {
    if (entries.length === 0) return 0;
    const statements = entries.flatMap((e) => [
      this.db
        .delete(items)
        .where(and(eq(items.id, e.id), eq(items.version, e.version), isNotNull(items.deletedAt))),
      auditInsert(
        {
          actor,
          action: e.audit.action,
          entityType: 'item',
          entityId: String(e.id),
          details: e.audit.details,
        },
        now,
        AFTER_ONE_CHANGE,
      ),
    ]);
    const results = await runBatch(this.d1, statements);
    return results.filter((r, i) => i % 2 === 0 && r.meta.changes > 0).length;
  }

  async listTrash(limit: number): Promise<TrashRow[]> {
    const rows = await this.db.all<{
      id: number;
      text: string;
      lang: string;
      type: ItemType;
      deleted_at: number;
      deleted_by: string | null;
      deleted_by_name: string | null;
    }>(sql`
      SELECT i.id, i.text, i.lang, i.type, i.deleted_at, i.deleted_by, u.name AS deleted_by_name
      FROM items AS i LEFT JOIN "user" AS u ON u.id = i.deleted_by
      WHERE i.deleted_at IS NOT NULL
      ORDER BY i.deleted_at DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      lang: r.lang,
      type: r.type,
      deletedAt: r.deleted_at,
      deletedBy: r.deleted_by ? { id: r.deleted_by, name: r.deleted_by_name ?? '' } : null,
    }));
  }

  async expiredTrash(cutoff: number, limit: number): Promise<ItemRecord[]> {
    const rows = await this.db.all<ItemRow>(sql`
      SELECT ${ITEM_COLUMNS} FROM items AS i
      WHERE i.deleted_at IS NOT NULL AND i.deleted_at <= ${cutoff}
      ORDER BY i.deleted_at ASC
      LIMIT ${limit}
    `);
    return rows.map(toRecord);
  }
}
