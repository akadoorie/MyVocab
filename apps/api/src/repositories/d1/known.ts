import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client';
import type {
  TopicRef,
  KnownCursor,
  KnownFilterInput,
  KnownListRow,
  KnownMarkRow,
  KnownRepository,
  KnownSortKey,
} from '../interfaces';
import { topicsForItems, itemSearchCondition } from './shared';

type ListRow = {
  item_id: number;
  text: string;
  normalized_text: string;
  lang: string;
  multiple_meanings: number;
  parallel: string;
  meaning: string;
  explanation: string;
  known_target: string;
  known_in_cycle: number;
  known_at: number;
};

/**
 * Conditions on `user_known_items k JOIN items i` for one user's visible known items. Items in
 * Trash are hidden here (and come back when restored, FR-L63).
 */
function filterConditions(userId: string, f: KnownFilterInput): SQL[] {
  const conds: SQL[] = [sql`k.user_id = ${userId}`, sql`i.deleted_at IS NULL`];
  if (f.lang) conds.push(sql`i.lang = ${f.lang}`);
  if (f.target) conds.push(sql`k.known_target = ${f.target}`);
  if (f.topicId !== undefined) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM item_topics ic WHERE ic.item_id = i.id AND ic.topic_id = ${f.topicId})`,
    );
  }
  if (f.q) {
    // Item text or any translation entry (FR-L61).
    const search = itemSearchCondition(f.q);
    if (search) conds.push(search);
  }
  return conds;
}

// A row is an item in one direction (D-028): item id and target break ties in every order.
const ORDER: Record<KnownSortKey, SQL> = {
  newest: sql`k.known_at DESC, k.item_id DESC, k.known_target DESC`,
  oldest: sql`k.known_at ASC, k.item_id ASC, k.known_target ASC`,
  az: sql`i.normalized_text ASC, k.item_id ASC, k.known_target ASC`,
};

/** Rows after the cursor, in the same order as ORDER (SQLite row-value comparison). */
function cursorCondition(sort: KnownSortKey, c: KnownCursor): SQL {
  switch (sort) {
    case 'newest':
      return sql`(k.known_at, k.item_id, k.known_target) < (${c.key}, ${c.itemId}, ${c.target})`;
    case 'oldest':
      return sql`(k.known_at, k.item_id, k.known_target) > (${c.key}, ${c.itemId}, ${c.target})`;
    case 'az':
      return sql`(i.normalized_text, k.item_id, k.known_target) > (${c.key}, ${c.itemId}, ${c.target})`;
  }
}

/** A user's visible known rows (item + target) matching a filter (subquery for deletes). */
function visibleKeys(userId: string, f: KnownFilterInput): SQL {
  return sql`SELECT k.item_id, k.known_target FROM user_known_items AS k JOIN items AS i ON i.id = k.item_id
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
      ON CONFLICT (user_id, item_id, known_target) DO NOTHING
    `);
    return res.meta.changes;
  }

  async remove(userId: string, itemId: number, target?: string): Promise<number> {
    const direction = target === undefined ? sql`` : sql`AND known_target = ${target}`;
    const res = await this.db.run(
      sql`DELETE FROM user_known_items WHERE user_id = ${userId} AND item_id = ${itemId} ${direction}`,
    );
    return res.meta.changes;
  }

  async removeKeys(
    userId: string,
    keys: readonly { itemId: number; target: string }[],
  ): Promise<number> {
    const res = await this.db.run(sql`
      DELETE FROM user_known_items
      WHERE user_id = ${userId} AND (item_id, known_target) IN (
        SELECT i.id, json_extract(j.value, '$.target')
        FROM json_each(${JSON.stringify(keys)}) AS j
        JOIN items AS i ON i.id = json_extract(j.value, '$.itemId')
        WHERE i.deleted_at IS NULL)
    `);
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
      WHERE user_id = ${userId} AND (item_id, known_target) IN (${visibleKeys(userId, filter)})
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
             i.text, i.normalized_text, i.lang, i.multiple_meanings,
             i.translation_parallel AS parallel, i.translation_meaning AS meaning, i.explanation
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
      multipleMeanings: r.multiple_meanings === 1,
      parallel: JSON.parse(r.parallel) as Record<string, string[]>,
      meaning: JSON.parse(r.meaning) as Record<string, string[]>,
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

  topicsFor(itemIds: readonly number[]): Promise<Map<number, TopicRef[]>> {
    return topicsForItems(this.db, itemIds);
  }
}
