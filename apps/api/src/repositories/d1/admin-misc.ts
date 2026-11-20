import type { ItemType, TextDir } from '@myvocab/core';
import { and, count, eq, sql, type SQL } from 'drizzle-orm';
import { AFTER_ONE_CHANGE, auditInsert, runBatch } from '../../db/batch';
import type { Db } from '../../db/client';
import { appSettings, categories, languages, session, user } from '../../db/schema';
import type {
  Actor,
  AdminCategoryRepository,
  AdminLanguageRepository,
  AdminSettingsRepository,
  AdminUserRepository,
  AdminUserRow,
  AuditDetails,
  AuditFilter,
  AuditQueryRepository,
  AuditRow,
  CategoryRow,
  CategoryWithCount,
  LanguageChanges,
  StatsRepository,
} from '../interfaces';
import { likePattern } from './shared';

type Statement = SQL | { toSQL(): { sql: string; params: unknown[] } };

// ---------------------------------------------------------------------------------------------
// Categories (FR-A30)
// ---------------------------------------------------------------------------------------------

const CATEGORY_COLUMNS = sql`c.id, c.slug, c.name, c.is_active, c.sort_order,
  (SELECT COUNT(*) FROM item_categories ic WHERE ic.category_id = c.id) AS item_count`;

type CategoryDbRow = {
  id: number;
  slug: string;
  name: string;
  is_active: number;
  sort_order: number;
  item_count: number;
};

const toCategory = (r: CategoryDbRow): CategoryWithCount => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  isActive: r.is_active === 1,
  sortOrder: r.sort_order,
  itemCount: r.item_count,
});

export class D1AdminCategoryRepository implements AdminCategoryRepository {
  constructor(
    private readonly db: Db,
    private readonly d1: D1Database,
  ) {}

  async listWithCounts(): Promise<CategoryWithCount[]> {
    const rows = await this.db.all<CategoryDbRow>(
      sql`SELECT ${CATEGORY_COLUMNS} FROM categories AS c ORDER BY c.sort_order, c.name`,
    );
    return rows.map(toCategory);
  }

  async get(id: number): Promise<CategoryWithCount | null> {
    const row = await this.db.get<CategoryDbRow>(
      sql`SELECT ${CATEGORY_COLUMNS} FROM categories AS c WHERE c.id = ${id}`,
    );
    return row ? toCategory(row) : null;
  }

  async findBySlug(slug: string): Promise<CategoryRow | null> {
    const row = await this.db.select().from(categories).where(eq(categories.slug, slug)).get();
    return row
      ? {
          id: row.id,
          slug: row.slug,
          name: row.name,
          isActive: row.isActive,
          sortOrder: row.sortOrder,
        }
      : null;
  }

  async create(
    input: { slug: string; name: string; isActive: boolean },
    actor: Actor,
    now: number,
  ): Promise<number> {
    await runBatch(this.d1, [
      sql`INSERT INTO categories (slug, name, is_active, sort_order, created_at, updated_at)
          SELECT ${input.slug}, ${input.name}, ${input.isActive ? 1 : 0},
                 COALESCE((SELECT MAX(sort_order) FROM categories), 0) + 1, ${now}, ${now}`,
      auditInsert(
        {
          actor,
          action: 'category.create',
          entityType: 'category',
          entityId: sql`SELECT CAST(id AS TEXT) FROM categories WHERE slug = ${input.slug}`,
          details: { after: input },
        },
        now,
      ),
    ]);
    const created = await this.findBySlug(input.slug);
    if (!created) throw new Error('created category not found');
    return created.id;
  }

  async update(
    id: number,
    changes: Partial<{ slug: string; name: string; isActive: boolean }>,
    actor: Actor,
    audit: AuditDetails,
    now: number,
  ): Promise<boolean> {
    const [result] = await runBatch(this.d1, [
      this.db
        .update(categories)
        .set({ ...changes, updatedAt: now })
        .where(eq(categories.id, id)),
      auditInsert(
        {
          actor,
          action: audit.action,
          entityType: 'category',
          entityId: String(id),
          details: audit.details,
        },
        now,
        AFTER_ONE_CHANGE,
      ),
    ]);
    return result?.meta.changes === 1;
  }

  async delete(id: number, actor: Actor, audit: AuditDetails, now: number): Promise<boolean> {
    const [result] = await runBatch(this.d1, [
      sql`DELETE FROM categories WHERE id = ${id}
          AND NOT EXISTS (SELECT 1 FROM item_categories WHERE category_id = ${id})`,
      auditInsert(
        {
          actor,
          action: audit.action,
          entityType: 'category',
          entityId: String(id),
          details: audit.details,
        },
        now,
        AFTER_ONE_CHANGE,
      ),
    ]);
    return result?.meta.changes === 1;
  }

  async reorder(ids: readonly number[], actor: Actor, now: number): Promise<void> {
    const statements: Statement[] = ids.map((id, index) =>
      this.db
        .update(categories)
        .set({ sortOrder: index + 1, updatedAt: now })
        .where(eq(categories.id, id)),
    );
    statements.push(
      auditInsert(
        {
          actor,
          action: 'category.reorder',
          entityType: 'category',
          entityId: null,
          details: { ids },
        },
        now,
      ),
    );
    await runBatch(this.d1, statements);
  }
}

// ---------------------------------------------------------------------------------------------
// Languages (FR-A35)
// ---------------------------------------------------------------------------------------------

export class D1AdminLanguageRepository implements AdminLanguageRepository {
  constructor(
    private readonly db: Db,
    private readonly d1: D1Database,
  ) {}

  async create(
    input: { code: string; name: string; nativeName: string; dir: TextDir; script: string },
    actor: Actor,
    now: number,
  ): Promise<boolean> {
    const [result] = await runBatch(this.d1, [
      sql`INSERT INTO languages (code, name, native_name, dir, script, is_active, sort_order)
          SELECT ${input.code}, ${input.name}, ${input.nativeName}, ${input.dir}, ${input.script}, 0,
                 COALESCE((SELECT MAX(sort_order) FROM languages), 0) + 1
          WHERE NOT EXISTS (SELECT 1 FROM languages WHERE code = ${input.code})`,
      auditInsert(
        {
          actor,
          action: 'language.create',
          entityType: 'language',
          entityId: input.code,
          details: { after: { ...input, isActive: false } },
        },
        now,
        AFTER_ONE_CHANGE,
      ),
    ]);
    return result?.meta.changes === 1;
  }

  async update(
    code: string,
    changes: LanguageChanges,
    actor: Actor,
    now: number,
  ): Promise<boolean> {
    const [result] = await runBatch(this.d1, [
      this.db.update(languages).set(changes).where(eq(languages.code, code)),
      auditInsert(
        {
          actor,
          action: 'language.update',
          entityType: 'language',
          entityId: code,
          details: changes,
        },
        now,
        AFTER_ONE_CHANGE,
      ),
    ]);
    return result?.meta.changes === 1;
  }
}

// ---------------------------------------------------------------------------------------------
// Users (FR-A40–42)
// ---------------------------------------------------------------------------------------------

type UserDbRow = {
  id: string;
  name: string;
  email: string;
  email_verified: number;
  image: string | null;
  role: string;
  banned: number;
  ban_reason: string | null;
  created_at: number;
  last_seen_at: number | null;
};

const USER_COLUMNS = sql`u.id, u.name, u.email, u.email_verified, u.image, u.role, u.banned,
  u.ban_reason, u.created_at,
  (SELECT MAX(s.updated_at) FROM session s WHERE s.user_id = u.id) AS last_seen_at`;

const DAY = 24 * 60 * 60 * 1000;

const toUser = (r: UserDbRow): AdminUserRow => ({
  id: r.id,
  name: r.name,
  email: r.email,
  emailVerified: r.email_verified === 1,
  image: r.image,
  role: r.role,
  banned: r.banned === 1,
  banReason: r.ban_reason,
  createdAt: r.created_at,
  // Day precision (FR-A40): sessions are refreshed at most once a day anyway.
  lastSeenAt: r.last_seen_at === null ? null : Math.floor(r.last_seen_at / DAY) * DAY,
});

export class D1AdminUserRepository implements AdminUserRepository {
  constructor(
    private readonly db: Db,
    private readonly d1: D1Database,
  ) {}

  async get(id: string): Promise<AdminUserRow | null> {
    const row = await this.db.get<UserDbRow>(
      sql`SELECT ${USER_COLUMNS} FROM "user" AS u WHERE u.id = ${id}`,
    );
    return row ? toUser(row) : null;
  }

  async list(
    q: string | undefined,
    cursor: { createdAt: number; id: string } | null,
    limit: number,
  ): Promise<AdminUserRow[]> {
    const conds: SQL[] = [sql`1 = 1`];
    if (q) {
      const pattern = likePattern(q.toLowerCase());
      conds.push(
        sql`(lower(u.name) LIKE ${pattern} ESCAPE '\\' OR lower(u.email) LIKE ${pattern} ESCAPE '\\')`,
      );
    }
    if (cursor) {
      conds.push(
        sql`(u.created_at < ${cursor.createdAt} OR (u.created_at = ${cursor.createdAt} AND u.id < ${cursor.id}))`,
      );
    }
    const rows = await this.db.all<UserDbRow>(sql`
      SELECT ${USER_COLUMNS} FROM "user" AS u
      WHERE ${sql.join(conds, sql` AND `)}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ${limit}
    `);
    return rows.map(toUser);
  }

  async countActiveAdmins(): Promise<number> {
    const row = await this.db
      .select({ n: count() })
      .from(user)
      .where(and(eq(user.role, 'admin'), eq(user.banned, false)))
      .get();
    return row?.n ?? 0;
  }

  async apply(
    id: string,
    changes: { role?: string; banned?: boolean; banReason?: string | null },
    audits: readonly AuditDetails[],
    actor: Actor,
    now: number,
  ): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: new Date(now) };
    if (changes.role !== undefined) set.role = changes.role;
    if (changes.banned !== undefined) {
      set.banned = changes.banned;
      set.banReason = changes.banned ? (changes.banReason ?? null) : null;
      set.banExpires = null;
    }
    const statements: Statement[] = [this.db.update(user).set(set).where(eq(user.id, id))];
    // Banning revokes every session of that user (FR-A42).
    if (changes.banned) statements.push(this.db.delete(session).where(eq(session.userId, id)));
    for (const audit of audits) {
      statements.push(
        auditInsert(
          { actor, action: audit.action, entityType: 'user', entityId: id, details: audit.details },
          now,
        ),
      );
    }
    await runBatch(this.d1, statements);
  }
}

// ---------------------------------------------------------------------------------------------
// Settings (FR-A50), audit log (FR-A70), dashboard (FR-A1)
// ---------------------------------------------------------------------------------------------

export class D1AdminSettingsRepository implements AdminSettingsRepository {
  constructor(
    private readonly db: Db,
    private readonly d1: D1Database,
  ) {}

  async write(
    values: Readonly<Record<string, unknown>>,
    actor: Actor,
    audit: AuditDetails,
    now: number,
  ): Promise<void> {
    const statements: Statement[] = Object.entries(values).map(([key, value]) =>
      this.db
        .insert(appSettings)
        .values({ key, value, updatedBy: actor?.userId ?? null, updatedAt: now })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedBy: actor?.userId ?? null, updatedAt: now },
        }),
    );
    statements.push(
      auditInsert(
        {
          actor,
          action: audit.action,
          entityType: 'settings',
          entityId: null,
          details: audit.details,
        },
        now,
      ),
    );
    await runBatch(this.d1, statements);
  }
}

type AuditDbRow = {
  id: number;
  created_at: number;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
};

export class D1AuditQueryRepository implements AuditQueryRepository {
  constructor(private readonly db: Db) {}

  async list(filter: AuditFilter, limit: number): Promise<AuditRow[]> {
    const conds: SQL[] = [sql`1 = 1`];
    if (filter.actor) {
      conds.push(
        sql`(a.actor_user_id = ${filter.actor} OR lower(a.actor_email) LIKE ${likePattern(filter.actor.toLowerCase())} ESCAPE '\\')`,
      );
    }
    if (filter.action) {
      conds.push(
        sql`a.action LIKE ${`${filter.action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} ESCAPE '\\'`,
      );
    }
    if (filter.entityType) conds.push(sql`a.entity_type = ${filter.entityType}`);
    if (filter.from !== undefined) conds.push(sql`a.created_at >= ${filter.from}`);
    if (filter.to !== undefined) conds.push(sql`a.created_at <= ${filter.to}`);
    if (filter.beforeId !== undefined) conds.push(sql`a.id < ${filter.beforeId}`);
    const rows = await this.db.all<AuditDbRow>(sql`
      SELECT a.id, a.created_at, a.actor_user_id, a.actor_email, a.action, a.entity_type,
             a.entity_id, a.details
      FROM audit_log AS a
      WHERE ${sql.join(conds, sql` AND `)}
      ORDER BY a.id DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      actorUserId: r.actor_user_id,
      actorEmail: r.actor_email,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      details: r.details === null ? null : (JSON.parse(r.details) as unknown),
    }));
  }
}

export class D1StatsRepository implements StatsRepository {
  constructor(private readonly db: Db) {}

  async stats(activeLangs: readonly string[], since: number) {
    const langs = JSON.stringify(activeLangs);
    const [totals, byLangType, missing, users, other] = await Promise.all([
      this.db.get<{
        total: number;
        drafts: number;
        no_explanation: number;
        no_hints: number;
        multiple_meanings: number;
      }>(sql`
        SELECT COUNT(*) AS total,
               COALESCE(SUM(status = 'draft'), 0) AS drafts,
               COALESCE(SUM(json_array_length(explanation) = 0), 0) AS no_explanation,
               COALESCE(SUM(json_array_length(hints) = 0), 0) AS no_hints,
               COALESCE(SUM(multiple_meanings), 0) AS multiple_meanings
        FROM items WHERE deleted_at IS NULL`),
      this.db.all<{ lang: string; type: ItemType; count: number }>(sql`
        SELECT lang, type, COUNT(*) AS count FROM items WHERE deleted_at IS NULL
        GROUP BY lang, type ORDER BY lang, type`),
      this.db.all<{ target: string; count: number }>(sql`
        SELECT l.value AS target, COUNT(i.id) AS count
        FROM json_each(${langs}) AS l
        LEFT JOIN items AS i ON i.deleted_at IS NULL AND i.lang <> l.value
          AND COALESCE(json_array_length(i.translation_meaning, '$."' || l.value || '"'), 0) = 0
        GROUP BY l.value`),
      this.db
        .select({ total: count(), admins: sql<number>`COALESCE(SUM(${user.role} = 'admin'), 0)` })
        .from(user)
        .get(),
      this.db.get<{ trash: number; limit_events: number }>(sql`
        SELECT (SELECT COUNT(*) FROM items WHERE deleted_at IS NOT NULL) AS trash,
               (SELECT COUNT(*) FROM audit_log WHERE created_at >= ${since}
                  AND action = 'limit.exceeded') AS limit_events`),
    ]);
    return {
      total: totals?.total ?? 0,
      drafts: totals?.drafts ?? 0,
      noExplanation: totals?.no_explanation ?? 0,
      noHints: totals?.no_hints ?? 0,
      multipleMeanings: totals?.multiple_meanings ?? 0,
      byLangType,
      missingTranslation: Object.fromEntries(missing.map((m) => [m.target, m.count])),
      users: users?.total ?? 0,
      admins: users?.admins ?? 0,
      trash: other?.trash ?? 0,
      limitEvents: other?.limit_events ?? 0,
    };
  }
}
