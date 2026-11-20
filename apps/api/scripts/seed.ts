/**
 * pnpm db:seed [--file <path>] [--remote]   (PRD §8.5)
 *
 * Imports a CSV through the same CsvImportService as the admin upload (append-only, no size
 * limits). Without --file it uses $CONTENT_DIR/starter.csv (default ../MyVocab-Content), or the
 * synthetic seed/sample.csv when the private content folder isn't there.
 *
 * Local D1 by default (the same database `wrangler dev` uses). --remote targets production through
 * the owner's `wrangler login` and asks for a typed confirmation. Never run in CI.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { getPlatformProxy } from 'wrangler';
import { createContainer } from '../src/container';
import { apiDir, DB_NAME, localPersistFor, repoRoot, writeConfigCopy } from './lib/wrangler-config';

const invokedFrom = process.env.INIT_CWD ?? process.cwd();

function parseArgs(argv: string[]) {
  const args = {
    file: undefined as string | undefined,
    remote: false,
    persistTo: undefined as string | undefined,
    /** Tests: a wrangler config copy whose local state is a throw-away database. */
    config: undefined as string | undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remote') args.remote = true;
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--persist-to') args.persistTo = argv[++i];
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--') continue;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function resolveCsv(file: string | undefined): string {
  if (file) return path.resolve(invokedFrom, file);
  const contentDir = path.resolve(repoRoot, process.env.CONTENT_DIR ?? '../MyVocab-Content');
  const starter = path.join(contentDir, 'starter.csv');
  if (existsSync(starter)) return starter;
  console.log(`No ${starter}; using the synthetic seed/sample.csv instead.`);
  return path.join(repoRoot, 'seed', 'sample.csv');
}

async function confirmRemote(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    'This writes to the PRODUCTION database. Type "SEED PRODUCTION" to continue: ',
  );
  rl.close();
  return answer.trim() === 'SEED PRODUCTION';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = resolveCsv(args.file);
  if (!existsSync(csvPath)) throw new Error(`File not found: ${csvPath}`);

  if (args.remote) {
    if (!(await confirmRemote())) {
      console.log('Cancelled.');
      return;
    }
  } else {
    const persist = args.persistTo
      ? ['--persist-to', path.resolve(invokedFrom, args.persistTo)]
      : [];
    const config = args.config ? ['--config', path.resolve(invokedFrom, args.config)] : [];
    const migrate = spawnSync(
      'pnpm',
      ['exec', 'wrangler', 'd1', 'migrations', 'apply', DB_NAME, '--local', ...persist, ...config],
      {
        cwd: apiDir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      },
    );
    if (migrate.status !== 0) throw new Error('Applying local migrations failed');
  }

  const proxy = await getPlatformProxy<Env>({
    configPath: args.remote
      ? writeConfigCopy({ remote: true, name: 'wrangler.seed-remote.json' })
      : args.config
        ? path.resolve(invokedFrom, args.config)
        : path.join(apiDir, 'wrangler.jsonc'),
    remoteBindings: args.remote,
    ...(args.persistTo && !args.remote
      ? { persist: { path: path.join(path.resolve(invokedFrom, args.persistTo), 'v3') } }
      : args.config && !args.remote
        ? { persist: localPersistFor(path.resolve(invokedFrom, args.config)) }
        : {}),
  });
  try {
    const report = await createContainer(proxy.env.DB).csvImport.run({
      csvText: readFileSync(csvPath, 'utf8'),
      fileName: path.basename(csvPath),
      dryRun: false,
      createMissingTopics: true,
      actor: null,
      limits: null,
    });
    console.log(
      `Seed source: ${path.basename(csvPath)} → ${args.remote ? 'PRODUCTION' : 'local'} D1`,
    );
    if (report.errors.length > 0) {
      console.error(`Not imported: ${report.errors.length} error(s). Fix the file and run again:`);
      for (const e of report.errors)
        console.error(`  row ${e.row}${e.column ? `, ${e.column}` : ''}: ${e.message}`);
      process.exitCode = 1;
      return;
    }
    console.log('Imported:', report.totals);
    if (report.warnings.length > 0)
      console.log(`Warnings: ${report.warnings.length} (check them in the admin import dry run)`);
  } finally {
    await proxy.dispose();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
