/**
 * Rules for the `check:no-vocabulary` guard (PRD §8.5, §14.2): the public repo must never contain
 * real vocabulary, database dumps or exports. Pure functions, unit-tested.
 */

export const MAX_ALLOWED_CSV_ROWS = 20;

export type RepoFile = { path: string; content?: string };
export type Violation = { path: string; reason: string };

/** Files that may exist even though their extension is normally blocked. */
const ALLOWED: ReadonlyArray<{ pattern: RegExp; note: string }> = [
  { pattern: /^seed\/sample\.csv$/, note: 'synthetic sample (max 20 rows)' },
  { pattern: /^apps\/api\/migrations\/[^/]+\.sql$/, note: 'schema migrations (no content)' },
  { pattern: /(^|\/)fixtures\/[^/]+\.csv$/, note: 'synthetic test fixtures (max 20 rows)' },
];

/** Extensions and names that indicate vocabulary, a DB dump or an export. */
const BLOCKED: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\.csv$/i, reason: 'CSV files may contain vocabulary' },
  { pattern: /\.tsv$/i, reason: 'TSV files may contain vocabulary' },
  { pattern: /\.sql$/i, reason: 'SQL files may be database dumps' },
  { pattern: /\.(sqlite3?|db|db3|d1)$/i, reason: 'database files are not allowed' },
  { pattern: /\.(xlsx?|ods)$/i, reason: 'spreadsheets may contain vocabulary' },
  { pattern: /\.export\./i, reason: 'export artifacts are not allowed' },
  { pattern: /(^|\/)exports\//i, reason: 'the exports/ folder is local only' },
  { pattern: /(^|\/)content\//i, reason: 'the content/ folder is local only' },
  { pattern: /myvocab-export-/i, reason: 'export artifacts are not allowed' },
  { pattern: /\.zip$/i, reason: 'archives may contain exports' },
];

const BOM = String.fromCharCode(0xfeff);

const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

/** Counts CSV data rows (excluding the header), honoring quoted newlines. */
export function countCsvDataRows(content: string): number {
  let rows = 0;
  let inQuotes = false;
  let rowHasContent = false;
  const text = content.startsWith(BOM) ? content.slice(1) : content;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      rowHasContent = true;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (rowHasContent) rows++;
      rowHasContent = false;
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else if (ch !== ' ' && ch !== '\t') {
      rowHasContent = true;
    }
  }
  if (rowHasContent) rows++;
  return Math.max(0, rows - 1);
}

export function findViolations(files: readonly RepoFile[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const path = normalizePath(file.path);
    const allowed = ALLOWED.find((a) => a.pattern.test(path));
    if (allowed) {
      if (/\.csv$/i.test(path) && file.content !== undefined) {
        const rows = countCsvDataRows(file.content);
        if (rows > MAX_ALLOWED_CSV_ROWS) {
          violations.push({
            path,
            reason: `${rows} data rows; allow-listed CSVs may have at most ${MAX_ALLOWED_CSV_ROWS}`,
          });
        }
      }
      continue;
    }
    const blocked = BLOCKED.find((b) => b.pattern.test(path));
    if (blocked) violations.push({ path, reason: blocked.reason });
  }
  return violations;
}
