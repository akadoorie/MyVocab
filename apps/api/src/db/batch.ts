import { is, sql, SQL } from 'drizzle-orm';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import type { Actor } from '../repositories/interfaces';

/**
 * D1 batches (PRD §11.2, §12.4): a batch is one transaction and counts as one query. Statements
 * are built with Drizzle (builder or `sql` template, always parameterized) and compiled here.
 */

export type Query = { sql: string; params: unknown[] };

const dialect = new SQLiteAsyncDialect();

export function compile(q: SQL | { toSQL(): Query }): Query {
  return is(q, SQL) ? dialect.sqlToQuery(q) : q.toSQL();
}

export function runBatch(d1: D1Database, statements: (SQL | { toSQL(): Query })[]) {
  return d1.batch(
    statements.map((s) => {
      const q = compile(s);
      return d1.prepare(q.sql).bind(...q.params);
    }),
  );
}

/** Applies only if the statement right before it in the batch changed exactly one row. */
export const AFTER_ONE_CHANGE = sql`changes() = 1`;

export type AuditInput = {
  actor: Actor;
  action: string;
  entityType: string;
  /** A value, or a subquery when the id is only known inside the batch (e.g. a new item). */
  entityId: string | SQL | null;
  details: unknown;
};

/**
 * An audit_log insert for a batch. With `when`, the row is written only if the condition holds
 * (e.g. `AFTER_ONE_CHANGE` right after an optimistic UPDATE), so a change that didn't apply leaves
 * no audit entry (PRD §11.2 rule 7).
 */
export function auditInsert(entry: AuditInput, now: number, when?: SQL): SQL {
  const entityId =
    entry.entityId === null
      ? sql`NULL`
      : is(entry.entityId, SQL)
        ? sql`(${entry.entityId})`
        : sql`${entry.entityId}`;
  return sql`
    INSERT INTO audit_log (actor_user_id, actor_email, action, entity_type, entity_id, details, created_at)
    SELECT ${entry.actor?.userId ?? null}, ${entry.actor?.email ?? null}, ${entry.action},
           ${entry.entityType}, ${entityId}, ${JSON.stringify(entry.details ?? null)}, ${now}
    ${when ? sql`WHERE ${when}` : sql``}
  `;
}
