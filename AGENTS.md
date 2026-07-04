# Eastern State KPI — Agent Notes

Internal KPI dashboard for Eastern State Penitentiary Historic Site. Next.js 15 App Router + SQLite + iron-session.

## Auth status (temporary)

Login is **currently disabled** via `AUTH_DISABLED=true` in `.env.local`. The flag is read by `src/lib/auth-flag.ts`; when true (and `NODE_ENV !== "production"`), `getSession()` / `requireSession()` / `requireAdmin()` return a real `users` row (`auth-disabled@local`) instead of consulting cookies, and `/` redirects straight to `/dashboard/overview`. The `AccountBlock` (and its Logout button) is hidden in `src/components/AppShell.tsx` when the bypass user is detected (`user.email === "auth-disabled@local"`).

**Production guard:** `src/lib/auth-flag.ts` forces `AUTH_DISABLED=false` whenever `NODE_ENV` is `production` or `test`, and throws at module load if the env var is explicitly set in those modes. A reachable production deployment therefore cannot be misconfigured into fail-open admin mode — `next build` fails with `AUTH_DISABLED=true`, and `next start` cannot serve app routes when the flag is set. The bypass only works in dev (`npm run dev`, `NODE_ENV=development`).

The CI gate (`npm run design-system:test`) runs `next build` with `AUTH_DISABLED` explicitly cleared so the production build path is verified on every PR.

**Loopback-only bypass (D8AD-CAN-002):** the bypass is permitted **only** when `NODE_ENV=development` AND the server is bound exclusively to a loopback address (`BIND_HOST` ∈ `127.0.0.1`/`::1`/`localhost`). `auth-flag.ts` throws at startup if the flag is set on a non-loopback bind, and `next.config.mjs` throws at build time if the flag is set during a production build. Enforcement uses the declared `BIND_HOST` env var — never request `Host`/`X-Forwarded-For` headers. `npm run dev` (`scripts/dev.sh`) sets `BIND_HOST=127.0.0.1` and binds `next dev -H 127.0.0.1` automatically when `AUTH_DISABLED` is set. `scripts/auth-bypass-guard.sh` (part of the CI gate) asserts `fly.toml`/`Dockerfile`/`start-production.sh` cannot enable the bypass. Exact safe-use conditions: `docs/operator-provisioning.md` → "AUTH_DISABLED — exact safe-use conditions".

**Durable session revocation (D8AD-CAN-003):** a per-user `sessions_valid_after` unix-ms watermark on the `users` row is the revocation value. Every newly issued session carries the stable user **id** (never email as the identity key) and an `issuedAt` timestamp. `getCurrentUser()` (the single chokepoint in `src/lib/session.ts`) re-reads the row from the DB by id on every protected request and rejects — destroying the cookie and returning null — when the user (a) no longer exists (deleted), (b) is disabled (`disabled` flag), or (c) has `issuedAt < sessions_valid_after` (a security-sensitive change happened after this session was issued). `requireAdmin` additionally rejects a downgraded role against the DB-synced role. The watermark is bumped atomically in a transaction on password reset (`updateUserPassword`), self-service password change, role change (`updateUserRole` via `PATCH /api/users/account`), and disable/enable (`setUserDisabled`); deletion needs no bump because the row is gone. Admin role-change + disable/enable live at `PATCH /api/users/account` (self-targeted changes are refused to prevent self-lockout); the UI is the role `<Select>` and disable/enable `IconButton` per row on `/admin/users`. Invalid cookies are cleared by `getCurrentUser` and every data API returns a consistent 401 `{error:"Unauthorized"}` (or 403 `{error:"Forbidden"}` for insufficient role) via the shared `authErrorResponse` helper. Login answers identically for unknown / wrong-password / disabled / deleted accounts ("Invalid email or password.") so no former existence leaks. Replay tests in `src/lib/session-revocation.test.ts` cover all five revocation triggers; the full auth/az suite is part of `npm test`.

**D8AD-CAN-003 regression suite (`src/lib/auth-regression.test.ts` + `src/lib/auth-regression-helpers.ts`):** data-driven from `PROTECTED_API_ROUTES` (the exhaustive table of every protected API route + method + gate). The helpers (`createAdmin`/`createViewer`/`dispatch(method,path)`/`assertUnauthorized`/`assertForbidden`/`assertOk`) are reusable across authz tests. The suite (a) creates an admin + viewer, logs each in and retains the cookie; (b) performs password reset, role change, disablement, and deletion; (c) replays the retained cookie against all 26 protected route+method combos (4 triggers × 26 routes) → uniform 401 `{error:"Unauthorized"}` with the cookie cleared; (d) asserts a viewer session gets 403 on the 19 admin-gated routes and 200 on the 7 read routes; (e) asserts a fresh session works after a legitimate reset (admin survives a target reset; target re-authenticates, rotates, and reads succeed); (f) verifies invalid-session handling does not redirect-loop or leak account details (`getCurrentUser` null for revoked, `/api/auth/me` → `{user:null}`, `/api/auth/logout` clears a revoked cookie, login of a deleted account is a generic 401, the home page redirects a revoked session to `/login` once). Routes that CANNOT use the shared `requireSession`/`requireAdmin` boundary — and so are intentionally excluded from the gate-replay matrix — are documented in `auth-regression-helpers.ts`: `POST /api/auth/login` (public entry point), `POST /api/auth/logout` (uses `getSession` directly so a revoked cookie can still be cleared), `GET /api/auth/me` and `POST /api/auth/change-password` (minimum routes using `getCurrentUser` without the must_change 403 gate), and the page routes (`/`, `/dashboard/*`, `/admin/*`) which use `getCurrentUser` + `redirect()` instead of the throw-based JSON gate.

**Bypass row is not a login credential:** the `auth-disabled@local` row exists in `users` so FK references (`monthly_entries.updated_by`, `breakdown_entries.updated_by`) resolve to a real `users.id`, and so the dev bypass has a stable identity. `src/lib/auth.ts` lists the email in a `RESERVED_EMAILS` set and `verifyCredentials()` short-circuits to `null` for any reserved email — the row is unreachable through `/api/auth/login` regardless of the stored hash. The stored hash is also rotated to `bcrypt(crypto.randomBytes(64))` on every `ensureSeedAdmin()` call, so the previous documented plaintext is no longer a valid credential and the hash never appears in source control. `src/lib/auth.test.ts` asserts both the reserved-email rejection and the hash rotation.

To restore login: set `AUTH_DISABLED=false` in `.env.local`, then revert the four conditional branches in `src/lib/session.ts`, `src/app/page.tsx`, and `src/components/AppShell.tsx`. The `/login` page, `/api/auth/*` routes, seeded accounts, and `requireSession`/`requireAdmin` call sites are all preserved — no other restoration work is needed.

## Setup

```bash
npm install
npm run db:seed   # populates data/kpi.db with 2024–2026 sample data
npm run dev       # http://localhost:3000
```

Seeded accounts (first DB access only, via `ensureSeedAdmin` in `src/lib/auth.ts`; unused while auth is disabled):

On the first run against a fresh database, the seed creates `kerry@easternstate.org` (admin) and `zach@easternstate.org` (viewer). **No plaintext password is ever written to stdout, stderr, or logs** (security finding D8AD-CAN-001). The seed prefers operator-provided secrets — set `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_VIEWER_PASSWORD` in the environment (production: `fly secrets set`; never in `fly.toml` or on the command line) and the seed hashes them in, emitting only a non-sensitive status line naming the accounts and their credential source. If an env var is unset, the account gets a cryptographically-random password recorded nowhere (not in stdout, not in any log); the seed prints a non-sensitive warning pointing at `npm run setup:admin`, and the account is locked until the operator provisions a known credential. Every bootstrap account is created with `must_change_password=1`, so the user is forced through `/setup-password` (login redirect + per-page server-component redirect + `requireSession`/`requireAdmin` HTTP 403) before reaching the app. Operator recovery / first-credential provisioning: `SETUP_ADMIN_PASSWORD=... npm run setup:admin` (optionally `SETUP_ADMIN_EMAIL=...`) — the password is read from the env var only and never from argv/stdout/logs, then the rotation flag is cleared. See `docs/operator-provisioning.md`. The default development workflow runs with `AUTH_DISABLED=true` and never logs in, so provisioning stays out of the way.

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
| `npm run setup:admin`         | Operator-only: set a known password on a bootstrap account (`SETUP_ADMIN_PASSWORD=...`), clears `must_change_password`. Never logs the password. |
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

Requires a running server. Invoke `scripts/smoke.sh` directly (no npm wrapper) so the `AUTH_DISABLED` env var reaches the script. The bypass smoke path is development-only; `next start` always runs with `NODE_ENV=production` and cannot serve app routes with `AUTH_DISABLED=true`.

```bash
# Bypass-auth smoke (dev server only).
AUTH_DISABLED=true node_modules/.bin/next dev -p 3290 &
AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh

# Stop the dev server before reusing :3290 for production/auth-enabled smoke.
npm run build
AUTH_DISABLED=false PORT=3290 node_modules/.bin/next start -p 3290 &
SMOKE_EMAIL=kerry@easternstate.org SMOKE_PASSWORD='<printed first-run password>' \
  AUTH_DISABLED=false PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh
```

Tests login, all 8 category pages, monthly/annual/breakdown metric pages, through-month URL params, POST/DELETE round-trips on `/api/entries` and `/api/breakdowns`, the auth-bypass flow on `POST /api/entries` (401 when auth is enabled, 201 when bypassed), the no-data badge on the category page when both years lack entries, and the read-only `/admin/history` audit-trail browser + `/api/entries/history` endpoint. Expects 52 KPIs and the exact category names listed in `scripts/smoke.sh`. Reports `56 passed, 0 failed` under `AUTH_DISABLED=true` and `60 passed, 0 failed` under `AUTH_DISABLED=false` on a clean checkout.

Unit tests live in `src/lib/analytics.test.ts` (Vitest, coverage ≥ 90% line coverage on `analytics.ts`). Run with `npm test`; the smoke harness does not exercise this code path.

## Architecture

- `src/app/` — App Router pages + API route handlers (`/api/auth/{login,logout,me}`, `/api/{categories,kpis,entries,breakdowns,users,meta}`).
- `src/app/api/entries/years` — sub-route under `entries/`, not at top level.
- `src/components/ui/` — **shared design-system library**. Import via `@/components/ui`; never hand-roll buttons/inputs/selects/tables outside this folder (`design-system:guard` enforces it).
- `src/components/` — feature components (AppShell, MetricCard, TrendChart, etc.).
- `src/lib/` — `db.ts` (sqlite singleton + migrations), `repository.ts` (CRUD), `session.ts` (iron-session helpers), `auth.ts` (bcrypt), `analytics.ts` (comparison/YTD math), `dashboard-data.ts` (loader for server components), `types.ts`.
- `scripts/seed.ts` — sample data definition; bumping `src/lib/schema-version.json` resets all KPI tables (users preserved).
- `DESIGN.md` (root) — visual language authority. `docs/design-system.md` translates it into component rules.

## Data model quirks

- Annual-only metrics are stored with `month = 0` in `monthly_entries` (single full-year value). See `src/lib/types.ts:60`.
- `unit_type` ∈ `count | percent | currency | attendance | note | breakdown`. Breakdown KPIs write to `breakdown_entries` (label × year), not `monthly_entries`.
- Direction (`higher | lower | neutral`) drives good/bad coloring — read it instead of hardcoding sign.
- Schema bump: edit `src/lib/schema-version.json`. A fresh/older DB drops KPI tables + `entry_history` on next access; rerun `npm run db:seed`. **Exception — v4→v5 (D8AD-CAN-005):** the bump is in-place and preserves `entry_history`, adding immutable snapshot columns (`kpi_name/slug/unit`, `category_id/name/slug`, `changed_by_email`) and backfilling them from current metadata. Rows whose KPI was already deleted before the bump stay NULL — that NULL is the "deleted metadata" tombstone. Production startup uses `scripts/ensure-seeded.mjs` to compare the mounted DB's `meta.schema_version` with that same file before deciding whether seeding can be skipped.
- Every `upsertEntry` / `deleteEntry` / `upsertBreakdown` / `deleteBreakdown` call writes a row to `entry_history` (before/after values, changed_by, changed_at, **plus an immutable snapshot of the KPI/category/actor label at change time**). The audit trail survives deletes of the source entry — `entry_id` may refer to a row that no longer exists. Browsable at `/admin/history`; admin-only endpoint at `/api/entries/history`.
- **Audit-history immutability (D8AD-CAN-005).** `listEntryHistory` LEFT-joins the live `kpis`/`categories`/`users` tables; the historical label comes from the immutable snapshot columns, never the current (possibly renamed) label, and a missing live row never drops an event. The response surfaces `kpi_current_*`/`category_current_*` (null when deleted), `metadata_deleted` (live KPI/category gone), and `metadata_renamed` (live label differs from snapshot). Filtering by `category_id` uses the SNAPSHOT `h.category_id`, so a row stays visible for its original category even after the category/KPI is deleted. Renaming KPI/category metadata therefore does NOT retroactively rewrite historical labels — this is the documented, intended behavior.
- **Deletion guards (D8AD-CAN-005).** `deleteKPI` / `deleteCategory` throw `DependentEntriesError` (routes return **409**) when live `monthly_entries`/`breakdown_entries` still reference them (including child KPIs for a parent). The admin must delete the dependent entries first — each entry deletion records a tombstone audit row — so no metadata deletion can hide a previously recorded change. The seed script bypasses the guard with raw `DELETE`s after already clearing entries.
- `analytics.monthlyComparison.isEmpty` and `analytics.ytdComparison.isEmpty` are true only when both years lack any underlying entry for the queried period. `MetricCard` renders a "No data" `Badge variant="warning"` (with an `AlertTriangle` icon) and skips the percent change when either flag is set.

## Auth & env

- Session uses `iron-session` encrypted cookies. `SESSION_SECRET` must be ≥ 32 chars (validated at runtime in `src/lib/session.ts`).
- `SESSION_SECURE=false` is set in `.env.local` for HTTP dev. Production must omit it (default `true`).
- `DATABASE_PATH` defaults to `./data/kpi.db`; `data/` is gitignored.
- `src/app/page.tsx` runs `ensureSeedAdmin()` at module load — keep that import even if it looks unused.
- **Bootstrap provisioning (D8AD-CAN-001).** `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_VIEWER_PASSWORD` are operator secrets consumed by `ensureSeedAdmin()`; on Fly they MUST be set via `fly secrets set` and MUST NOT appear in `fly.toml` `[env]` (that section is non-secret, version-controlled, and visible in CI/deploy logs). When unset, the account gets a random unlogged password and is locked until `npm run setup:admin`. Bootstrap accounts are created with `must_change_password=1` and enforced through `/setup-password` + `requireSession`/`requireAdmin` 403. `setup-admin.ts` reads `SETUP_ADMIN_PASSWORD` from the env only (never argv) and emits only non-sensitive status. Regression tests live in `src/lib/auth-secrecy.test.ts` (capture stdout/stderr + child-process proof that sentinels never leak).
- **Login throttle.** `src/app/api/auth/login/route.ts` throttles failed attempts per source IP and per account via `src/lib/login-throttle.ts`. Defaults: 10 failures inside 5 minutes → 5-minute lockout (HTTP 429 with `Retry-After`). Tunable via `LOGIN_LOCKOUT_THRESHOLD`, `LOGIN_LOCKOUT_WINDOW_MS`, `LOGIN_LOCKOUT_DURATION_MS`. State is in-process; if you scale horizontally, move the counters to a shared store. **Set `TRUST_PROXY=true` when running behind a reverse proxy** so the throttle can read the real client IP from Fly's `fly-client-ip` header, then `x-forwarded-for` / `x-real-ip`. Without it, the route collapses every request to a single `unknown` IP key (a defensive default against header spoofing), which is correct for internet-facing deployments without a proxy but too aggressive when the app is behind one.
- **CSRF hardening (D8AD-CAN-004).** Every state-changing handler on `/api/users`, `/api/users/account`, `/api/auth/change-password`, `/api/entries`, `/api/breakdowns`, `/api/kpis`, `/api/categories`, `/api/goals` runs the shared `assertMutationRequest(req)` guard (`src/lib/request-guard.ts`) after authz: it enforces a same-origin `Origin`/`Referer`, an exact `application/json` content-type (415 otherwise), and a double-submit `X-CSRF-Token` header matching the fixed `eastern_state_kpi_csrf` cookie (set on login and `/api/auth/me`). The UI goes through `src/lib/api-client.ts` `apiFetch`, which lazily calls `/api/auth/me` if the cookie is missing, then attaches the header. Set `APP_CANONICAL_ORIGIN` (comma list) in production — it is in `fly.toml`; when unset the guard derives the request's own origin. CSRF failure reasons are server-log-only (`[csrf] <reason>`); clients see only generic 403/415. Full assumptions (SameSite, PSL/subdomains, proxies, canonical origin): `docs/csrf-hardening.md`.

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
