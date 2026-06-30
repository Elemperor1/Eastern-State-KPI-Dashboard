# Eastern State KPI — Agent Notes

Internal KPI dashboard for Eastern State Penitentiary Historic Site. Next.js 15 App Router + SQLite + iron-session.

## Auth status (temporary)

Login is **currently disabled** via `AUTH_DISABLED=true` in `.env.local`. The flag is read by `src/lib/auth-flag.ts`; when true (and `NODE_ENV !== "production"`), `getSession()` / `requireSession()` / `requireAdmin()` return a real `users` row (`auth-disabled@local`) instead of consulting cookies, and `/` redirects straight to `/dashboard/overview`. The `AccountBlock` (and its Logout button) is hidden in `src/components/AppShell.tsx` when the bypass user is detected (`user.email === "auth-disabled@local"`).

**Production guard:** `src/lib/auth-flag.ts` forces `AUTH_DISABLED=false` whenever `NODE_ENV` is `production` or `test`, and throws at module load if the env var is explicitly set in those modes. A reachable production deployment therefore cannot be misconfigured into fail-open admin mode — `next build` and `next start` will refuse to start with `AUTH_DISABLED=*** in the environment. The bypass only works in dev (`npm run dev`, `NODE_ENV=development`).

The CI gate (`npm run design-system:test`) runs `next build` with `AUTH_DISABLED` explicitly cleared so the production build path is verified on every PR.

**Bypass row is not a login credential:** the `auth-disabled@local` row exists in `users` so FK references (`monthly_entries.updated_by`, `breakdown_entries.updated_by`) resolve to a real `users.id`, and so the dev bypass has a stable identity. `src/lib/auth.ts` lists the email in a `RESERVED_EMAILS` set and `verifyCredentials()` short-circuits to `null` for any reserved email — the row is unreachable through `/api/auth/login` regardless of the stored hash. The stored hash is also rotated to `bcrypt(crypto.randomBytes(64))` on every `ensureSeedAdmin()` call, so the previous documented plaintext is no longer a valid credential and the hash never appears in source control. `src/lib/auth.test.ts` asserts both the reserved-email rejection and the hash rotation.

To restore login: set `AUTH_DISABLED=false` in `.env.local`, then revert the four conditional branches in `src/lib/session.ts`, `src/app/page.tsx`, and `src/components/AppShell.tsx`. The `/login` page, `/api/auth/*` routes, seeded accounts, and `requireSession`/`requireAdmin` call sites are all preserved — no other restoration work is needed.

## Setup

```bash
npm install
npm run db:seed   # populates data/kpi.db with 2024–2026 sample data
npm run dev       # http://localhost:3000
```

Seeded accounts (first DB access only, via `ensureSeedAdmin` in `src/lib/auth.ts`; unused while auth is disabled):

On the first run against a fresh database, the seed creates `kerry@easternstate.org` (admin) and `zach@easternstate.org` (viewer) with **per-install random passwords** that are printed to the server's stdout exactly once. No plaintext is stored in source or docs. Operators read the password line at first startup, rotate it through `/admin/users`, and the seed is done. The default development workflow runs with `AUTH_DISABLED=true` and never reads the password line, so it stays out of your way.

## Commands

| Command                       | Purpose                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| `npm run dev`                 | Dev server on :3000                                           |
| `npm run build`               | Production build                                              |
| `npm start`                   | Serve production build on :3000                               |
| `npm run lint`                | `next lint` — runs both design-system guards first via `prelint`|
| `npm run design-system:guard` | Fails if raw `<button>`/`<input>`/primitive classes used outside `src/components/ui/`, or if hex literals / `transition: all` / inline-style hex bypasses are introduced in `src/app/**` or `src/components/**` (excluding `src/components/ui/` and `src/app/globals.css`). |
| `npm run design-system:test`  | Both design-system guards + `tsc --noEmit` + `next build` — **the CI gate**. Run this before opening a PR; CI is expected to invoke this script verbatim. |
| `npm run db:seed`             | Reset KPI/category/entry tables and reseed sample data        |
| `npm test`                    | Vitest unit tests (`src/lib/analytics.test.ts` covers `analytics.ts`) |
| `npm run test:coverage`       | Vitest with v8 line coverage (≥ 90% on `src/lib/analytics.ts`) |

## Loading skeletons & favicon

Every public route has a structure-mirroring `loading.tsx` that renders an
immediate skeleton via the design-system `Skeleton` primitives while the page
data is fetched:

- `src/app/dashboard/loading.tsx` — overview/card grid
- `src/app/dashboard/overview/loading.tsx` — header + filter toolbar + card grid
- `src/app/dashboard/category/[slug]/loading.tsx` — breadcrumb + header + toolbar + cards + summary table
- `src/app/dashboard/metric/[slug]/loading.tsx` — breadcrumb + header + toolbar + 3 stat cards + 2 chart cards + values table
- `src/app/dashboard/trends/loading.tsx` — header + tabs + filters + KPI chips + chart card
- `src/app/admin/loading.tsx` — header + toolbar + table card
- `src/app/admin/data/loading.tsx`, `src/app/admin/kpis/loading.tsx`, `src/app/admin/users/loading.tsx`
- `src/app/login/loading.tsx` — two-column split (marketing panel + form panel)

Favicon is served at `/favicon.ico` (a 6-resolution multi-size `.ico` — 16/32/48/64/128/256 — generated from `public/logos/eastern-state-mark.png` via `magick`) and is also registered via `metadata.icons` in `src/app/layout.tsx` (which lists both the `.ico` and the 256×256 PNG so modern browsers can pick the PNG). The in-app `BrandMark` component (`src/components/ui/BrandMark.tsx`) renders the same source-of-truth PNG via `next/image` at sidebar/header/login sizes.

## Verification (smoke harness)

Requires a running server. Invoke `scripts/smoke.sh` directly (no npm wrapper) so the `AUTH_DISABLED` env var reaches the script:

```bash
npm run build
AUTH_DISABLED=true PORT=3290 node_modules/.bin/next start -p 3290 &
AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh

AUTH_DISABLED=false PORT=3290 node_modules/.bin/next start -p 3290 &
AUTH_DISABLED=false PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh
```

Tests login, all 8 category pages, monthly/annual/breakdown metric pages, through-month URL params, POST/DELETE round-trips on `/api/entries` and `/api/breakdowns`, the auth-bypass flow on `POST /api/entries` (401 when auth is enabled, 201 when bypassed), the no-data badge on the category page when both years lack entries, and the read-only `/admin/history` audit-trail browser + `/api/entries/history` endpoint. Expects 52 KPIs and the exact category names listed in `scripts/smoke.sh`. Reports `52 passed, 0 failed` on a clean checkout under `AUTH_DISABLED=true`.

Unit tests live in `src/lib/analytics.test.ts` (Vitest, coverage ≥ 90% line coverage on `analytics.ts`). Run with `npm test`; the smoke harness does not exercise this code path.

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
- Schema bump: edit `SCHEMA_VERSION` in `src/lib/db.ts:25`. Old DBs drop KPI tables + `entry_history` on next access; rerun `npm run db:seed`.
- Every `upsertEntry` / `deleteEntry` / `upsertBreakdown` / `deleteBreakdown` call writes a row to `entry_history` (before/after values, changed_by, changed_at). The audit trail survives deletes of the source entry — `entry_id` may refer to a row that no longer exists. Browsable at `/admin/history`; admin-only endpoint at `/api/entries/history`.
- `analytics.monthlyComparison.isEmpty` and `analytics.ytdComparison.isEmpty` are true only when both years lack any underlying entry for the queried period. `MetricCard` renders a "No data" `Badge variant="warning"` (with an `AlertTriangle` icon) and skips the percent change when either flag is set.

## Auth & env

- Session uses `iron-session` encrypted cookies. `SESSION_SECRET` must be ≥ 32 chars (validated at runtime in `src/lib/session.ts`).
- `SESSION_SECURE=false` is set in `.env.local` for HTTP dev. Production must omit it (default `true`).
- `DATABASE_PATH` defaults to `./data/kpi.db`; `data/` is gitignored.
- `src/app/page.tsx` runs `ensureSeedAdmin()` at module load — keep that import even if it looks unused.
- **Login throttle.** `src/app/api/auth/login/route.ts` throttles failed attempts per source IP and per account via `src/lib/login-throttle.ts`. Defaults: 10 failures inside 5 minutes → 5-minute lockout (HTTP 429 with `Retry-After`). Tunable via `LOGIN_LOCKOUT_THRESHOLD`, `LOGIN_LOCKOUT_WINDOW_MS`, `LOGIN_LOCKOUT_DURATION_MS`. State is in-process; if you scale horizontally, move the counters to a shared store. **Set `TRUST_PROXY=*** when running behind a reverse proxy** so the throttle can read the real client IP from `x-forwarded-for`. Without it, the route collapses every request to a single `unknown` IP key (a defensive default against header spoofing), which is correct for internet-facing deployments without a proxy but too aggressive when the app is behind one.

## Conventions specific to this repo

- `prelint` runs **both** design-system guards (`design-tokens-guard.sh` for hex literal / `transition: all` / inline-style hex bypasses; `design-system-guard.sh` for raw `<button>` / `<input>` / primitive classes) before `next lint` — fixes for guard violations should land in `src/components/ui/` or the Tailwind theme tokens (`tailwind.config.ts` + `src/app/globals.css`), not in pages or feature components.
- **`npm run design-system:test` is the CI gate.** It runs both design-system guards + `tsc --noEmit` + `next build` in sequence. CI must invoke this script verbatim; PRs that skip it will be rejected. The QA manual at `docs/qa-manual.md` is the human-readable companion to the smoke harness for visual verification.
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
