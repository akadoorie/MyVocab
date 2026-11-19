import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createContainer } from '../src/container';
import { slugToName } from '../src/repositories/d1/import-writer';
import type { ImportInput } from '../src/services/csv-import-service';

// Synthetic content only (PRD §14.2).
const HEADER =
  'lang,text,type,multiple_meanings,categories,translation_he,translation_en,explanation,synonyms,hints,status';
const ROWS = [
  'en,sample-word-1,word,true,home,מילה-א|מילה-ב,,"First meaning|Second meaning",alpha|beta,"Example one.|Example two.",published',
  'en,sample-expression-1,expr,false,,ביטוי-א,,,,,draft',
  'he,מילה-לדוגמה,word,false,food,,sample|example,הסבר,,,',
];
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

const run = (over: Partial<ImportInput>) =>
  createContainer(env.DB).csvImport.run({
    csvText: csv(...ROWS),
    fileName: 'test.csv',
    dryRun: false,
    createMissingCategories: true,
    actor: null,
    ...over,
  });

const count = async (table: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0;

describe('CsvImportService', () => {
  it('dry run reports totals and writes nothing', async () => {
    const report = await run({ dryRun: true });
    expect(report).toMatchObject({ dryRun: true, committed: false, errors: [] });
    expect(report.totals).toMatchObject({ newItems: 3, newCategories: 2, newHints: 2 });
    expect(await count('items')).toBe(0);
    expect(await count('audit_log')).toBe(0);
  });

  it('commit writes items, categories, links and one audit entry', async () => {
    const report = await run({});
    expect(report).toMatchObject({ committed: true, errors: [], batches: 1, skippedConcurrent: 0 });
    expect(await count('items')).toBe(3);
    expect(await count('categories')).toBe(2);
    expect(await count('item_categories')).toBe(2);

    const item = await env.DB.prepare(
      `SELECT text, multiple_meanings, translation_meaning AS translation, explanation, status, version FROM items WHERE text = 'sample-word-1'`,
    ).first<Record<string, unknown>>();
    expect(item).toMatchObject({
      multiple_meanings: 1,
      translation: '{"he":["מילה-א","מילה-ב"]}',
      explanation: '["First meaning","Second meaning"]',
      status: 'published',
      version: 1,
    });
    const draft = await env.DB.prepare(
      `SELECT status FROM items WHERE text = 'sample-expression-1'`,
    ).first();
    expect(draft).toEqual({ status: 'draft' });
    const home = await env.DB.prepare(`SELECT name FROM categories WHERE slug = 'home'`).first();
    expect(home).toEqual({ name: 'Home' });

    const audit = await env.DB.prepare(`SELECT action, details FROM audit_log`).first<{
      action: string;
      details: string;
    }>();
    expect(audit?.action).toBe('csv.import');
    const details = JSON.parse(audit?.details ?? '{}');
    expect(details).toMatchObject({ fileName: 'test.csv', totals: { newItems: 3 } });
    expect(details.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(details)).not.toContain('sample-word-1'); // never the file contents
  });

  it('re-importing the same file changes nothing (append-only, idempotent)', async () => {
    await run({});
    const second = await run({});
    expect(second.totals).toMatchObject({
      newItems: 0,
      mergedItems: 3,
      newHints: 0,
      newCategories: 0,
    });
    expect(second.totals?.skippedDuplicates).toBeGreaterThan(0);
    expect(await count('items')).toBe(3);
    const v = await env.DB.prepare(`SELECT MAX(version) AS v FROM items`).first<{ v: number }>();
    expect(v?.v).toBe(1); // unchanged items are not rewritten
  });

  it('merges new entries and categories into existing items, bumping the version', async () => {
    await run({});
    const report = await run({
      csvText: csv('en,sample-word-1,word,,food|travel,מילה-ג,,,gamma,,draft'),
    });
    expect(report.errors).toEqual([]);
    expect(report.totals).toMatchObject({
      mergedItems: 1,
      newMeaningEntries: 1,
      newSynonyms: 1,
      newCategories: 1,
    });
    const item = await env.DB.prepare(
      `SELECT id, translation_meaning AS translation, synonyms, status, version FROM items WHERE text = 'sample-word-1'`,
    ).first<{
      id: number;
      translation: string;
      synonyms: string;
      status: string;
      version: number;
    }>();
    expect(JSON.parse(item?.translation ?? '{}')).toEqual({ he: ['מילה-א', 'מילה-ב', 'מילה-ג'] });
    expect(JSON.parse(item?.synonyms ?? '[]')).toEqual(['alpha', 'beta', 'gamma']);
    expect(item?.status).toBe('published'); // status of an existing item is never changed
    expect(item?.version).toBe(2);
    const links = await env.DB.prepare(
      `SELECT c.slug FROM item_categories ic JOIN categories c ON c.id = ic.category_id WHERE ic.item_id = ? ORDER BY c.slug`,
    )
      .bind(item?.id)
      .all();
    expect(links.results.map((r) => r.slug)).toEqual(['food', 'home', 'travel']);
  });

  it('refuses to commit a file with errors and reports them with row and column', async () => {
    const report = await run({
      csvText: csv('en,ok-word,word,,,מילה,,,,,', 'en,bad,word,,,,ok,,,,'),
    });
    expect(report.committed).toBe(false);
    expect(report.errors).toEqual([expect.objectContaining({ row: 3, column: 'translation_en' })]);
    expect(await count('items')).toBe(0);
  });

  it('reports unknown categories unless "create missing" is ticked', async () => {
    const report = await run({ createMissingCategories: false });
    expect(report.committed).toBe(false);
    expect(report.errors.map((e) => e.column)).toEqual(['categories', 'categories']);
  });

  it('stops at file-level errors', async () => {
    const report = await run({ csvText: 'lang,text\nen,x' });
    expect(report.errors).toEqual([
      expect.objectContaining({ message: 'Missing required column "type"' }),
    ]);
    expect(report.totals).toBeNull();
  });

  it('enforces the upload limits, and the seed path can disable them', async () => {
    const big = csv(...Array.from({ length: 3 }, (_, i) => `en,word-${i},word,,,מילה,,,,,`));
    const limited = await run({ csvText: big, limits: { maxBytes: 10_000, maxRows: 2 } });
    expect(limited.errors[0]?.message).toMatch(/Too many rows/);
    const tooBig = await run({ csvText: big, limits: { maxBytes: 10, maxRows: 100 } });
    expect(tooBig.errors[0]?.message).toMatch(/larger than/);
    const seed = await run({ csvText: big, limits: null });
    expect(seed.committed).toBe(true);
  });

  it('skips an update when the item changed while the import ran', async () => {
    await run({});
    const c = createContainer(env.DB);
    // Simulate a concurrent admin edit: the version moves on after the import read it.
    const writer = c.csvImport['deps'].writer;
    const original = writer.write.bind(writer);
    c.csvImport['deps'].writer = {
      write: async (plan, versions, actor, audit) => {
        await env.DB.prepare(
          `UPDATE items SET version = version + 1 WHERE text = 'sample-word-1'`,
        ).run();
        return original(plan, versions, actor, audit);
      },
    };
    const report = await c.csvImport.run({
      csvText: csv('en,sample-word-1,word,,,מילה-חדשה,,,,,'),
      fileName: 'x.csv',
      dryRun: false,
      createMissingCategories: true,
      actor: null,
    });
    expect(report).toMatchObject({ committed: true, skippedConcurrent: 1 });
    const item = await env.DB.prepare(
      `SELECT translation_meaning AS translation FROM items WHERE text = 'sample-word-1'`,
    ).first<{ translation: string }>();
    expect(item?.translation).not.toContain('מילה-חדשה');
  });
});

describe('slugToName', () => {
  it('turns a slug into Title Case words', () => {
    expect(slugToName('electronics-devices')).toBe('Electronics Devices');
    expect(slugToName('home')).toBe('Home');
  });
});
