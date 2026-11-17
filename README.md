# MyVocab

Learn words and expressions in a **shrinking loop** of flip cards. English and Hebrew first.
The full specification is in [`PRD.md`](./PRD.md).

> **Vocabulary privacy:** this repository is public and contains **no real vocabulary**.
> Content lives only in the private `MyVocab-Content` repository and in the app's database.
> CI enforces this with `pnpm check:no-vocabulary`.

## Tech stack

TypeScript monorepo (pnpm) · React 19 + Vite + Tailwind CSS v4 · Hono on Cloudflare Workers ·
Cloudflare D1 + Drizzle ORM · Zod contracts shared by web and API.

```
apps/web          React SPA
apps/api          Cloudflare Worker (serves the SPA assets and /api/*)
packages/core     pure domain logic (loop engine, card builder, validation, CSV)
packages/contracts Zod request/response schemas
scripts/          repo tooling (no-vocabulary guard)
docs/DECISIONS.md implementation decisions
```

## Local setup (Windows, macOS, Linux)

Prerequisites: Node.js 22.12+ and Git.

```sh
corepack enable pnpm   # once; installs the pnpm version pinned in package.json
pnpm install
pnpm dev               # SPA on http://localhost:5173, API on http://localhost:8787
```

## Scripts

| Command                     | What it does                                                   |
| --------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                  | Vite dev server + `wrangler dev` (local Worker)                |
| `pnpm build`                | Builds the SPA into `apps/web/dist`                            |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                              |
| `pnpm typecheck`            | TypeScript in every package                                    |
| `pnpm test`                 | Unit tests, component tests and Worker integration tests       |
| `pnpm check:no-vocabulary`  | Fails if vocabulary, DB dumps or exports would enter this repo |
| `pnpm db:seed`              | Imports a CSV into the local database (see below)              |
| `pnpm db:export`            | Exports the database on your computer (see below)              |

## Export & migrate your data

Your data is never locked in. `pnpm db:export` runs **on your own computer** (never in GitHub
Actions, never through a public service) and writes plain files you can open, keep, or load into
another database.

### Before you start

1. Install the prerequisites from [Local setup](#local-setup-windows-macos-linux) and run
   `pnpm install` once.
2. For the **production** database, sign in to Cloudflare once:
   ```sh
   pnpm --filter @myvocab/api exec wrangler login
   ```
   A browser window opens; approve access for your Cloudflare account. (Exports from your
   **local** development database need no login.)

### The commands

| Command                                             | What you get                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm db:export`                                    | A **full export** of the production database                                             |
| `pnpm db:export -- --local`                         | The same, from your local development database                                           |
| `pnpm db:export -- --content-only`                  | Only the vocabulary CSV, written to `../MyVocab-Content/snapshots/vocabulary-<date>.csv` |
| `pnpm db:export -- --content-only --out <file.csv>` | Only the vocabulary CSV, to the file you choose                                          |
| `pnpm db:export -- --out <folder>`                  | A full export into the folder you choose                                                 |

> ⚠️ A **full export contains personal data** (user emails, names, sessions). It goes to the
> git-ignored `exports/` folder of this repository. Keep it private and never commit or upload it.
> The command refuses to write a full export into the content repository. Only the
> `--content-only` CSV belongs there.

### What's in a full export

`exports/myvocab-export-<YYYY-MM-DD-HHmm>/` plus a `.zip` of the same folder:

| File                 | What it is                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`          | A guide to this export: every table with its columns, types and relations                                                                           |
| `manifest.json`      | Export time, app version, schema version (last migration), rows per table                                                                           |
| `sqlite/schema.sql`  | The tables and indexes (SQLite / D1)                                                                                                                |
| `sqlite/data.sql`    | Every row as `INSERT` statements                                                                                                                    |
| `json/<table>.json`  | One file per table, an array of rows. Item lists are real JSON arrays/objects; every timestamp `x_at` (milliseconds) also has a readable `x_at_iso` |
| `csv/vocabulary.csv` | The live vocabulary (no Trash) in the import format: open it in Excel or import it again                                                            |

### Load it into SQLite

With the [`sqlite3`](https://sqlite.org/download.html) command-line tool:

```sh
cd exports/myvocab-export-2026-11-16-1430
sqlite3 myvocab.db < sqlite/schema.sql
sqlite3 myvocab.db < sqlite/data.sql
sqlite3 myvocab.db "SELECT lang, text FROM items LIMIT 5;"
```

To load it into another D1 database instead:
`wrangler d1 execute <database> --remote --file sqlite/schema.sql`, then the same with
`sqlite/data.sql`.

### Load it into PostgreSQL

The `json/` files work with any database. The export's own `README.md` contains a complete worked
example: `CREATE TABLE` statements (item lists as `jsonb`) and a short Node script that reads
`json/languages.json`, `json/categories.json`, `json/items.json` and `json/item_categories.json`
and inserts them with the `pg` package:

```sh
npm install pg
DATABASE_URL=postgres://user:password@localhost:5432/myvocab node load.mjs
```

### Take a vocabulary snapshot into the private content repository

```sh
pnpm db:export -- --content-only
cd ../MyVocab-Content
git add snapshots
git commit -m "Vocabulary snapshot"
git push
```

The snapshot holds only the vocabulary (items, categories, lists, flags, statuses): no users,
known lists, audit log or settings.

### Restore a snapshot (or load any CSV)

```sh
pnpm db:seed -- --file ../MyVocab-Content/snapshots/vocabulary-2026-11-16.csv            # local
pnpm db:seed -- --file ../MyVocab-Content/snapshots/vocabulary-2026-11-16.csv --remote   # production
```

Imports only **add**: an item that already exists gets missing list entries appended and is never
overwritten or deleted. Importing a snapshot into an empty database reproduces the same content
(this round trip is tested). `--remote` writes to production and asks you to type
`SEED PRODUCTION` first.

_More sections (content workflow, deployment, owner setup guide, restore with Time Travel) are
added in the last milestone._
