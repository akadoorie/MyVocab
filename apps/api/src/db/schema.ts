/**
 * Database schema (PRD §11.1). SQLite (D1) via Drizzle. Our timestamps are INTEGER epoch ms.
 *
 * Notes:
 * - Item lists live inside the item row as JSON (PRD §11.2 rule 1), guarded by CHECK constraints.
 * - `item_topics`, `user_known_items` and `usage_counters` are WITHOUT ROWID. Drizzle can't
 *   express that, so the generated migration is edited by hand and a test asserts it (D-010).
 * - Better Auth tables use camelCase property names (the adapter maps by property name) and
 *   snake_case column names.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { ItemStatus, TextDir, Translations } from '@myvocab/core';

// ---------------------------------------------------------------------------------------------
// Better Auth (core tables + admin plugin fields)
// ---------------------------------------------------------------------------------------------

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  // admin plugin
  role: text('role').notNull().default('user'),
  banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp_ms' }),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // admin plugin
    impersonatedBy: text('impersonated_by'),
  },
  (t) => [index('ix_session_user').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('ix_account_user').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('ix_verification_identifier').on(t.identifier)],
);

// ---------------------------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------------------------

export const languages = sqliteTable(
  'languages',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    nativeName: text('native_name').notNull(),
    dir: text('dir').$type<TextDir>().notNull(),
    script: text('script').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  () => [check('ck_languages_dir', sql`dir IN ('ltr','rtl')`)],
);

export const topics = sqliteTable('topics', {
  id: integer('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /** The name in the Hebrew UI (D-080); null = the UI shows `name`. */
  nameHe: text('name_he'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  /**
   * An item can't be in this topic and that one together (D-046), e.g. "Expressions (except
   * Idioms)" and "Idioms". Kept symmetric by the topic service; a plain id (no foreign key, so
   * the column can be added without rebuilding the table).
   */
  excludesTopicId: integer('excludes_topic_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** One row per word/expression; its lists live inside the row as JSON (PRD §11.2 rule 1). */
export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey(),
    lang: text('lang')
      .notNull()
      .references(() => languages.code),
    text: text('text').notNull(),
    normalizedText: text('normalized_text').notNull(),
    multipleMeanings: integer('multiple_meanings', { mode: 'boolean' }).notNull().default(false),
    // The three kinds of translation per other language (PRD §8.1, D-024): the equivalent word or
    // expression, what it means, and the word-for-word translation.
    parallel: text('translation_parallel', { mode: 'json' })
      .$type<Translations>()
      .notNull()
      .default(sql`'{}'`),
    meaning: text('translation_meaning', { mode: 'json' })
      .$type<Translations>()
      .notNull()
      .default(sql`'{}'`),
    literal: text('translation_literal', { mode: 'json' })
      .$type<Translations>()
      .notNull()
      .default(sql`'{}'`),
    explanation: text('explanation', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    synonyms: text('synonyms', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    hints: text('hints', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    status: text('status').$type<ItemStatus>().notNull().default('published'),
    // Guests play only these items (D-038). New items start outside the set.
    inSampleSet: integer('in_sample_set', { mode: 'boolean' }).notNull().default(false),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    deletedBy: text('deleted_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (t) => [
    check('ck_items_status', sql`status IN ('draft','published')`),
    check('ck_items_multiple_meanings', sql`multiple_meanings IN (0,1)`),
    // The parallel and literal constraints keep their names from before the columns were renamed
    // (migration 0003): SQLite can't rename a constraint without rebuilding the table.
    check(
      'ck_items_translation_object',
      sql`json_valid(translation_parallel) AND json_type(translation_parallel) = 'object'`,
    ),
    // No translation of any kind into the item's own language (PRD §8.1).
    check(
      'ck_items_no_own_translation',
      sql`json_extract(translation_parallel, '$."' || lang || '"') IS NULL`,
    ),
    check(
      'ck_items_meaning_object',
      sql`json_valid(translation_meaning) AND json_type(translation_meaning) = 'object'`,
    ),
    check(
      'ck_items_no_own_meaning',
      sql`json_extract(translation_meaning, '$."' || lang || '"') IS NULL`,
    ),
    check(
      'ck_items_literal_object',
      sql`json_valid(translation_literal) AND json_type(translation_literal) = 'object'`,
    ),
    check(
      'ck_items_no_own_literal',
      sql`json_extract(translation_literal, '$."' || lang || '"') IS NULL`,
    ),
    check(
      'ck_items_explanation_array',
      sql`json_valid(explanation) AND json_type(explanation) = 'array'`,
    ),
    check('ck_items_synonyms_array', sql`json_valid(synonyms) AND json_type(synonyms) = 'array'`),
    check('ck_items_hints_array', sql`json_valid(hints) AND json_type(hints) = 'array'`),
    uniqueIndex('ux_items_identity')
      .on(t.lang, t.normalizedText)
      .where(sql`deleted_at IS NULL`),
    index('ix_items_playable')
      .on(t.lang)
      .where(sql`status = 'published' AND deleted_at IS NULL`),
    index('ix_items_trash')
      .on(t.deletedAt)
      .where(sql`deleted_at IS NOT NULL`),
  ],
);

export const itemTopics = sqliteTable(
  'item_topics',
  {
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    topicId: integer('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.topicId] }),
    index('ix_item_topics_topic').on(t.topicId, t.itemId),
  ],
);

/**
 * Known memory: one row per user + item + target language. It hides the item only in the
 * direction it was marked in (FR-L54, D-028); the explanation direction (target = the item's own
 * language) is a direction of its own.
 */
export const userKnownItems = sqliteTable(
  'user_known_items',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    knownTarget: text('known_target').notNull(),
    knownInCycle: integer('known_in_cycle').notNull(),
    knownAt: integer('known_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.itemId, t.knownTarget] }),
    index('ix_known_item').on(t.itemId),
    check('ck_known_cycle', sql`known_in_cycle >= 1`),
  ],
);

// ---------------------------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------------------------

/** Anti-scraping counters (PRD §14.3). Raw IPs are never stored. */
export const usageCounters = sqliteTable(
  'usage_counters',
  {
    subject: text('subject').notNull(),
    period: text('period').notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.subject, t.period] })],
);

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull(),
});

/** Append-only audit log (no update/delete API). No FK on the actor: history outlives users. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey(),
    actorUserId: text('actor_user_id'),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    details: text('details', { mode: 'json' }).$type<unknown>(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('ix_audit_time').on(t.createdAt)],
);
