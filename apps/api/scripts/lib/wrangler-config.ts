import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const repoRoot = path.resolve(apiDir, '..', '..');
export const DB_NAME = 'myvocab-prod';

type WranglerConfig = Record<string, unknown> & {
  main: string;
  assets: { directory: string };
  d1_databases: Array<Record<string, unknown>>;
};

/**
 * A copy of `wrangler.jsonc` with absolute paths, written to `dir`. With `remote`, the D1 binding
 * targets the production database (the owner's `wrangler login`). Local state of a copy lives in
 * `<dir>/.wrangler/state`, which lets tests use a throw-away database.
 */
export function writeConfigCopy(options: { remote: boolean; dir?: string; name?: string }): string {
  const source = readFileSync(path.join(apiDir, 'wrangler.jsonc'), 'utf8');
  const json = source.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
  const config = JSON.parse(json) as WranglerConfig;
  config.main = path.join(apiDir, config.main);
  config.assets.directory = path.join(apiDir, config.assets.directory);
  config.d1_databases = config.d1_databases.map((d) => ({
    ...d,
    ...(options.remote ? { remote: true } : {}),
    migrations_dir: path.join(apiDir, 'migrations'),
  }));
  delete config.$schema;
  const dir = options.dir ?? path.join(apiDir, '.wrangler', 'tmp');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, options.name ?? 'wrangler.json');
  writeFileSync(out, JSON.stringify(config, null, 2));
  return out;
}
