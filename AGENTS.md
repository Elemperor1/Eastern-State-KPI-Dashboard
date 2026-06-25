# Eastern State KPI — Agent Notes

Internal KPI dashboard for Eastern State Penitentiary Historic Site. Next.js 15 App Router + SQLite + iron-session.

## Auth status (temporary)

Login is **currently disabled** via `AUTH_DISABLED=true` in `.env.local`. The flag is read by `src/lib/auth-flag.ts`; when true, `getSession()` / `requireSession()` / `requireAdmin()` return a static admin user instead of consulting cookies, and `/` redirects straight to `/dashboard/overview`. The `AccountBlock` (and its Logout button) is hidden in `src/components/AppShell.tsx` when the bypass user is detected (`user.id === 0`).

To restore login: set `AUTH_DISABLED=false` in `.env.local`, then revert the four conditional branches in `src/lib/session.ts`, `src/app/page.tsx`, and `src/components/AppShell.tsx`. The `/login` page, `/api/auth/*` routes, seeded accounts, and `requireSession`/`requireAdmin` call sites are all preserved — no other restoration work is needed.

## Setup

```bash
npm install
npm run db:seed   # populates data/kpi.db with 2024–2026 sample data
npm run dev       # http://localhost:3000
```

Seeded accounts (first DB access only, via `ensureSeedAdmin` in `src/lib/auth.ts`; unused while auth is disabled):

- `kerry@easternstate.org` / `KerryAdmin!2026` — admin
- `zach@easternstate.org` / `ZachView!2026` — viewer

## Commands

| Command                       | Purpose                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| `npm run dev`                 | Dev server on :3000                                           |
| `npm run build`               | Production build                                              |
| `npm start`                   | Serve production build on :3000                               |
| `npm run lint`                | `next lint` — runs `design-system:guard` first via `prelint`  |
| `npm run design-system:guard` | Fails if raw `<button>`/`<input>`/primitive classes used outside `src/components/ui/` |
| `npm run design-system:test`  | Guard + `tsc --noEmit` + `next build`                         |
| `npm run db:seed`             | Reset KPI/category/entry tables and reseed sample data        |
| `npm run smoke`               | Curl-driven smoke harness — see below                         |

## Verification (smoke harness)

Requires a running server. Default port `3100`:

```bash
npm run build
PORT=3200 node_modules/.bin/next start -p 3200 &
PORT=3200 BASE=http://127.0.0.1:3200 npm run smoke
```

Tests login, all 8 category pages, monthly/annual/breakdown metric pages, through-month URL params, and POST/DELETE round-trips on `/api/entries` and `/api/breakdowns`. Expects 52 KPIs and the exact category names listed in `scripts/smoke.sh`.

There is no unit-test framework. The smoke script is the only automated check.

## Architecture

- `src/app/` — App Router pages + API route handlers (`/api/auth/{login,logout,me}`, `/api/{categories,kpis,entries,breakdowns,users,meta}`).
- `src/app/api/entries/years` — sub-route under `entries/`, not at top level.
- `src/components/ui/` — **shared design-system library**. Import via `@/components/ui`; never hand-roll buttons/inputs/selects/tables outside this folder (`design-system:guard` enforces it).
- `src/components/` — feature components (AppShell, MetricCard, TrendChart, etc.).
- `src/lib/` — `db.ts` (sqlite singleton + migrations), `repository.ts` (CRUD), `session.ts` (iron-session helpers), `auth.ts` (bcrypt), `analytics.ts` (comparison/YTD math), `dashboard-data.ts` (loader for server components), `types.ts`.
- `scripts/seed.ts` — sample data definition; bumping `SCHEMA_VERSION` in `src/lib/db.ts` resets all KPI tables (users preserved).
- `DESIGN.md` (root) — visual language authority. `docs/design-system.md` translates it into component rules.

## Data model quirks

- Annual-only metrics are stored with `month = 0` in `monthly_entries` (single full-year value). See `src/lib/types.ts:60`.
- `unit_type` ∈ `count | percent | currency | attendance | note | breakdown`. Breakdown KPIs write to `breakdown_entries` (label × year), not `monthly_entries`.
- Direction (`higher | lower | neutral`) drives good/bad coloring — read it instead of hardcoding sign.
- Schema bump: edit `SCHEMA_VERSION` in `src/lib/db.ts:25`. Old DBs drop KPI tables on next access; rerun `npm run db:seed`.

## Auth & env

- Session uses `iron-session` encrypted cookies. `SESSION_SECRET` must be ≥ 32 chars (validated at runtime in `src/lib/session.ts`).
- `SESSION_SECURE=false` is set in `.env.local` for HTTP dev. Production must omit it (default `true`).
- `DATABASE_PATH` defaults to `./data/kpi.db`; `data/` is gitignored.
- `src/app/page.tsx` runs `ensureSeedAdmin()` at module load — keep that import even if it looks unused.

## Conventions specific to this repo

- `prelint` runs the design-system guard before `next lint` — fixes for guard violations should land in `src/components/ui/`, not in pages.
- API handlers follow the pattern `try { await requireSession()/requireAdmin() } catch { return 401/403 }`. POST/DELETE require admin; GET requires any session.
- Use `zod` for request body validation on API routes.
- Server components load dashboard data via `loadDashboardData()` in `src/lib/dashboard-data.ts`; do not call `getDb()` from client components.
- New KPIs/categories are added at runtime via `/admin/kpis` (no code change required), but the **finalized metric set** (8 categories, 52 KPIs) is defined in `scripts/seed.ts`. Update both if changing the canonical set, then rerun `npm run db:seed`.

## Gotchas

- `node:sqlite` is a built-in Node module — Next.js does not need bundler externalization (`next.config.mjs` is intentionally empty).
- `tsconfig.tsbuildinfo` is gitignored; expect `tsc --noEmit` to be slow on first run after a clean.
- 2026 sample data only covers January–June; later-month queries return nulls by design.
- `iron-session` requires `cookies()` to be awaited — all `getSession()` calls are `async`.
- Tailwind theme tokens (`ink`, `brand`, `accent`) live in `tailwind.config.ts`; do not hardcode hex values in components.
