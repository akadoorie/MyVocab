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

_More sections (content workflow, export & migrate, deployment, owner setup guide, restore) are
added as the milestones in the PRD are completed._
