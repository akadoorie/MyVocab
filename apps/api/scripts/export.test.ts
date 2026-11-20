import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { runExport } from './export';
import { apiDir, DB_NAME, localPersistFor, repoRoot, writeConfigCopy } from './lib/wrangler-config';

/**
 * PRD §17 "Scripts": export round-trip and full-export checks, each against a throw-away local
 * D1 (a wrangler config copy whose local state lives in a temp folder). Synthetic data only.
 */

const shell = process.platform === 'win32';
const temp = mkdtempSync(path.join(tmpdir(), 'myvocab-export-'));

function freshDb(name: string): string {
  return writeConfigCopy({ remote: false, dir: path.join(temp, name) });
}

function seed(config: string, file: string) {
  const res = spawnSync(
    'pnpm',
    ['exec', 'tsx', 'scripts/seed.ts', '--config', config, '--file', file],
    {
      cwd: apiDir,
      stdio: 'pipe',
      shell,
      encoding: 'utf8',
    },
  );
  if (res.status !== 0) throw new Error(`seed failed: ${res.stdout}\n${res.stderr}`);
}

async function withDb<T>(config: string, fn: (d1: D1Database) => Promise<T>): Promise<T> {
  const proxy = await getPlatformProxy<Env>({
    configPath: config,
    persist: localPersistFor(config),
  });
  try {
    return await fn(proxy.env.DB);
  } finally {
    await proxy.dispose();
  }
}

/** All vocabulary content, comparable across databases (ids differ). */
function content(d1: D1Database) {
  return d1
    .prepare(
      `SELECT i.lang, i.text, i.type, i.multiple_meanings, i.translation_parallel,
              i.translation_meaning, i.translation_literal, i.explanation,
              i.synonyms, i.hints, i.status,
              (SELECT group_concat(slug, '|') FROM (SELECT c.slug FROM item_topics ic
                 JOIN topics c ON c.id = ic.topic_id WHERE ic.item_id = i.id ORDER BY c.slug))
                AS topics
       FROM items i WHERE i.deleted_at IS NULL ORDER BY i.lang, i.normalized_text, i.type`,
    )
    .all()
    .then((r) => r.results);
}

const source = freshDb('source');

beforeAll(() => {
  seed(source, path.join(repoRoot, 'seed', 'sample.csv'));
});

afterAll(() => {
  rmSync(temp, { recursive: true, force: true });
});

describe('pnpm db:export', () => {
  it('round-trip: export --content-only, import into an empty database, identical content', async () => {
    const out = path.join(temp, 'vocabulary.csv');
    await runExport({ local: true, contentOnly: true, out, config: source });
    const csv = readFileSync(out);
    expect([...csv.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM for Excel

    const target = freshDb('target');
    seed(target, out);
    const [a, b] = [await withDb(source, content), await withDb(target, content)];
    // Only the synthetic sample: proves the throw-away databases were used, not apps/api/.wrangler.
    expect(a.length).toBe(13);
    expect(a.every((row) => /sample|לדוגמה|טיוטה/.test(String(row.text)))).toBe(true);
    expect(b).toEqual(a);
  });

  it('full export: manifest counts, JSON per table, CSV, zip, and a schema that recreates the database', async () => {
    const dir = path.join(temp, 'full');
    await runExport({ local: true, contentOnly: false, out: dir, config: source });
    for (const file of [
      'README.md',
      'manifest.json',
      'sqlite/schema.sql',
      'sqlite/data.sql',
      'csv/vocabulary.csv',
      'json/items.json',
      'json/user.json',
      'json/audit_log.json',
    ]) {
      expect(existsSync(path.join(dir, file)), file).toBe(true);
    }

    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as {
      source: string;
      schemaVersion: string;
      tables: Record<string, number>;
    };
    expect(manifest.source).toBe('local');
    expect(manifest.schemaVersion).toMatch(/^0\d{3}_/);
    const counts = await withDb(source, async (d1) => {
      const out: Record<string, number> = {};
      for (const table of Object.keys(manifest.tables)) {
        out[table] = (await d1
          .prepare(`SELECT COUNT(*) AS n FROM "${table}"`)
          .first<{ n: number }>())!.n;
      }
      return out;
    });
    expect(manifest.tables).toEqual(counts);
    expect(manifest.tables.items).toBeGreaterThan(0);

    const items = JSON.parse(readFileSync(path.join(dir, 'json', 'items.json'), 'utf8')) as {
      translation_parallel: unknown;
      translation_meaning: unknown;
      explanation: unknown;
      created_at: number;
      created_at_iso: string;
    }[];
    expect(items).toHaveLength(manifest.tables.items!);
    expect(typeof items[0]!.translation_parallel).toBe('object');
    expect(typeof items[0]!.translation_meaning).toBe('object');
    expect(Array.isArray(items[0]!.explanation)).toBe(true);
    expect(items[0]!.created_at_iso).toBe(new Date(items[0]!.created_at).toISOString());
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toContain('personal data');

    // The zip holds every file of the folder.
    const zipped = readFileSync(`${dir}.zip`);
    expect(zipped.readUInt32LE(0)).toBe(0x04034b50);
    const end = zipped.length - 22;
    expect(zipped.readUInt32LE(end)).toBe(0x06054b50);
    expect(zipped.readUInt16LE(end + 10)).toBe(8 + Object.keys(manifest.tables).length - 3);

    // schema.sql recreates every table in a fresh database.
    const fresh = freshDb('fresh');
    const res = spawnSync(
      'pnpm',
      [
        'exec',
        'wrangler',
        'd1',
        'execute',
        DB_NAME,
        '--local',
        '--config',
        fresh,
        '--file',
        path.join(dir, 'sqlite', 'schema.sql'),
      ],
      { cwd: apiDir, stdio: 'pipe', shell, encoding: 'utf8' },
    );
    expect(res.status, res.stderr).toBe(0);
    const tables = await withDb(fresh, async (d1) =>
      (
        await d1
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'",
          )
          .all<{ name: string }>()
      ).results.map((r) => r.name),
    );
    for (const table of Object.keys(manifest.tables)) expect(tables).toContain(table);
  });

  it('refuses to write a full export into the content repository', async () => {
    const contentDir = path.resolve(repoRoot, process.env.CONTENT_DIR ?? '../MyVocab-Content');
    await expect(
      runExport({
        local: true,
        contentOnly: false,
        out: path.join(contentDir, 'oops'),
        config: source,
      }),
    ).rejects.toThrow(/personal data/);
  });
});
