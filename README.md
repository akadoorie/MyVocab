# MyVocab

Learn words and expressions in a **shrinking loop** of flip cards. English and Hebrew first.
Each round shows only the cards you still don't know, until nothing is left. The full
specification is in [`PRD.md`](./PRD.md). Implementation decisions (the "D-0xx" references) are
kept in a private log.

> **Vocabulary privacy:** this repository is public and contains **no real vocabulary**.
> Content lives only in the private `MyVocab-Content` repository and in the app's database.
> CI enforces this with `pnpm check:no-vocabulary`.

## What it does

- **Learners** pick languages, a topic and a type (or just press Start), then go through flip
  cards: Hints on the front, Flip to see the answer, Know / Don't know. Guests get 5 cards per
  practice; signed-in learners (Google) choose 10–50 and their known words are remembered and kept out
  of future practices in the direction they were marked in. "My known words" lets them bring words back.
- **Admins** manage items (translations, explanation, synonyms, hints, multiple meanings),
  topics, languages, users and settings, import CSV files, restore from Trash and read the
  audit log. The admin area is protected by **two locks**: the admin role and Cloudflare Access.

## Architecture

```mermaid
flowchart LR
  B[Browser<br/>React SPA] -- static files --> W
  B -- /api/* JSON --> W[Cloudflare Worker<br/>Hono API + Workers Assets]
  W --> D[(Cloudflare D1<br/>SQLite)]
  W -- sign-in --> G[Google OAuth]
  W -- guest bot check --> T[Turnstile]
  A[Admin] -- /admin* --> CA[Cloudflare Access<br/>one-time PIN] --> W
```

One Worker serves the built SPA and `/api/*` from the same origin. The practice runs entirely in the
browser after `POST /api/practices` returns the cards. The hourly cron purges the Trash and old usage
counters.

| Part  | Technology                                                                        |
| ----- | --------------------------------------------------------------------------------- |
| Web   | React 19, Vite, Tailwind CSS v4, React Router, TanStack Query                     |
| API   | Hono on Cloudflare Workers, Better Auth (Google), Zod contracts                   |
| Data  | Cloudflare D1 (SQLite) with Drizzle ORM; one row per item, lists as JSON          |
| Tests | Vitest (unit, Worker integration, component), Playwright (E2E, axe accessibility) |

```
apps/web            React SPA (learner pages + lazy-loaded admin area)
apps/api            Cloudflare Worker: routes → services → repositories → D1
  migrations/       D1 migrations (applied by the deploy workflow)
  scripts/          db:seed and db:export (run on your computer only)
packages/core       pure domain logic: practice engine, card builder, item validation, CSV
packages/contracts  Zod request/response schemas shared by web and API
e2e/                Playwright tests (synthetic data only)
seed/sample.csv     ≤ 20 obviously fake rows for development and CI
scripts/            repo tooling (no-vocabulary guard, E2E server)
```

## Local setup (Windows, macOS, Linux)

Prerequisites: [Node.js](https://nodejs.org) 22.12+ and Git. Commands work in PowerShell, Git Bash
and any Unix shell.

```sh
corepack enable pnpm                              # once: the pnpm version pinned in package.json
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars  # PowerShell: Copy-Item apps/api/.dev.vars.example apps/api/.dev.vars
pnpm db:seed                                      # local database: migrations + vocabulary
pnpm dev                                          # http://localhost:5173
```

- Edit `apps/api/.dev.vars`: replace `BETTER_AUTH_SECRET` and `USAGE_HASH_SECRET` with long random
  strings (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). The
  Turnstile values are Cloudflare's always-pass test keys.
- `pnpm db:seed` loads `../MyVocab-Content/starter.csv` if the private content folder is next to
  this one (set `CONTENT_DIR` to use another folder); otherwise the synthetic `seed/sample.csv`.
- **Google sign-in locally:** create a Google OAuth client (see [Owner setup](#owner-setup-guide),
  step 3), put its id and secret into `.dev.vars`, and put your email into `ADMIN_EMAILS` to be an
  admin. The admin area opens at <http://localhost:5173/admin> (Cloudflare Access is skipped in
  development).

## Scripts

| Command                     | What it does                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev`                  | Applies local D1 migrations, then Vite dev server + `wrangler dev` (local Worker and local D1) |
| `pnpm build`                | Builds the SPA into `apps/web/dist`                                                            |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                                                              |
| `pnpm typecheck`            | TypeScript in every package                                                                    |
| `pnpm test`                 | Unit, Worker integration, component and script tests                                           |
| `pnpm e2e`                  | Playwright end-to-end tests (desktop + mobile, synthetic data)                                 |
| `pnpm check:no-vocabulary`  | Fails if vocabulary, DB dumps or exports would enter this repo                                 |
| `pnpm db:seed`              | Imports a CSV into the local database (see below)                                              |
| `pnpm db:export`            | Exports the database on your computer (see below)                                              |

## Testing

- `pnpm test` runs: `packages/core` unit tests (coverage must stay ≥ 90%), Worker integration
  tests against a local D1 with the real migrations (`apps/api/test`), component tests
  (`apps/web`), and script tests (`db:seed` / `db:export` round trip on throw-away databases).
- `pnpm e2e` builds the SPA, seeds a separate local database with `seed/sample.csv` only, starts
  `wrangler dev` in test mode and runs the Playwright suite on a 1280×800 and a 390×844 viewport:
  guest practice, signed-in known words, admin editor and Trash, CSV import, an axe accessibility scan
  of every page, keyboard-only use and the security headers. The first run needs
  `pnpm exec playwright install chromium`.
- CI (`.github/workflows/ci.yml`) runs all of it on every pull request and push. It never sees
  real vocabulary or secrets.

## Content workflow

```
MyVocab-Content (private repo)          MyVocab (this repo)               D1 (live data)
  starter.csv, imports/*.csv  ──▶  pnpm db:seed --file … [--remote]  ──▶
                                   Admin → Import (dry run, commit)  ──▶
  snapshots/vocabulary-*.csv  ◀──  pnpm db:export --content-only     ◀──
```

- D1 is the live copy. Admin edits happen there; imports only **add** (they never delete or
  overwrite), so re-importing an edited CSV doesn't change existing entries.
- Keep the content repository **private**. Commit snapshots there regularly (below). The app never
  reads from GitHub.
- CSV format: one row per item, `|` between list entries; see PRD §8.3 or download the template
  in Admin → Import. In Excel, save as **CSV UTF-8 (Comma delimited)**.

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
`json/languages.json`, `json/topics.json`, `json/items.json` and `json/item_topics.json`
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

The snapshot holds only the vocabulary (items, topics, lists, flags, statuses): no users,
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

## Deployment

- **CI** (`ci.yml`): every pull request and push. **CodeQL** (`codeql.yml`): code scanning.
  **Dependabot** (`.github/dependabot.yml`): weekly npm and GitHub Actions updates.
- **Deploy** (`deploy.yml`): starts on every push to `main` (or "Run workflow"), then **waits for
  your Approve click** in the GitHub `production` Environment. After approval it runs the checks
  again, applies D1 migrations (`wrangler d1 migrations apply myvocab-prod --remote`) and deploys
  the Worker (`wrangler deploy`). It never seeds, exports or prints data.
- `wrangler.jsonc` defaults to **production** and fails closed: the app refuses to serve until
  Cloudflare Access, an https `APP_URL` and real Turnstile/Google settings are configured. Local
  development overrides these in `.dev.vars`.

## Owner setup guide

Everything below is done once, by you, in your own accounts. Nothing here costs money on the free
plans (Workers Free, D1, Turnstile, Zero Trust ≤ 50 users, GitHub Free).

1. **Cloudflare account**: create it at <https://dash.cloudflare.com> and turn on two-factor
   authentication (My Profile → Authentication).
2. **GitHub repositories** (2FA on): `MyVocab` **public** (this code) and `MyVocab-Content`
   **private** (the vocabulary). With the GitHub CLI:
   ```sh
   gh repo create MyVocab --public --source . --push
   cd ../MyVocab-Content
   gh repo create MyVocab-Content --private --source . --push
   ```
   Public repos get **secret scanning**, **push protection** and **Dependabot alerts** on by
   default. Turn on the one that isn't: `MyVocab` → Settings → **Advanced Security** → Dependabot →
   **Dependabot security updates** → Enable. (Check all four with
   `gh api repos/<you>/MyVocab --jq .security_and_analysis`.)
3. **Google OAuth client** (Google Cloud Console → APIs & Services → Credentials → Create
   credentials → OAuth client ID → Web application). Authorized redirect URIs:
   - `http://localhost:5173/api/auth/callback/google` (local: the Vite dev server forwards `/api`)
   - `https://<your-app-host>/api/auth/callback/google` (e.g. `myvocab.<subdomain>.workers.dev`)

   Scopes: the defaults (`openid`, `email`, `profile`). Keep the client id and secret for step 6.
   Until the app is deployed, leave the consent screen in **Testing** and add yourself under
   Audience → **Test users** (local sign-in works). After the first deploy, fill in Branding →
   home page `https://<your-app-host>/` and privacy policy `https://<your-app-host>/privacy`, add
   the authorized domain, then Audience → **Publish app**.

4. **D1 database**:
   ```sh
   pnpm --filter @myvocab/api exec wrangler login
   pnpm --filter @myvocab/api exec wrangler d1 create myvocab-prod
   ```
   Paste the printed `database_id` into `apps/api/wrangler.jsonc` (`d1_databases[0].database_id`)
   and commit it (it isn't a secret). Your app's address is shown in the dashboard under Workers →
   Settings → Subdomain: `myvocab.<subdomain>.workers.dev`.
5. **Turnstile** (dashboard → Turnstile → Add widget): mode **Invisible** (or Managed), hostnames:
   your app host and `localhost`. Keep the site key and the secret key.
6. **Worker configuration.** In `apps/api/wrangler.jsonc` → `vars`, set `APP_URL`
   (`https://<your-app-host>`), `TURNSTILE_SITE_KEY`, and (after step 7) `CF_ACCESS_TEAM_DOMAIN` and
   `CF_ACCESS_AUD`, then commit. Set the secrets (each command asks for the value):
   ```sh
   cd apps/api
   pnpm exec wrangler secret put BETTER_AUTH_SECRET     # a long random string
   pnpm exec wrangler secret put USAGE_HASH_SECRET      # another long random string
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
   pnpm exec wrangler secret put ADMIN_EMAILS           # your email(s), comma-separated
   pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
   ```
   Random strings: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   (If the Worker doesn't exist yet, `wrangler secret put` offers to create it.)
7. **Cloudflare Access** (Zero Trust dashboard; choose a team name on first visit, e.g.
   `myvocab` → team domain `myvocab.cloudflareaccess.com`):
   - Settings → Authentication → Login methods: enable **One-time PIN**.
   - Access → Applications → Add → **Self-hosted**. Application domain: your app host, path
     `admin`; add a second destination: your app host, path `api/admin`. Session duration: e.g. 24 h.
   - Policy: Action **Allow**, Include → **Emails** → your admin email(s).
   - Open the application's Overview and copy the **Application Audience (AUD) tag** into
     `CF_ACCESS_AUD`; put the team domain into `CF_ACCESS_TEAM_DOMAIN` (step 6).
8. **Cloudflare API token for deploys** (My Profile → API Tokens → Create token → Custom):
   permissions **Account → Workers Scripts → Edit**, **Account → D1 → Edit**,
   **Account → Account Settings → Read**; Account resources: only your account. Copy the token and
   your **Account ID** (dashboard → Workers & Pages → right sidebar).
9. **GitHub Environment `production`** (`MyVocab` → Settings → Environments → New environment):
   - Required reviewers: **you**. Deployment branches: **main** only.
   - Environment secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (step 8).
10. **Protect `main`** (Settings → Rules → Rulesets → New branch ruleset, target: default branch):
    require a pull request before merging, require status checks to pass ("Lint, typecheck, test,
    build" from CI and "Analyze" from CodeQL), block force pushes, restrict deletions.
11. **First deploy**: merge to `main`, open Actions → Deploy, click **Review deployments →
    Approve**. The workflow applies the migrations and deploys.
12. **Production vocabulary**: review `../MyVocab-Content/starter.csv` (Hebrew and English
    quality), then seed it:
    ```sh
    pnpm db:seed -- --file ../MyVocab-Content/starter.csv --remote
    ```
13. **Check it** on a phone and a desktop: play a practice as a guest (Turnstile is invisible), sign in
    with Google, mark a word as known and find it in My known words. Open `/admin`: Cloudflare
    Access asks for a one-time code first; a non-admin email is refused; a signed-in non-admin calling
    `/api/admin/stats` gets 403. In the D1 dashboard, rows read/written stay far below the free
    limits.
14. **From time to time**: `pnpm db:export -- --content-only` and commit the snapshot to the private
    repository (see [Export & migrate](#export--migrate-your-data)).

## Restore with D1 Time Travel

D1 keeps a point-in-time history of the production database: always on, free, 7 days on the
free plan (30 on Workers Paid). `wrangler d1 info myvocab-prod` should show `version: production`
(older `alpha` databases only have snapshot backups). Restoring
replaces the whole database with its state at that moment, so take a full export first if you are
unsure.

```sh
cd apps/api
pnpm exec wrangler d1 time-travel info myvocab-prod                              # current bookmark
pnpm exec wrangler d1 time-travel info myvocab-prod --timestamp=2026-11-16T14:30:00Z
pnpm exec wrangler d1 time-travel restore myvocab-prod --timestamp=2026-11-16T14:30:00Z
# or: pnpm exec wrangler d1 time-travel restore myvocab-prod --bookmark=<bookmark>
```

The restore prints a bookmark of the state you replaced, so you can undo it with
`--bookmark=<that bookmark>`. For vocabulary only, you can also re-import a snapshot with
`pnpm db:seed -- --file <snapshot.csv> --remote` (imports only add).

## Free-tier limits to watch

| Service             | Free limit (re-check Cloudflare's pricing pages)    | How MyVocab stays inside it                                           |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| Workers             | 100,000 requests/day, 10 ms CPU per request         | Static files are free; the practice runs in the browser               |
| D1                  | 5 M rows read/day, 100,000 rows written/day, 500 MB | One row per item; batched Know marks; no writes from blocked requests |
| Turnstile           | Free                                                | Guests only                                                           |
| Zero Trust (Access) | 50 users                                            | Admins only                                                           |

The admin dashboard shows limit events from the last 24 hours. If you outgrow the free plan,
Workers Paid ($5/month) raises the limits; nothing in the code has to change.

## Security and privacy in short

- Admin area: the admin role (database session) **and** a verified Cloudflare Access token
  (production), checked on every `/api/admin` request. Every admin change is audit-logged in the
  same database transaction.
- Guests: invisible Turnstile, 5 cards per practice, hourly cap per hashed IP. Learners: daily card
  cap. Burst limits per minute with the Workers Rate Limiting binding.
- Strict Content Security Policy and security headers on every response; `/api/*` is never cached
  or indexed. CSRF: SameSite cookies, Origin and Content-Type checks on every change.
- Stored personal data: Google id, email, name and picture link, known words, usage counters. No
  IP addresses, browser details or Google tokens. Users can delete their account at any time.
