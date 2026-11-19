import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

/** Database-level guarantees from PRD §11 that must survive future migrations. */
const now = Date.now();
const insertItem = (lang: string, text: string, translation: string, extra = '') =>
  env.DB.prepare(
    `INSERT INTO items (lang, text, normalized_text, type, translation_parallel, created_at, updated_at${extra ? ', explanation' : ''})
     VALUES (?, ?, ?, 'word', ?, ?, ?${extra ? ', ?' : ''})`,
  )
    .bind(lang, text, text.toLowerCase(), translation, now, now, ...(extra ? [extra] : []))
    .run();

describe('schema', () => {
  it('keeps item_categories, user_known_items and usage_counters WITHOUT ROWID (D-010)', async () => {
    const { results } = await env.DB.prepare(
      `SELECT name, sql FROM sqlite_master WHERE type = 'table'
       AND name IN ('item_categories', 'user_known_items', 'usage_counters')`,
    ).all<{ name: string; sql: string }>();
    expect(results).toHaveLength(3);
    for (const r of results) expect(r.sql, r.name).toMatch(/WITHOUT ROWID\s*$/i);
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
        `INSERT INTO items (lang, text, normalized_text, type, ${column}, created_at, updated_at)
         VALUES ('en', ?, ?, 'expr', ?, ?, ?)`,
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

  it('enforces one non-deleted item per language + normalized text + type', async () => {
    await insertItem('he', 'מהיר', '{"en":["fast"]}');
    await expect(insertItem('he', 'מהיר', '{"en":["quick"]}')).rejects.toThrow(/UNIQUE/);
    await env.DB.prepare(`UPDATE items SET deleted_at = ? WHERE lang = 'he'`).bind(now).run();
    await expect(insertItem('he', 'מהיר', '{"en":["quick"]}')).resolves.toBeTruthy();
  });

  it('enforces foreign keys', async () => {
    await expect(insertItem('fr', 'Bonjour', '{}')).rejects.toThrow(/FOREIGN KEY/);
  });
});
