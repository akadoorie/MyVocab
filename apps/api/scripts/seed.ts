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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { createContainer } from '../src/container';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(apiDir, '..', '..');
const invokedFrom = process.env.INIT_CWD ?? process.cwd();

function parseArgs(argv: string[]) {
  const args = { file: undefined as string | undefined, remote: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remote') args.remote = true;
    else if (a === '--file') args.file = argv[++i];
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

/** A copy of wrangler.jsonc with `remote: true` on the D1 binding and absolute paths. */
function remoteConfig(): string {
  const source = readFileSync(path.join(apiDir, 'wrangler.jsonc'), 'utf8');
  const json = source.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
  const config = JSON.parse(json) as Record<string, unknown> & {
    main: string;
    assets: { directory: string };
    d1_databases: Array<Record<string, unknown>>;
  };
  config.main = path.join(apiDir, config.main);
  config.assets.directory = path.join(apiDir, config.assets.directory);
  config.d1_databases = config.d1_databases.map((d) => ({
    ...d,
    remote: true,
    migrations_dir: path.join(apiDir, 'migrations'),
  }));
  delete config.$schema;
  const dir = path.join(apiDir, '.wrangler', 'tmp');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'wrangler.seed-remote.json');
  writeFileSync(out, JSON.stringify(config, null, 2));
  return out;
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
    const migrate = spawnSync(
      'pnpm',
      ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'myvocab-prod', '--local'],
      {
        cwd: apiDir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      },
    );
    if (migrate.status !== 0) throw new Error('Applying local migrations failed');
  }

  const proxy = await getPlatformProxy<Env>({
    configPath: args.remote ? remoteConfig() : path.join(apiDir, 'wrangler.jsonc'),
    remoteBindings: args.remote,
  });
  try {
    const report = await createContainer(proxy.env.DB).csvImport.run({
      csvText: readFileSync(csvPath, 'utf8'),
      fileName: path.basename(csvPath),
      dryRun: false,
      createMissingCategories: true,
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
