/**
 * Writes apps/web/public/third-party-licenses.txt from the installed production dependencies
 * (`pnpm licenses`), or with --check fails when that file is out of date (CI).
 *
 *   pnpm licenses:update   regenerate after adding, removing or upgrading a dependency
 *   pnpm licenses:check    CI: the file matches the dependencies
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderLicenses, type LicensedPackage } from './third-party-licenses-render';

const OUT = 'apps/web/public/third-party-licenses.txt';

type PnpmEntry = {
  name: string;
  versions: string[];
  paths: string[];
  license: string;
  homepage?: string;
};

/** The licence and NOTICE files a package ships, joined. */
function licenseText(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => /^(licen[cs]e|copying|notice|ofl)([.-].*)?$/i.test(f))
    .sort((a, b) => Number(/^notice/i.test(a)) - Number(/^notice/i.test(b)) || a.localeCompare(b));
  const texts = files.map((f) => readFileSync(join(dir, f), 'utf8').trim()).filter(Boolean);
  return texts.length ? texts.join('\n\n') : null;
}

function collect(): LicensedPackage[] {
  const json = execSync('pnpm licenses list --prod --json -r', {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const byLicense = JSON.parse(json) as Record<string, PnpmEntry[]>;
  const out: LicensedPackage[] = [];
  for (const entries of Object.values(byLicense))
    for (const e of entries)
      e.versions.forEach((version, i) =>
        out.push({
          name: e.name,
          version,
          license: e.license,
          ...(e.homepage ? { homepage: e.homepage } : {}),
          text: licenseText(e.paths[i] ?? e.paths[0] ?? ''),
        }),
      );
  return out;
}

const next = renderLicenses(collect());
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== next) {
    console.error(`${OUT} is out of date: run "pnpm licenses:update" and commit it.`);
    process.exit(1);
  }
  console.log('licenses:check: OK');
} else {
  writeFileSync(OUT, next);
  console.log(`Wrote ${OUT}`);
}
