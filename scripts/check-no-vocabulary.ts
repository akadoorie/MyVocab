/**
 * CI guard: fails if the public repo contains (or is about to contain) vocabulary, DB dumps or
 * exports (PRD §8.5). Checks tracked files plus untracked files that are not git-ignored.
 *
 *   pnpm check:no-vocabulary
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { findViolations, type RepoFile } from './no-vocabulary-rules';

function listRepoFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      encoding: 'utf8',
    },
  );
  return out.split('\0').filter(Boolean);
}

function main(): void {
  const files: RepoFile[] = listRepoFiles().map((path) => {
    if (!/\.csv$/i.test(path)) return { path };
    try {
      return { path, content: readFileSync(path, 'utf8') };
    } catch {
      return { path }; // deleted in the working tree but still tracked
    }
  });

  const violations = findViolations(files);
  if (violations.length === 0) {
    console.log(`check:no-vocabulary: OK (${files.length} files checked)`);
    return;
  }
  console.error('check:no-vocabulary: FAILED. These files must not be in the public repo:');
  for (const v of violations) console.error(`  - ${v.path}: ${v.reason}`);
  console.error('Real vocabulary belongs only in the private MyVocab-Content repo (PRD §8.5).');
  process.exitCode = 1;
}

main();
