import { cleanText, normalize, type ItemType } from '@myvocab/core';
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client';
import type {
  KnownCursor,
  KnownFilterInput,
  KnownListRow,
  KnownMarkRow,
  KnownRepository,
  KnownSortKey,
} from '../interfaces';

type ListRow = {
  item_id: number;
  text: string;
  normalized_text: string;
  lang: string;
  type: ItemType;
  multiple_meanings: number;
  translation: string;
  explanation: string;
  known_target: string;
  known_in_cycle: number;
  known_at: number;
};

/** Escapes LIKE wildcards; used with `ESCAPE '\'`. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * Conditions on `user_known_items k JOIN items i` for one user's visible known items. Items in
 * Trash are hidden here (and come back when restored, FR-L63).
 */
function filterConditions(userId: string, f: KnownFilterInput): SQL[] {
  const conds: SQL[] = [sql`k.user_id = ${userId}`, sql`i.deleted_at IS NULL`];
  if (f.lang) conds.push(sql`i.lang = ${f.lang}`);
  if (f.type) conds.push(sql`i.type = ${f.type}`);
  if (f.categoryId !== undefined) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM item_categories ic WHERE ic.item_id = i.id AND ic.category_id = ${f.categoryId})`,
    );
  }
  if (f.q) {
    // Item text (normalized like the stored copy) or any translation entry (FR-L61).
    const text = normalize(f.q);
    const raw = cleanText(f.q).toLowerCase();
    const either: SQL[] = [];
    if (text) either.push(sql`i.normalized_text LIKE ${likePattern(text)} ESCAPE '\\'`);
    if (raw) {
      either.push(sql`EXISTS (
        SELECT 1 FROM json_each(i.translation) AS t, json_each(t.value) AS v
        WHERE v.value LIKE ${likePattern(raw)} ESCAPE '\\')`);
    }
    if (either.length > 0) conds.push(sql`(${sql.join(either, sql` OR `)})`);
  }
  return conds;
}

const ORDER: Record<KnownSortKey, SQL> = {
  newest: sql`k.known_at DESC, k.item_id DESC`,
  oldest: sql`k.known_at ASC, k.item_id ASC`,
  az: sql`i.normalized_text ASC, k.item_id ASC`,
};

function cursorCondition(sort: KnownSortKey, c: KnownCursor): SQL {
  switch (sort) {
    case 'newest':
      return sql`(k.known_at < ${c.key} OR (k.known_at = ${c.key} AND k.item_id < ${c.itemId}))`;
    case 'oldest':
      return sql`(k.known_at > ${c.key} OR (k.known_at = ${c.key} AND k.item_id > ${c.itemId}))`;
    case 'az':
      return sql`(i.normalized_text > ${c.key} OR (i.normalized_text = ${c.key} AND k.item_id > ${c.itemId}))`;
  }
}

/** A user's visible known item ids matching a filter (subquery for deletes). */
function visibleIds(userId: string, f: KnownFilterInput): SQL {
  return sql`SELECT k.item_id FROM user_known_items AS k JOIN items AS i ON i.id = k.item_id
    WHERE ${sql.join(filterConditions(userId, f), sql` AND `)}`;
}

export class D1KnownRepository implements KnownRepository {
  constructor(private readonly db: Db) {}

  async insertMany(userId: string, marks: readonly KnownMarkRow[], now: number): Promise<number> {
    // One statement for the whole batch: marks travel as one JSON parameter. Existing rows win
    // (idempotent, keeps the earliest known_at); unknown or trashed items are skipped.
    const res = await this.db.run(sql`
      INSERT INTO user_known_items (user_id, item_id, known_target, known_in_cycle, known_at)
      SELECT ${userId}, i.id, json_extract(m.value, '$.target'), json_extract(m.value, '$.cycle'), ${now}
      FROM json_each(${JSON.stringify(marks)}) AS m
      JOIN items AS i ON i.id = json_extract(m.value, '$.itemId')
      WHERE i.deleted_at IS NULL
      ON CONFLICT (user_id, item_id) DO NOTHING
    `);
    return res.meta.changes;
  }

  async remove(userId: string, itemId: number): Promise<number> {
    const res = await this.db.run(
      sql`DELETE FROM user_known_items WHERE user_id = ${userId} AND item_id = ${itemId}`,
    );
    return res.meta.changes;
  }

  async removeMany(userId: string, itemIds: readonly number[]): Promise<number> {
    const res = await this.db.run(sql`
      DELETE FROM user_known_items
      WHERE user_id = ${userId} AND item_id IN (
        SELECT i.id FROM json_each(${JSON.stringify(itemIds)}) AS j
        JOIN items AS i ON i.id = j.value
        WHERE i.deleted_at IS NULL)
    `);
    return res.meta.changes;
  }

  async removeByFilter(userId: string, filter: KnownFilterInput): Promise<number> {
    const res = await this.db.run(sql`
      DELETE FROM user_known_items
      WHERE user_id = ${userId} AND item_id IN (${visibleIds(userId, filter)})
    `);
    return res.meta.changes;
  }

  async list(
    userId: string,
    filter: KnownFilterInput,
    sort: KnownSortKey,
    cursor: KnownCursor | null,
    limit: number,
  ): Promise<KnownListRow[]> {
    const conds = filterConditions(userId, filter);
    if (cursor) conds.push(cursorCondition(sort, cursor));
    const rows = await this.db.all<ListRow>(sql`
      SELECT k.item_id, k.known_target, k.known_in_cycle, k.known_at,
             i.text, i.normalized_text, i.lang, i.type, i.multiple_meanings,
             i.translation, i.explanation
      FROM user_known_items AS k JOIN items AS i ON i.id = k.item_id
      WHERE ${sql.join(conds, sql` AND `)}
      ORDER BY ${ORDER[sort]}
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      itemId: r.item_id,
      text: r.text,
      normalizedText: r.normalized_text,
      lang: r.lang,
      type: r.type,
      multipleMeanings: r.multiple_meanings === 1,
      translation: JSON.parse(r.translation) as Record<string, string[]>,
      explanation: JSON.parse(r.explanation) as string[],
      knownTarget: r.known_target,
      knownInCycle: r.known_in_cycle,
      knownAt: r.known_at,
    }));
  }

  async count(userId: string, filter: KnownFilterInput): Promise<number> {
    const row = await this.db.get<{ n: number }>(sql`
      SELECT COUNT(*) AS n FROM user_known_items AS k JOIN items AS i ON i.id = k.item_id
      WHERE ${sql.join(filterConditions(userId, filter), sql` AND `)}
    `);
    return row?.n ?? 0;
  }

  async categoriesFor(
    itemIds: readonly number[],
  ): Promise<Map<number, { id: number; name: string }[]>> {
    const result = new Map<number, { id: number; name: string }[]>();
    if (itemIds.length === 0) return result;
    const rows = await this.db.all<{ item_id: number; id: number; name: string }>(sql`
      SELECT ic.item_id, c.id, c.name
      FROM json_each(${JSON.stringify(itemIds)}) AS j
      JOIN item_categories AS ic ON ic.item_id = j.value
      JOIN categories AS c ON c.id = ic.category_id
      ORDER BY c.sort_order, c.name
    `);
    for (const r of rows) {
      const list = result.get(r.item_id) ?? [];
      list.push({ id: r.id, name: r.name });
      result.set(r.item_id, list);
    }
    return result;
  }
}
