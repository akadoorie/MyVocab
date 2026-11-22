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

const quoteForShell = (arg) => (shell ? `"${arg}"` : arg);

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
// Every spec, on both projects, starts guest sessions from the same local IP: raise the hourly
// guest limit (default 10) so they don't run into it. The limit itself is covered by API tests.
run(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'execute',
    'myvocab-prod',
    '--local',
    '--persist-to',
    persistTo,
    '--command',
    // With a shell (Windows) the SQL needs quotes to stay one argument; without one (CI) it must not.
    quoteForShell(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('guests.practicesPerHour', '100', ${Date.now()})`,
    ),
  ],
  apiDir,
);

// Everything the Worker needs, so CI (which has no .dev.vars) runs the same as a local machine.
// Test values only; Turnstile uses Cloudflare's always-pass test keys.
const vars = {
  ENVIRONMENT: 'test',
  APP_URL: `http://localhost:${PORT}`,
  TURNSTILE_SITE_KEY: '1x00000000000000000000BB',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  USAGE_HASH_SECRET: 'e2e-usage-hash-secret-0123456789',
  BETTER_AUTH_SECRET: 'e2e-better-auth-secret-0123456789abcdef',
  GOOGLE_CLIENT_ID: 'e2e-client-id',
  GOOGLE_CLIENT_SECRET: 'e2e-client-secret',
  ADMIN_EMAILS: 'owner@example.test',
  CF_ACCESS_TEAM_DOMAIN: '',
  CF_ACCESS_AUD: '',
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
