import { normalize, type ImportPlan } from '@myvocab/core';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import type { Db } from '../../db/client';
import { auditLog, categories, items } from '../../db/schema';
import type { Actor, ImportAuditInfo, ImportWriteResult, ImportWriter } from '../interfaces';

/** Statements per D1 batch. A batch is one transaction and one query (D1 limits). */
export const STATEMENTS_PER_BATCH = 1000;

/** "electronics-devices" → "Electronics Devices" (PRD §8.3, "Create missing categories"). */
export function slugToName(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

type Query = { sql: string; params: unknown[] };
type Stmt = { query: Query; updateOf?: number };

const dialect = new SQLiteAsyncDialect();
const raw = (q: SQL): Query => dialect.sqlToQuery(q);

export class D1ImportWriter implements ImportWriter {
  constructor(
    private readonly db: Db,
    private readonly d1: D1Database,
    private readonly now: () => number = Date.now,
  ) {}

  async write(
    plan: ImportPlan,
    versions: ReadonlyMap<number, number>,
    actor: Actor,
    audit: ImportAuditInfo,
  ): Promise<ImportWriteResult> {
    const now = this.now();
    const stmts: Stmt[] = [];

    for (const slug of plan.newCategories) {
      stmts.push({
        query: this.db
          .insert(categories)
          .values({ slug, name: slugToName(slug), createdAt: now, updatedAt: now })
          .onConflictDoNothing()
          .toSQL(),
      });
    }

    for (const create of plan.creates) {
      const c = create.content;
      stmts.push({
        query: this.db
          .insert(items)
          .values({
            lang: c.lang,
            text: c.text,
            normalizedText: normalize(c.text),
            type: c.type,
            multipleMeanings: c.multipleMeanings,
            parallel: c.parallel,
            meaning: c.meaning,
            literal: c.literal,
            explanation: c.explanation,
            synonyms: c.synonyms,
            hints: c.hints,
            status: create.status,
            createdBy: actor?.userId ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .toSQL(),
      });
      if (create.categories.length > 0) {
        stmts.push({
          query: raw(sql`
            INSERT OR IGNORE INTO item_categories (item_id, category_id)
            SELECT i.id, c.id FROM items AS i, categories AS c
            WHERE i.lang = ${c.lang} AND i.type = ${c.type}
              AND i.normalized_text = ${normalize(c.text)} AND i.deleted_at IS NULL
              AND c.slug IN (SELECT value FROM json_each(${JSON.stringify(create.categories)}))
          `),
        });
      }
    }

    for (const update of plan.updates) {
      if (!update.changed) continue;
      const c = update.content;
      const version = versions.get(update.id);
      if (version === undefined) throw new Error(`Missing version for item ${update.id}`);
      const where: SQL = and(
        eq(items.id, update.id),
        eq(items.version, version),
        isNull(items.deletedAt),
      ) as SQL;
      stmts.push({
        updateOf: update.id,
        query: this.db
          .update(items)
          .set({
            parallel: c.parallel,
            meaning: c.meaning,
            literal: c.literal,
            explanation: c.explanation,
            synonyms: c.synonyms,
            hints: c.hints,
            multipleMeanings: c.multipleMeanings,
            version: version + 1,
            updatedAt: now,
          })
          .where(where)
          .toSQL(),
      });
      if (update.categoriesToAdd.length > 0) {
        // Only links the item if the update above applied (same version check).
        stmts.push({
          query: raw(sql`
            INSERT OR IGNORE INTO item_categories (item_id, category_id)
            SELECT ${update.id}, c.id FROM categories AS c
            WHERE c.slug IN (SELECT value FROM json_each(${JSON.stringify(update.categoriesToAdd)}))
              AND EXISTS (SELECT 1 FROM items WHERE id = ${update.id} AND version = ${version + 1})
          `),
        });
      }
    }

    stmts.push({
      query: this.db
        .insert(auditLog)
        .values({
          actorUserId: actor?.userId ?? null,
          actorEmail: actor?.email ?? null,
          action: 'csv.import',
          entityType: 'import',
          entityId: audit.sha256.slice(0, 16),
          details: { fileName: audit.fileName, sha256: audit.sha256, totals: audit.totals },
          createdAt: now,
        })
        .toSQL(),
    });

    let skippedConcurrent = 0;
    let batches = 0;
    for (let i = 0; i < stmts.length; i += STATEMENTS_PER_BATCH) {
      const chunk = stmts.slice(i, i + STATEMENTS_PER_BATCH);
      const results = await this.d1.batch(
        chunk.map((s) => this.d1.prepare(s.query.sql).bind(...s.query.params)),
      );
      batches++;
      chunk.forEach((s, j) => {
        if (s.updateOf === undefined) return;
        const changes = results[j]?.meta.changes;
        if (changes === 0) skippedConcurrent++;
      });
    }
    return { skippedConcurrent, batches };
  }
}
