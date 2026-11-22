import { applyD1Migrations, env, reset } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

/** Database-level guarantees from PRD §11 that must survive future migrations. */
const now = Date.now();
const insertItem = (lang: string, text: string, translation: string, extra = '') =>
  env.DB.prepare(
    `INSERT INTO items (lang, text, normalized_text, translation_parallel, created_at, updated_at${extra ? ', explanation' : ''})
     VALUES (?, ?, ?, ?, ?, ?${extra ? ', ?' : ''})`,
  )
    .bind(lang, text, text.toLowerCase(), translation, now, now, ...(extra ? [extra] : []))
    .run();

describe('schema', () => {
  it('keeps item_topics, user_known_items and usage_counters WITHOUT ROWID (D-010)', async () => {
    const { results } = await env.DB.prepare(
      `SELECT name, sql FROM sqlite_master WHERE type = 'table'
       AND name IN ('item_topics', 'user_known_items', 'usage_counters')`,
    ).all<{ name: string; sql: string }>();
    expect(results).toHaveLength(3);
    for (const r of results) expect(r.sql, r.name).toMatch(/WITHOUT ROWID\s*$/i);
  });

  it('keys known items by user, item and target language, and cascades from items (D-028)', async () => {
    const { results } = await env.DB.prepare(
      `SELECT name, pk FROM pragma_table_info('user_known_items') WHERE pk > 0 ORDER BY pk`,
    ).all<{ name: string; pk: number }>();
    expect(results.map((r) => r.name)).toEqual(['user_id', 'item_id', 'known_target']);
    const index = await env.DB.prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type = 'index' AND name = 'ix_known_item'`,
    ).first();
    expect(index).toEqual({ ok: 1 });

    await insertItem('en', 'Cascade', '{"he":["מפל"]}');
    await env.DB.prepare(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
       VALUES ('u-cascade', 'U', 'cascade@example.test', 1, ?, ?)`,
    )
      .bind(now, now)
      .run();
    const known = (target: string) =>
      env.DB.prepare(
        `INSERT INTO user_known_items (user_id, item_id, known_target, known_in_round, known_at)
         SELECT 'u-cascade', id, ?, 1, ? FROM items WHERE text = 'Cascade'`,
      )
        .bind(target, now)
        .run();
    await known('he');
    await known('en');
    await expect(known('he')).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
    await env.DB.prepare(`DELETE FROM items WHERE text = 'Cascade'`).run();
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM user_known_items').first();
    expect(left).toEqual({ n: 0 });
  });

  it('seeds English and Hebrew', async () => {
    const { results } = await env.DB.prepare(
      'SELECT code, dir, script FROM languages ORDER BY sort_order',
    ).all();
    expect(results).toEqual([
      { code: 'en', dir: 'ltr', script: 'Latn' },
      { code: 'he', dir: 'rtl', script: 'Hebr' },
    ]);
  });

  it('rejects a translation into the item own language (CHECK)', async () => {
    await expect(insertItem('en', 'Swift', '{"en":["fast"]}')).rejects.toThrow(/CHECK/);
    await expect(insertItem('en', 'Swift', '{"he":["מהיר"]}')).resolves.toBeTruthy();
  });

  it('defaults meaning and literal to {} and rejects one in the item own language or a non-object (CHECK, D-024)', async () => {
    const withList = (column: string, text: string, value: string) =>
      env.DB.prepare(
        `INSERT INTO items (lang, text, normalized_text, ${column}, created_at, updated_at)
         VALUES ('en', ?, ?, ?, ?, ?)`,
      )
        .bind(text, text.toLowerCase(), value, now, now)
        .run();
    await insertItem('en', 'Plain', '{"he":["פשוט"]}');
    const row = await env.DB.prepare(
      `SELECT translation_meaning, translation_literal FROM items WHERE text = 'Plain'`,
    ).first();
    expect(row).toEqual({ translation_meaning: '{}', translation_literal: '{}' });
    for (const column of ['translation_meaning', 'translation_literal']) {
      await expect(withList(column, `${column}-1`, '{"en":["x"]}')).rejects.toThrow(/CHECK/);
      await expect(withList(column, `${column}-2`, '["x"]')).rejects.toThrow(/CHECK/);
      await expect(withList(column, `${column}-3`, '{"he":["רשומה-1"]}')).resolves.toBeTruthy();
    }
  });

  it('has the three translation columns and no old ones (migration 0003)', async () => {
    const { results } = await env.DB.prepare(`SELECT name FROM pragma_table_info('items')`).all<{
      name: string;
    }>();
    const names = results.map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'translation_parallel',
        'translation_meaning',
        'translation_literal',
      ]),
    );
    expect(names).not.toContain('translation');
    expect(names).not.toContain('literal');
  });

  it('rejects invalid JSON shapes for the lists (CHECK)', async () => {
    await expect(insertItem('en', 'A', '[]')).rejects.toThrow(/CHECK/);
    await expect(insertItem('en', 'B', '{}', '{"not":"array"}')).rejects.toThrow(/CHECK/);
    await expect(insertItem('en', 'C', 'not json')).rejects.toThrow();
  });

  it('enforces one non-deleted item per language + normalized text (no type, D-046)', async () => {
    await insertItem('he', 'מהיר', '{"en":["fast"]}');
    await expect(insertItem('he', 'מהיר', '{"en":["quick"]}')).rejects.toThrow(/UNIQUE/);
    await env.DB.prepare(`UPDATE items SET deleted_at = ? WHERE lang = 'he'`).bind(now).run();
    await expect(insertItem('he', 'מהיר', '{"en":["quick"]}')).resolves.toBeTruthy();
  });

  it('migration 0009 keeps every known word, now in known_in_round under ck_known_round (D-081)', async () => {
    // Back to the database as it was before 0009, with known words and an old settings key.
    await reset();
    const before = env.TEST_MIGRATIONS.filter((m) => m.name < '0009');
    await applyD1Migrations(env.DB, before);
    await insertItem('en', 'Keep', '{"he":["לשמור"]}');
    await env.DB.prepare(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
       VALUES ('u-keep', 'U', 'keep@example.test', 1, ?, ?)`,
    )
      .bind(now, now)
      .run();
    for (const [target, round, at] of [
      ['he', 3, 111],
      ['en', 1, 222],
    ] as const)
      await env.DB.prepare(
        `INSERT INTO user_known_items (user_id, item_id, known_target, known_in_cycle, known_at)
         SELECT 'u-keep', id, ?, ?, ? FROM items WHERE text = 'Keep'`,
      )
        .bind(target, round, at)
        .run();
    await env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('loop.continueSeconds', '7', ?)`,
    )
      .bind(now)
      .run();

    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

    const { results } = await env.DB.prepare(
      `SELECT known_target, known_in_round, known_at FROM user_known_items ORDER BY known_target`,
    ).all();
    expect(results).toEqual([
      { known_target: 'en', known_in_round: 1, known_at: 222 },
      { known_target: 'he', known_in_round: 3, known_at: 111 },
    ]);
    const table = await env.DB.prepare(
      `SELECT sql FROM sqlite_master WHERE name = 'user_known_items'`,
    ).first<{ sql: string }>();
    expect(table?.sql).toContain('ck_known_round');
    expect(table?.sql).not.toContain('cycle');
    expect(table?.sql).toMatch(/WITHOUT ROWID\s*$/i);
    const setting = await env.DB.prepare(
      `SELECT key, value FROM app_settings WHERE key LIKE '%continueSeconds'`,
    ).all();
    expect(setting.results).toEqual([{ key: 'practice.continueSeconds', value: '7' }]);
  });

  it('enforces foreign keys', async () => {
    await expect(insertItem('fr', 'Bonjour', '{}')).rejects.toThrow(/FOREIGN KEY/);
  });
});
