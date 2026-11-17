/**
 * pnpm db:export [--local] [--content-only] [--out <path>]   (PRD §8.6)
 *
 * Runs on the owner's computer only (never in CI, never behind an HTTP endpoint).
 * - Full export (production by default, `--local` for the development database) into
 *   exports/myvocab-export-<YYYY-MM-DD-HHmm>/ (git-ignored) plus a .zip of it:
 *   README.md, manifest.json, sqlite/schema.sql + data.sql, json/<table>.json, csv/vocabulary.csv.
 *   It contains personal data: the command warns and never writes into the content repository.
 * - `--content-only`: only the vocabulary CSV, by default to
 *   $CONTENT_DIR/snapshots/vocabulary-<YYYY-MM-DD>.csv (CONTENT_DIR defaults to ../MyVocab-Content).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { APP_VERSION } from '../src/version';
import {
  countRows,
  exportReadme,
  listTables,
  readTable,
  schemaVersion,
  vocabularyCsv,
} from './lib/export-data';
import { apiDir, DB_NAME, localPersistFor, repoRoot, writeConfigCopy } from './lib/wrangler-config';
import { zip } from './lib/zip';

const invokedFrom = process.env.INIT_CWD ?? process.cwd();

export type ExportArgs = {
  local: boolean;
  contentOnly: boolean;
  out: string | undefined;
  /** Tests: a wrangler config whose local state is a throw-away database. */
  config: string | undefined;
};

export function parseArgs(argv: string[]): ExportArgs {
  const args: ExportArgs = { local: false, contentOnly: false, out: undefined, config: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--local') args.local = true;
    else if (a === '--content-only') args.contentOnly = true;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--') continue;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.config && !args.local) throw new Error('--config is only for local exports');
  return args;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function configPath(args: ExportArgs): string {
  if (args.config) return path.resolve(invokedFrom, args.config);
  return args.local
    ? path.join(apiDir, 'wrangler.jsonc')
    : writeConfigCopy({ remote: true, name: 'wrangler.export-remote.json' });
}

function wranglerExport(args: ExportArgs, output: string, part: '--no-data' | '--no-schema') {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'export',
      DB_NAME,
      args.local ? '--local' : '--remote',
      '--output',
      output,
      part,
      '--skip-confirmation',
      ...(args.config ? ['--config', path.resolve(invokedFrom, args.config)] : []),
    ],
    { cwd: apiDir, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (result.status !== 0) throw new Error(`wrangler d1 export ${part} failed`);
}

function filesUnder(dir: string, base = dir): { name: string; data: Uint8Array }[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return filesUnder(full, base);
    return [{ name: path.relative(base, full), data: readFileSync(full) }];
  });
}

export async function runExport(args: ExportArgs, now = new Date()): Promise<string> {
  const proxy = await getPlatformProxy<Env>({
    configPath: configPath(args),
    remoteBindings: !args.local,
    ...(args.config ? { persist: localPersistFor(path.resolve(invokedFrom, args.config)) } : {}),
  });
  try {
    const d1 = proxy.env.DB;

    if (args.contentOnly) {
      const contentDir = path.resolve(repoRoot, process.env.CONTENT_DIR ?? '../MyVocab-Content');
      const out = args.out
        ? path.resolve(invokedFrom, args.out)
        : path.join(contentDir, 'snapshots', `vocabulary-${dateStamp(now)}.csv`);
      const { csv, items } = await vocabularyCsv(d1);
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, csv);
      console.log(`Vocabulary snapshot: ${items} items → ${out}`);
      return out;
    }

    const stamp = `${dateStamp(now)}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const dir = args.out
      ? path.resolve(invokedFrom, args.out)
      : path.join(repoRoot, 'exports', `myvocab-export-${stamp}`);
    const contentDir = path.resolve(repoRoot, process.env.CONTENT_DIR ?? '../MyVocab-Content');
    if (path.resolve(dir).startsWith(path.resolve(contentDir) + path.sep)) {
      throw new Error(
        'A full export contains personal data: never write it into the content repository.',
      );
    }
    for (const sub of ['sqlite', 'json', 'csv'])
      mkdirSync(path.join(dir, sub), { recursive: true });

    console.warn(
      '⚠️  A full export contains PERSONAL DATA (user emails, names, sessions). Keep it private and never commit it.',
    );

    const tables = await listTables(d1);
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const rows = await readTable(d1, table);
      counts[table] = await countRows(d1, table);
      writeFileSync(path.join(dir, 'json', `${table}.json`), `${JSON.stringify(rows, null, 2)}\n`);
    }
    writeFileSync(path.join(dir, 'csv', 'vocabulary.csv'), (await vocabularyCsv(d1)).csv);

    const meta = {
      exportedAt: now.toISOString(),
      appVersion: APP_VERSION,
      schemaVersion: await schemaVersion(d1),
      source: args.local ? 'local' : 'production',
      tables: counts,
    };
    writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(meta, null, 2)}\n`);
    writeFileSync(path.join(dir, 'README.md'), await exportReadme(d1, tables, meta));

    await proxy.dispose();
    wranglerExport(args, path.join(dir, 'sqlite', 'schema.sql'), '--no-data');
    wranglerExport(args, path.join(dir, 'sqlite', 'data.sql'), '--no-schema');

    writeFileSync(`${dir}.zip`, zip(filesUnder(dir), now));
    console.log(`Full export → ${dir} (+ ${path.basename(dir)}.zip)`);
    return dir;
  } finally {
    await proxy.dispose().catch(() => undefined);
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('scripts', 'export.ts'));
if (isMain) {
  runExport(parseArgs(process.argv.slice(2))).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
