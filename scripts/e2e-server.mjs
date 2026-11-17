/**
 * Starts the app for Playwright (PRD §17): builds the SPA, creates a fresh local D1 with only the
 * synthetic seed/sample.csv (never real vocabulary), then runs `wrangler dev` on port 8788 with
 * test configuration.
 */
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps', 'api');
const persistTo = path.join(apiDir, '.wrangler', 'e2e-state');
const shell = process.platform === 'win32';
const PORT = process.env.E2E_PORT ?? '8788';

function run(cmd, args, cwd = root) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
}

run('pnpm', ['--filter', '@myvocab/web', 'build']);
rmSync(persistTo, { recursive: true, force: true });
run(
  'pnpm',
  [
    'exec',
    'tsx',
    'scripts/seed.ts',
    '--file',
    path.join(root, 'seed', 'sample.csv'),
    '--persist-to',
    persistTo,
  ],
  apiDir,
);

const vars = {
  ENVIRONMENT: 'test',
  APP_URL: `http://localhost:${PORT}`,
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  USAGE_HASH_SECRET: 'e2e-usage-hash-secret-0123456789',
};
const child = spawn(
  'pnpm',
  [
    'exec',
    'wrangler',
    'dev',
    '--port',
    PORT,
    '--persist-to',
    persistTo,
    ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`]),
  ],
  { cwd: apiDir, stdio: 'inherit', shell },
);
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
