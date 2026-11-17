import { cleanText, normalize } from '@myvocab/core';
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client';

/** Escapes LIKE wildcards; used with `ESCAPE '\'`. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * Search on items `i`: the item text (normalized like the stored copy) or any translation entry.
 * Returns null when the query has nothing searchable.
 */
export function itemSearchCondition(q: string): SQL | null {
  const text = normalize(q);
  const raw = cleanText(q).toLowerCase();
  const either: SQL[] = [];
  if (text) either.push(sql`i.normalized_text LIKE ${likePattern(text)} ESCAPE '\\'`);
  if (raw) {
    either.push(sql`EXISTS (
      SELECT 1 FROM json_each(i.translation) AS t, json_each(t.value) AS v
      WHERE v.value LIKE ${likePattern(raw)} ESCAPE '\\')`);
  }
  return either.length > 0 ? sql`(${sql.join(either, sql` OR `)})` : null;
}

/** Category chips for a page of items (one query, ids as a JSON parameter). */
export async function categoriesForItems(
  db: Db,
  itemIds: readonly number[],
): Promise<Map<number, { id: number; name: string }[]>> {
  const result = new Map<number, { id: number; name: string }[]>();
  if (itemIds.length === 0) return result;
  const rows = await db.all<{ item_id: number; id: number; name: string }>(sql`
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
