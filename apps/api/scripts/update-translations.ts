/**
 * pnpm db:update-translations --file <csv> [--dry-run] [--remote]   (D-024)
 *
 * Moves translations between the three kinds (parallel, meaning, literal) on existing items, from
 * a reviewed CSV of item ids (format in ./lib/translation-update.ts). Unlike an import, it
 * replaces the lists named in the file. Each change goes through the same service as an edit in
 * Admin: validation, the item's version check, and an audit entry.
 *
 * Prints the before/after of every changed item first. Local D1 by default; --remote targets
 * production through the owner's `wrangler login` and asks for a typed confirmation. --dry-run
 * only prints. Never run in CI.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { getPlatformProxy } from 'wrangler';
import { createContainer } from '../src/container';
import {
  applyRow,
  describeChanges,
  parseTranslationUpdateCsv,
  textMatches,
  type TranslationLists,
} from './lib/translation-update';
import { apiDir, DB_NAME, localPersistFor, writeConfigCopy } from './lib/wrangler-config';

const invokedFrom = process.env.INIT_CWD ?? process.cwd();

function parseArgs(argv: string[]) {
  const args = {
    file: undefined as string | undefined,
    remote: false,
    dryRun: false,
    /** Tests: a wrangler config copy whose local state is a throw-away database. */
    config: undefined as string | undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remote') args.remote = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--') continue;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

async function confirmRemote(count: number): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `This changes ${count} item(s) in the PRODUCTION database. Type "UPDATE PRODUCTION" to continue: `,
  );
  rl.close();
  return answer.trim() === 'UPDATE PRODUCTION';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file)
    throw new Error('Usage: pnpm db:update-translations --file <csv> [--dry-run] [--remote]');
  const csvPath = path.resolve(invokedFrom, args.file);
  if (!existsSync(csvPath)) throw new Error(`File not found: ${csvPath}`);
  const parsed = parseTranslationUpdateCsv(readFileSync(csvPath, 'utf8'));
  if (parsed.errors.length > 0) {
    console.error('The file has errors; nothing was changed:');
    for (const e of parsed.errors) console.error(`  ${e}`);
    process.exitCode = 1;
    return;
  }

  if (!args.remote) {
    const config = args.config ? ['--config', path.resolve(invokedFrom, args.config)] : [];
    const migrate = spawnSync(
      'pnpm',
      ['exec', 'wrangler', 'd1', 'migrations', 'apply', DB_NAME, '--local', ...config],
      { cwd: apiDir, stdio: 'inherit', shell: process.platform === 'win32' },
    );
    if (migrate.status !== 0) throw new Error('Applying local migrations failed');
  }

  const proxy = await getPlatformProxy<Env>({
    configPath: args.remote
      ? writeConfigCopy({ remote: true, name: 'wrangler.update-remote.json' })
      : args.config
        ? path.resolve(invokedFrom, args.config)
        : path.join(apiDir, 'wrangler.jsonc'),
    remoteBindings: args.remote,
    ...(args.config && !args.remote
      ? { persist: localPersistFor(path.resolve(invokedFrom, args.config)) }
      : {}),
  });
  try {
    const items = createContainer(proxy.env.DB).admin.items;
    const target = args.remote ? 'PRODUCTION' : 'local';
    const changes: { id: number; version: number; text: string; next: TranslationLists }[] = [];
    let problems = 0;
    for (const row of parsed.rows) {
      const item = await items.get(row.id).catch(() => null);
      if (!item) {
        console.error(`row ${row.row}: item ${row.id} not found (or in Trash)`);
        problems++;
        continue;
      }
      if (!textMatches(row, item.text)) {
        console.error(`row ${row.row}: item ${row.id} is "${item.text}", not "${row.text}"`);
        problems++;
        continue;
      }
      const before: TranslationLists = {
        parallel: item.parallel,
        meaning: item.meaning,
        literal: item.literal,
      };
      const next = applyRow(before, row);
      const lines = describeChanges(before, next);
      if (lines.length === 0) continue;
      console.log(`\n#${item.itemId}  ${item.text}`);
      for (const line of lines) console.log(`  ${line}`);
      changes.push({ id: item.itemId, version: item.version, text: item.text, next });
    }
    console.log(
      `\n${changes.length} item(s) to change, ${parsed.rows.length - changes.length - problems} unchanged, ${problems} problem(s) → ${target} D1`,
    );
    if (problems > 0) {
      console.error('Fix the problems above first; nothing was changed.');
      process.exitCode = 1;
      return;
    }
    if (args.dryRun || changes.length === 0) return;
    if (args.remote && !(await confirmRemote(changes.length))) {
      console.log('Cancelled.');
      return;
    }

    let done = 0;
    for (const c of changes) {
      try {
        await items.update(c.id, { version: c.version, ...c.next }, null);
        done++;
      } catch (err) {
        const details = (err as { details?: { path?: string; message: string }[] }).details;
        console.error(
          `#${c.id} ${c.text}: not changed: ${err instanceof Error ? err.message : String(err)}`,
        );
        for (const issue of details ?? [])
          console.error(`    ${issue.path ?? ''} ${issue.message}`);
        process.exitCode = 1;
      }
    }
    console.log(`Changed ${done} of ${changes.length} item(s) in the ${target} database.`);
  } finally {
    await proxy.dispose();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
