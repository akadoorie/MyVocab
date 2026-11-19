import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import {
  applyRow,
  describeChanges,
  parseTranslationUpdateCsv,
  textMatches,
} from './lib/translation-update';
import { apiDir, localPersistFor, repoRoot, writeConfigCopy } from './lib/wrangler-config';

/** `pnpm db:update-translations` (D-024): the CSV planning, then a run on a throw-away local D1. */

const shell = process.platform === 'win32';
const temp = mkdtempSync(path.join(tmpdir(), 'myvocab-translations-'));

describe('translation update CSV', () => {
  const csv = `id,text,translation_parallel_he,translation_meaning_he,translation_literal_he
7,Sample,מקבילה-1,משמעות-1|משמעות-2,
8,,,,מילולי-1`;

  it('reads ids and the lists named in the file; an empty cell clears that list', () => {
    const { rows, errors } = parseTranslationUpdateCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({
      row: 2,
      id: 7,
      text: 'Sample',
      lists: {
        parallel: { he: ['מקבילה-1'] },
        meaning: { he: ['משמעות-1', 'משמעות-2'] },
        literal: { he: [] },
      },
    });
    expect(rows[1]?.text).toBeUndefined();
  });

  it('accepts the old column names, and rejects unknown columns, bad and repeated ids', () => {
    expect(parseTranslationUpdateCsv('id,translation_he,literal_he\n1,a,b').rows[0]?.lists).toEqual(
      { meaning: { he: ['a'] }, literal: { he: ['b'] } }, // translation_<code> = the meaning (D-025)
    );
    expect(parseTranslationUpdateCsv('text\nx').errors).toEqual(['Missing required column "id"']);
    expect(parseTranslationUpdateCsv('id,colour\n1,x').errors).toEqual([
      'Unknown column "colour"',
      'No translation columns in the file',
    ]);
    expect(parseTranslationUpdateCsv('id,translation_he\nx,a\n2,b\n2,c').errors).toEqual([
      'row 2: invalid id "x"',
      'row 4: item 2 appears more than once',
    ]);
  });

  it('changes only the named lists, and describes each change', () => {
    const before = {
      parallel: { he: ['משמעות-1', 'מקבילה-1'], en: ['other'] },
      meaning: {},
      literal: { he: ['מקבילה-1'] },
    };
    const { rows } = parseTranslationUpdateCsv(csv);
    const after = applyRow(before, rows[0]!);
    expect(after).toEqual({
      parallel: { he: ['מקבילה-1'], en: ['other'] },
      meaning: { he: ['משמעות-1', 'משמעות-2'] },
      literal: {},
    });
    expect(describeChanges(before, after)).toEqual([
      'meaning.he: (empty) → משמעות-1 | משמעות-2',
      'parallel.he: משמעות-1 | מקבילה-1 → מקבילה-1',
      'literal.he: מקבילה-1 → (empty)',
    ]);
    expect(describeChanges(after, after)).toEqual([]);
  });

  it('checks the optional text against the item', () => {
    const { rows } = parseTranslationUpdateCsv(csv);
    expect(textMatches(rows[0]!, ' sample ')).toBe(true);
    expect(textMatches(rows[0]!, 'Other')).toBe(false);
    expect(textMatches(rows[1]!, 'anything')).toBe(true);
  });
});

describe('pnpm db:update-translations (local)', () => {
  const config = writeConfigCopy({ remote: false, dir: path.join(temp, 'db') });
  const run = (...args: string[]) =>
    spawnSync(
      'pnpm',
      ['exec', 'tsx', 'scripts/update-translations.ts', '--config', config, ...args],
      {
        cwd: apiDir,
        stdio: 'pipe',
        shell,
        encoding: 'utf8',
      },
    );
  const item = async (text: string) => {
    const proxy = await getPlatformProxy<Env>({
      configPath: config,
      persist: localPersistFor(config),
    });
    try {
      return await proxy.env.DB.prepare(
        `SELECT id, version, translation_parallel AS p, translation_meaning AS m,
                translation_literal AS l FROM items WHERE text = ?`,
      )
        .bind(text)
        .first<{ id: number; version: number; p: string; m: string; l: string }>();
    } finally {
      await proxy.dispose();
    }
  };

  beforeAll(() => {
    const seed = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        'scripts/seed.ts',
        '--config',
        config,
        '--file',
        path.join(repoRoot, 'seed', 'sample.csv'),
      ],
      { cwd: apiDir, stdio: 'pipe', shell, encoding: 'utf8' },
    );
    if (seed.status !== 0) throw new Error(`seed failed: ${seed.stdout}\n${seed.stderr}`);
  });

  afterAll(() => {
    rmSync(temp, { recursive: true, force: true });
  });

  it('prints the change on a dry run, then moves the lists through the admin service', async () => {
    const before = await item('sample-expression-1');
    const file = path.join(temp, 'update.csv');
    writeFileSync(
      file,
      `id,text,translation_parallel_he,translation_meaning_he,translation_literal_he
${before!.id},sample-expression-1,ביטוי-לדוגמה-1,משמעות-לדוגמה,מילולי-לדוגמה`,
    );

    const dry = run('--file', file, '--dry-run');
    expect(dry.status, dry.stderr).toBe(0);
    expect(dry.stdout).toContain('meaning.he: ביטוי-לדוגמה-1 → משמעות-לדוגמה');
    expect(dry.stdout).toContain('parallel.he: (empty) → ביטוי-לדוגמה-1');
    expect(dry.stdout).toContain('1 item(s) to change');
    expect((await item('sample-expression-1'))?.version).toBe(before!.version);

    const real = run('--file', file);
    expect(real.status, real.stderr).toBe(0);
    expect(real.stdout).toContain('Changed 1 of 1 item(s) in the local database.');
    const after = await item('sample-expression-1');
    expect(after).toMatchObject({
      version: before!.version + 1,
      p: '{"he":["ביטוי-לדוגמה-1"]}',
      m: '{"he":["משמעות-לדוגמה"]}',
      l: '{"he":["מילולי-לדוגמה"]}',
    });
  });

  it('changes nothing when an id names a different item', async () => {
    const other = await item('sample-expression-2');
    const file = path.join(temp, 'wrong.csv');
    writeFileSync(file, `id,text,translation_meaning_he\n${other!.id},sample-expression-1,x`);
    const res = run('--file', file);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('is "sample-expression-2", not "sample-expression-1"');
    expect((await item('sample-expression-2'))?.version).toBe(other!.version);
  });
});
