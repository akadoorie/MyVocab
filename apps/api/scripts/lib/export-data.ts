import { serializeItemsCsv, type ExportItem, type ItemStatus, type ItemType } from '@myvocab/core';

/**
 * Builds the export files (PRD §8.6) from a D1 binding (local or remote, via getPlatformProxy).
 * Owner-run tooling only: it never runs in CI or behind an HTTP endpoint.
 */

/** Table names come from sqlite_master; only plain identifiers are ever interpolated. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Unexpected table or column name: ${name}`);
  return `"${name}"`;
}

/** Columns stored as JSON text, written as real JSON in `json/` (the §8.1 item shape). */
const JSON_COLUMNS: Record<string, readonly string[]> = {
  items: ['translation', 'literal', 'explanation', 'synonyms', 'hints'],
  app_settings: ['value'],
  audit_log: ['details'],
};

const PAGE = 2000;

export async function listTables(d1: D1Database): Promise<string[]> {
  const { results } = await d1
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'
       ORDER BY name`,
    )
    .all<{ name: string }>();
  return results.map((r) => r.name);
}

export async function countRows(d1: D1Database, table: string): Promise<number> {
  const row = await d1.prepare(`SELECT COUNT(*) AS n FROM ${ident(table)}`).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Every row of a table, JSON text columns parsed, ISO-8601 next to epoch-ms timestamps. */
export async function readTable(d1: D1Database, table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { results } = await d1
      .prepare(`SELECT * FROM ${ident(table)} ORDER BY rowid LIMIT ? OFFSET ?`)
      .bind(PAGE, offset)
      .all<Record<string, unknown>>()
      .catch(async () =>
        // WITHOUT ROWID tables have no rowid: order by their primary key (first column).
        d1
          .prepare(`SELECT * FROM ${ident(table)} ORDER BY 1, 2 LIMIT ? OFFSET ?`)
          .bind(PAGE, offset)
          .all<Record<string, unknown>>(),
      );
    for (const row of results) rows.push(transformRow(table, row));
    if (results.length < PAGE) break;
  }
  return rows;
}

function transformRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (JSON_COLUMNS[table]?.includes(key) && typeof value === 'string') {
      try {
        out[key] = JSON.parse(value);
      } catch {
        out[key] = value;
      }
    } else {
      out[key] = value;
    }
    if ((key.endsWith('_at') || key === 'ban_expires') && typeof value === 'number') {
      out[`${key}_iso`] = new Date(value).toISOString();
    }
  }
  return out;
}

type ColumnInfo = { name: string; type: string; notnull: number; pk: number; dflt_value: unknown };
type ForeignKey = { from: string; table: string; to: string; on_delete: string };

export async function describeTable(d1: D1Database, table: string) {
  const [columns, fks] = await Promise.all([
    d1.prepare(`PRAGMA table_info(${ident(table)})`).all<ColumnInfo>(),
    d1.prepare(`PRAGMA foreign_key_list(${ident(table)})`).all<ForeignKey>(),
  ]);
  return { columns: columns.results, foreignKeys: fks.results };
}

/** The live vocabulary (no Trash) in the import format, round-trip safe (PRD §8.3). */
export async function vocabularyCsv(d1: D1Database): Promise<{ csv: string; items: number }> {
  const [langs, rows] = await Promise.all([
    d1.prepare('SELECT code FROM languages ORDER BY sort_order, code').all<{ code: string }>(),
    d1
      .prepare(
        `SELECT i.lang, i.text, i.type, i.multiple_meanings, i.translation, i.literal,
                i.explanation, i.synonyms, i.hints, i.status,
                (SELECT json_group_array(slug) FROM (
                   SELECT c.slug FROM item_categories ic JOIN categories c ON c.id = ic.category_id
                   WHERE ic.item_id = i.id ORDER BY c.slug)) AS categories
         FROM items i WHERE i.deleted_at IS NULL ORDER BY i.id`,
      )
      .all<{
        lang: string;
        text: string;
        type: ItemType;
        multiple_meanings: number;
        translation: string;
        literal: string;
        explanation: string;
        synonyms: string;
        hints: string;
        status: ItemStatus;
        categories: string;
      }>(),
  ]);
  const items: ExportItem[] = rows.results.map((r) => ({
    content: {
      lang: r.lang,
      text: r.text,
      type: r.type,
      multipleMeanings: r.multiple_meanings === 1,
      translation: JSON.parse(r.translation) as Record<string, string[]>,
      literal: JSON.parse(r.literal) as Record<string, string[]>,
      explanation: JSON.parse(r.explanation) as string[],
      synonyms: JSON.parse(r.synonyms) as string[],
      hints: JSON.parse(r.hints) as string[],
    },
    categories: JSON.parse(r.categories) as string[],
    status: r.status,
  }));
  return {
    csv: serializeItemsCsv(
      items,
      langs.results.map((l) => l.code),
    ),
    items: items.length,
  };
}

export async function schemaVersion(d1: D1Database): Promise<string | null> {
  const row = await d1
    .prepare('SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1')
    .first<{ name: string }>()
    .catch(() => null);
  return row?.name ?? null;
}

const TABLE_NOTES: Record<string, string> = {
  languages: 'Languages (data-driven). `dir` is the text direction, `script` the ISO 15924 script.',
  categories: 'Topics. Items link to them through `item_categories`.',
  items:
    'One row per word or expression. `translation` and `literal` (word-for-word meaning) are objects `{ "<lang>": [entries] }`; `explanation`, `synonyms` and `hints` are arrays in the item language. `deleted_at` set = in Trash.',
  item_categories: 'Item ↔ category links (many-to-many).',
  user_known_items: 'Which user knows which item (hides it in every direction).',
  usage_counters: 'Anti-scraping counters (hashed IPs or user ids; never raw IPs). Kept 48 hours.',
  app_settings: 'Runtime settings (`value` is JSON).',
  audit_log: 'Append-only history of admin actions; `details` holds before/after and snapshots.',
  user: 'Accounts (Better Auth): Google sign-in identity, role and ban fields. Personal data.',
  session: 'Sign-in sessions (Better Auth). Personal data.',
  account: 'Linked Google accounts (Better Auth). No tokens are stored.',
  verification: 'Short-lived verification records (Better Auth).',
};

export async function exportReadme(
  d1: D1Database,
  tables: readonly string[],
  meta: { exportedAt: string; source: string; schemaVersion: string | null },
): Promise<string> {
  const lines: string[] = [
    '# MyVocab database export',
    '',
    `Exported ${meta.exportedAt} from the **${meta.source}** database (schema ${meta.schemaVersion ?? 'unknown'}).`,
    '',
    '> ⚠️ This export contains **personal data** (user emails, names, sessions). Keep it private. Never commit',
    '> it to a public repository. Only the content-only CSV (`pnpm db:export --content-only`) belongs in the',
    '> private content repository.',
    '',
    '## Files',
    '',
    '| Path | What it is |',
    '|---|---|',
    '| `manifest.json` | Export time, app version, schema version (last migration) and row counts per table |',
    '| `sqlite/schema.sql` | `CREATE TABLE` / `CREATE INDEX` statements (SQLite / D1 dialect) |',
    '| `sqlite/data.sql` | `INSERT` statements for every row (from `wrangler d1 export`) |',
    '| `json/<table>.json` | One file per table: an array of row objects. JSON columns are real JSON; every epoch-ms timestamp `x_at` has an ISO-8601 copy `x_at_iso` |',
    '| `csv/vocabulary.csv` | The live vocabulary (no Trash) in the MyVocab import format (UTF-8 with BOM) |',
    '',
    '## Load into SQLite or D1',
    '',
    '```sh',
    'sqlite3 myvocab.db < sqlite/schema.sql',
    'sqlite3 myvocab.db < sqlite/data.sql',
    '# or, into a D1 database:',
    'wrangler d1 execute <database> --remote --file sqlite/schema.sql',
    'wrangler d1 execute <database> --remote --file sqlite/data.sql',
    '```',
    '',
    '## Load into PostgreSQL (worked example)',
    '',
    'Create the tables you need (lists as `jsonb`), then load the JSON files with a short Node script:',
    '',
    '```sql',
    'CREATE TABLE languages (code text PRIMARY KEY, name text NOT NULL, native_name text NOT NULL,',
    '  dir text NOT NULL, script text NOT NULL, is_active boolean NOT NULL, sort_order int NOT NULL);',
    'CREATE TABLE categories (id int PRIMARY KEY, slug text UNIQUE NOT NULL, name text NOT NULL,',
    '  is_active boolean NOT NULL, sort_order int NOT NULL, created_at bigint, updated_at bigint);',
    'CREATE TABLE items (id int PRIMARY KEY, lang text NOT NULL REFERENCES languages(code), text text NOT NULL,',
    '  normalized_text text NOT NULL, type text NOT NULL, multiple_meanings boolean NOT NULL,',
    '  translation jsonb NOT NULL, literal jsonb NOT NULL, explanation jsonb NOT NULL, synonyms jsonb NOT NULL,',
    '  hints jsonb NOT NULL,',
    '  status text NOT NULL, version int NOT NULL, created_at bigint, updated_at bigint, deleted_at bigint);',
    'CREATE TABLE item_categories (item_id int REFERENCES items(id) ON DELETE CASCADE,',
    '  category_id int REFERENCES categories(id), PRIMARY KEY (item_id, category_id));',
    '```',
    '',
    '```js',
    '// load.mjs: npm install pg, then: DATABASE_URL=postgres://… node load.mjs',
    "import { readFileSync } from 'node:fs';",
    "import pg from 'pg';",
    'const db = new pg.Client({ connectionString: process.env.DATABASE_URL });',
    'await db.connect();',
    "const rows = (t) => JSON.parse(readFileSync(`json/${t}.json`, 'utf8'));",
    "for (const l of rows('languages'))",
    "  await db.query('INSERT INTO languages VALUES ($1,$2,$3,$4,$5,$6,$7)',",
    '    [l.code, l.name, l.native_name, l.dir, l.script, l.is_active === 1, l.sort_order]);',
    "for (const c of rows('categories'))",
    "  await db.query('INSERT INTO categories VALUES ($1,$2,$3,$4,$5,$6,$7)',",
    '    [c.id, c.slug, c.name, c.is_active === 1, c.sort_order, c.created_at, c.updated_at]);',
    "for (const i of rows('items'))",
    "  await db.query('INSERT INTO items VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)', [",
    '    i.id, i.lang, i.text, i.normalized_text, i.type, i.multiple_meanings === 1,',
    '    JSON.stringify(i.translation), JSON.stringify(i.literal), JSON.stringify(i.explanation),',
    '    JSON.stringify(i.synonyms), JSON.stringify(i.hints), i.status, i.version, i.created_at, i.updated_at, i.deleted_at]);',
    "for (const ic of rows('item_categories'))",
    "  await db.query('INSERT INTO item_categories VALUES ($1,$2)', [ic.item_id, ic.category_id]);",
    'await db.end();',
    '```',
    '',
    '## Tables',
    '',
  ];
  for (const table of tables) {
    const { columns, foreignKeys } = await describeTable(d1, table);
    lines.push(`### \`${table}\``, '');
    if (TABLE_NOTES[table]) lines.push(TABLE_NOTES[table], '');
    lines.push('| Column | Type | Null | Key | References |', '|---|---|---|---|---|');
    for (const c of columns) {
      const fk = foreignKeys.find((f) => f.from === c.name);
      lines.push(
        `| \`${c.name}\` | ${c.type || 'ANY'} | ${c.notnull ? 'no' : 'yes'} | ${c.pk ? 'PK' : ''} | ${
          fk ? `\`${fk.table}.${fk.to}\` (on delete ${fk.on_delete.toLowerCase()})` : ''
        } |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
