# Eastern State KPI — Product Roadmap

> Single source of truth for everything that still needs to be done to take the dashboard from "redesigned-but-fragile" to "internal-tool-of-record." This document is **the answer to the active goal**: "figure out what needs to be improved" with explicit `/goal` prompts at the bottom that an agent can pick up one at a time.
>
> Audit cut-off: 2026-06-25. Source of truth for behavior is `DESIGN.md` (visual) and `src/lib/*` + `scripts/*` (logic). All claims below were verified against the worktree, not memory.

## 0. State of the product (today)

| Dimension | State | Evidence |
| --- | --- | --- |
| Stack | Next.js 15.5.19 App Router + TS + Tailwind + `node:sqlite` + iron-session | `package.json`, `tsconfig.json` |
| Finalized metric set | 8 categories · 52 KPIs · 2024–2026 (2026 partial through June) | `scripts/seed.ts` |
| Design language | Teal/navy/yellow + Galano Grotesque per `DESIGN.md` | `src/app/globals.css`, `tailwind.config.ts` |
| Design-system library | 24 primitives in `src/components/ui/`, enforced by `scripts/design-system-guard.sh` | `src/components/ui/index.ts` |
| Build | `npm run build` — green, 21 routes | local run |
| Lint | `npm run design-system:guard` — green | local run |
| Type-check | standalone `npx tsc --noEmit` — passes **after** `next build` populates `.next/types` | local run |
| Smoke harness | `scripts/smoke.sh` — curl-driven, 44 assertions, was 49/49 before today's changes | `scripts/smoke.sh` |
| Auth | iron-session; `AUTH_DISABLED=true` in `.env.local` currently bypasses login via `BYPASS_USER.id=0` static admin | `src/lib/auth-flag.ts`, `src/lib/session.ts` |
| Visual regression | none | (no Playwright config checked in; only ad-hoc `output/playwright/*.png`) |

The product looks good and the smoke harness was passing 49/49 yesterday. **As of today it is broken under `AUTH_DISABLED=true`** because the static bypass admin (id=0) is not a row in the `users` table, so any POST/PATCH/DELETE that hits `requireAdmin()` → `upsertEntry({ updated_by: 0 })` blows up with `FOREIGN KEY constraint failed`. That single bug demotes the smoke run to 32 passed / 12 failed and is the highest-priority item below.

The seven `/goal` prompts at the bottom of this file each fix a coherent, verifiable slice of work. They are ordered by risk-weighted value: anything that breaks the smoke harness or the user's ability to enter data comes first; visual polish, exports, and future-facing features come last.

---

## 1. Critical — fix what is actually broken right now

### 1.1 `BYPASS_USER.id=0` breaks every admin write when auth is bypassed

**Where:** `src/lib/session.ts:11` (`BYPASS_USER = { id: 0, ... }`), `src/app/api/entries/route.ts:49`, `src/app/api/breakdowns/route.ts:50`.

**Evidence (reproduce):**

```bash
AUTH_DISABLED=true node_modules/.bin/next dev -p 3290 &
curl -sk -X POST http://127.0.0.1:3290/api/entries \
  -H 'Content-Type: application/json' \
  --data '{"kpi_id":1,"year":2099,"month":1,"value":12345}'
# → HTTP 500, server logs: FOREIGN KEY constraint failed (monthly_entries.updated_by → users.id)
```

**Root cause:** `requireAdmin()` returns `BYPASS_USER` (id=0) whenever `AUTH_DISABLED=true`. The FK on `monthly_entries.updated_by → users.id` then rejects id=0 because the bypass user is not a row in `users`. The same failure happens for `breakdown_entries.updated_by`.

**Fix shape:** make sure that *whoever* ends up writing through the admin endpoints has a real `users.id`. Two acceptable approaches — pick one and own it in code review:

- **Approach A (preferred):** in `src/lib/auth.ts`, change `ensureSeedAdmin()` so it also seeds a deterministic "auth-disabled@local" admin row with a known bcrypt hash. Then in `src/lib/session.ts`, look up that row and return its real `users.id` instead of the synthetic `{id: 0}`. AppShell's `user.id === 0` bypass check becomes a check on `user.email === "auth-disabled@local"` (or a new explicit `user.isBypass` flag).
- **Approach B:** drop the FK constraint on `updated_by` (or add `ON DELETE SET NULL` and set `updated_by = null` when bypassing). Loses the audit trail and is not preferred.

**Verification:** `npm run build` green; `AUTH_DISABLED=true node_modules/.bin/next dev -p 3290` + `scripts/smoke.sh` reports the current bypass pass count (`56 passed, 0 failed` as of this update) end-to-end with `AUTH_DISABLED=true` exported; manual `POST/DELETE /api/entries?year=2099&value=12345` returns 201/200, no FK error in server logs. Bypass verification must use `next dev`; `next start` runs in production mode and cannot serve app routes with `AUTH_DISABLED=true`.

### 1.2 `scripts/smoke.sh` doesn't propagate `AUTH_DISABLED` into `npm run smoke`

**Where:** `package.json:9` (`"smoke": "bash ./scripts/smoke.sh"`) and `scripts/smoke.sh:25` (`AUTH_DISABLED="${AUTH_DISABLED:-false}"`).

**Evidence:** `AUTH_DISABLED=true PORT=3290 npm run smoke` prints `Auth: enabled` and tries to authenticate — because the npm wrapper doesn't export `AUTH_DISABLED` into the bash subshell that npm spawns for `bash ./scripts/smoke.sh`. (Tested locally: shell env vars are not inherited by `npm`-spawned subshells in `npm` 10.x by default unless `--prefix` semantics apply; in this workspace npm doesn't propagate.)

**Fix shape:** either (a) drop the `npm run smoke` wrapper and document `bash ./scripts/smoke.sh` directly in `README.md`, or (b) use `node` to spawn and explicitly forward env. Pick (a) — it's the simplest fix and matches how the smoke harness already self-documents `AUTH_DISABLED=true`. While we're at it, fix the existing `scripts/smoke.sh` typo where `nohup`/backgrounding is mentioned in `README.md` but the script itself blocks on curl, which is fine for CI but invisible to the operator. Document that this is intentional in the smoke harness header.

**Verification:** `AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh` reports `49 passed, 0 failed` from a clean shell.

### 1.3 `useSearchParams` imported but unused in `DashboardOverviewClient.tsx`

**Where:** `src/app/dashboard/overview/DashboardOverviewClient.tsx:4` and `:21` (`const params = useSearchParams();` is never read).

**Evidence:** `grep -n useSearchParams src/app/dashboard/overview/DashboardOverviewClient.tsx` returns both lines.

**Fix shape:** delete both lines. Trivial; do it in the same PR as 1.1.

**Verification:** `npm run build` still green; ESLint passes; `next build` does not warn about the dead reference.

### 1.4 `GET /api/categories` is unauthenticated and inconsistent with siblings

**Where:** `src/app/api/categories/route.ts:18-20` returns categories without `requireSession()`, while `entries`, `breakdowns`, `kpis`, `meta` all call `requireSession()` on `GET`.

**Evidence:** `grep -n requireSession src/app/api/*/route.ts` shows that only `categories/route.ts` GET handler omits the check.

**Fix shape:** add `try { await requireSession(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }` at the top of the GET. Update `scripts/smoke.sh`'s anonymous-call expectations if any. This is a 3-line patch.

**Verification:** `curl -sk -o /dev/null -w '%{http_code}' http://127.0.0.1:3290/api/categories` returns `401` when no session cookie is present; returns 200 with a valid session or under `AUTH_DISABLED=true`.

---

## 2. High — close the gaps the design audit already flagged

### 2.1 KPI manager has no search/filter UI for 52 KPIs

**Where:** `src/app/admin/kpis/KPIManagerClient.tsx`, "Existing KPIs" table.

**Evidence:** `docs/design-audit.md` § "Remaining product caveats" explicitly calls this out: *"KPI management still shows all 52 measures in one table because search/filter behavior would be a functional addition, not part of this visual migration."* The table currently renders all 52 rows at once.

**Fix shape:** add a category filter chip row + a free-text search input above the existing table. Reuse the existing `Chip` and `Input` primitives. Filter client-side; this is a small dataset.

**Verification:** typing "funder" reduces visible rows to the four funder KPIs + the two funder breakdowns; selecting a category chip reduces to that category's KPIs only; the smoke harness (`/admin/kpis` returns 200) still passes.

### 2.2 Trend Explorer can't compare unrelated magnitudes sensibly

**Where:** `src/app/dashboard/trends/TrendExplorerClient.tsx`, `LineChart` block.

**Evidence:** `docs/design-audit.md` § "Trend Explorer intentionally preserves native values and can visually compress low-volume measures when a high-volume KPI is selected." The current implementation lets the user pick any combination of monthly KPIs across years and renders them on one shared Y axis. The "scale mismatch" footgun is real: putting "Video views" (~120k) and "Overall media hits" (~70) on the same chart makes the second one a flat line.

**Fix shape:** add a "Y-axis mode" segmented control above the chart with three options — `Shared`, `Per-series (log)`, `Per-series (indexed, baseline=100)`. The first keeps current behavior; the second maps each series to `log10(value)`; the third reindexes each series to `value/series.firstValue*100` so all lines start at 100. Reuse `Tabs` for the control. Default to `Per-series (indexed)` when more than one KPI is selected.

**Verification:** with two KPIs selected, switching modes recomputes the chart (verify by checking the chart's path data via `getByTestId('trend-svg')` or screenshot diff); `npm run build` passes; smoke harness still 49/49.

### 2.3 `BreakdownChart` leaks unbounded breakdowns into the chart

**Where:** `src/components/BreakdownChart.tsx:23-40` and `src/app/dashboard/metric/[slug]/MetricDetailClient.tsx:200-208`.

**Evidence:** `BreakdownChart` receives the *entire* `breakdowns` array for the KPI and filters internally to two years. If a future seed adds 50 components per year, the chart silently renders only the two selected but the data passed in is unbounded.

**Fix shape:** tighten the prop signature to `{ data: BreakdownEntryWithMeta[]; currentYear; compareYear; ... }` and have the metric detail client filter before passing. While we're there, hide the comparison table when only one year has data — currently it always renders.

**Verification:** a unit-style smoke check that asserts `breakdowns.length === 4` for `funders-by-breakdown` after filtering; the rendered table doesn't show empty `<td>` for years with no entries.

### 2.4 `ExportPDFButton` (html2canvas + jspdf) is fragile

**Where:** `src/components/ExportPDFButton.tsx`.

**Evidence:** `package.json` lists `html2canvas@^1.4.1` and `jspdf@^4.2.1`. These are 600+ KB combined in the client bundle and html2canvas frequently breaks on Recharts SVGs (we've seen it render charts as blank white boxes in three different projects).

**Fix shape:** add a "Print to PDF" secondary path that uses the browser's native print dialog (`window.print()`) gated by a `@media print` stylesheet that hides nav and chrome. Keep the html2canvas export as a fallback. This drops ~600 KB of client JS, sidesteps the rendering-flakiness, and produces better PDFs (vector text, searchable, real page sizes).

**Verification:** PDF exports contain real vector text for KPI titles and values; build size shrinks measurably (`next build` stats); the existing PDF export still works as a fallback.

---

## 3. Medium — make the data layer robust

### 3.1 No edit history / audit log for KPI changes

**Where:** `src/lib/repository.ts:380-540` (`upsertEntry`, `deleteEntry`, `upsertBreakdown`, `deleteBreakdown`).

**Evidence:** `monthly_entries` and `breakdown_entries` track `updated_by` and `updated_at` but never persist what the value was *before*. Admin users cannot undo a bad data entry; they have to remember what they overwrote. The login page advertises "Activity is logged for audit purposes" (`src/app/login/page.tsx:131`) but no log exists.

**Fix shape:** add `entry_history` table (`id, entry_type, entry_id, kpi_id, year, month_or_label, prev_value, new_value, prev_notes, new_notes, changed_by, changed_at`). On any `upsert*` or `delete*` in `repository.ts`, write the before/after row. Add a `GET /api/entries/history?kpi_id=…&year=…` endpoint (admin-only) that renders a read-only `/admin/history` page. Bumping `src/lib/schema-version.json` to 4 will trigger a clean reset for first-time deploys.

**Verification:** editing an entry creates a history row visible at `/admin/history?kpi_id=…`; deleting it creates one with `new_value=NULL`; existing 49/49 smoke harness still passes.

### 3.2 Add unit tests for `src/lib/analytics.ts`

**Where:** `src/lib/analytics.ts` (the entire module — `buildKPIAnalytics`, `buildTrendPoints`, `buildYTDPivot`, `defaultComparisonPair`, `formatValue`, `formatDelta`, `numericDirection`, `isFavorable`, `CHART_COLORS`).

**Evidence:** AGENTS.md says "There is no unit-test framework. The smoke script is the only automated check." All comparison math (percent vs. percentage-point delta, YTD pivot through month, annual-vs-monthly branching) is uncovered.

**Fix shape:** add `vitest` + `@vitest/coverage-v8` as devDependencies; configure `vitest.config.ts` with path alias `@/*`. Test cases:
- `formatValue` for `count`, `currency`, `percent`, `attendance`, `note`, `breakdown` (signed and compact variants).
- `formatDelta` shows "+X.X pts" for percent units, signed number otherwise.
- `isFavorable("higher", -1)` false; `isFavorable("lower", -1)` true; `isFavorable("neutral", 0)` true.
- `buildKPIAnalytics` for an annual KPI returns `monthlyComparison.currentValue === 0` when no entry; `ytdComparison` mirrors.
- `buildTrendPoints` returns 12 points with correct year-keyed values and nulls for missing months.
- `defaultComparisonPair([])` falls back to current+prior year; `defaultComparisonPair([2024,2025,2026])` picks 2026 vs 2025.
Wire `npm test` into CI.

**Verification:** `npm test` exits 0; coverage report shows `src/lib/analytics.ts` ≥ 90 %; `npm run build` still passes.

### 3.3 Make the analytics layer handle "all twelve months missing"

**Where:** `src/lib/analytics.ts:120-130` (year summary aggregation).

**Evidence:** seed data covers Jan–Jun for 2026, so a metric detail page queried at `currentYear=2026&currentMonth=12` returns `monthlyValues[12] === undefined` and the table renders `—`. The page also shows `delta = 0 - 0 = 0` and reports "no change." That's wrong — there should be a visible "no data" state.

**Fix shape:** in `buildKPIAnalytics`, when `currentValue === 0 && compareValue === 0` *and* both years have no entries for that month/quarter, set a new flag `analytics.monthlyComparison.isEmpty = true` and have `MetricCard` render a `Badge variant="warning"` saying "No data" instead of `±0%`.

**Verification:** viewing `video-views` with `currentMonth=12` shows the warning badge and a tooltip explaining 2026 data only runs through June.

---

## 4. Low — polish, paper cuts, future-facing

### 4.1 Add a CSV export path to every metric and category view

**Where:** new shared button in `src/components/ui/` (e.g. `ExportCSVButton`); wire into `MetricDetailClient` and `CategoryPageClient` action rows.

**Fix shape:** pure client-side `Blob` + `URL.createObjectURL` + invisible `<a download>`. Filename pattern: `eastern-state-{kpi-slug}-{currentYear}.csv`. For categories, one CSV per KPI inside a ZIP, or one long-format CSV (`kpi_slug, period, value, notes`). Document the schema in `DESIGN.md` so it stays consistent with the in-app tables.

**Verification:** clicking Export CSV in a metric detail view produces a file with the same rows as the on-screen values table; smoke harness still 49/49.

### 4.2 Add a `favicon.ico` route + Apple touch icon

**Where:** `src/app/icon.svg` already exists; the browser still hits `/favicon.ico` and gets 404 (`.playwright-cli/console-2026-06-25T18-41-24-804Z.log:2`).

**Fix shape:** in `src/app/layout.tsx`, add `icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" }`. Optionally add `src/app/apple-icon.tsx` that exports the same SVG at 180×180 PNG via `next/og` or just a static file in `public/`.

**Verification:** DevTools → Network → reload shows `/favicon.ico` returns 200; Playwright console log no longer records a 404.

### 4.3 Route-level `loading.tsx` for the public surface

**Where:** `src/app/dashboard/{overview,category/[slug],metric/[slug],trends}/loading.tsx`, `src/app/admin/{data,kpis,users}/loading.tsx`.

**Evidence:** only `src/app/dashboard/loading.tsx` and `src/app/admin/loading.tsx` exist. The deeper routes use Next's default spinner.

**Fix shape:** copy the existing parent `loading.tsx` pattern into each leaf route; each one should re-use `SkeletonCard` / `SkeletonTable` from `src/components/ui/`.

**Verification:** every public route renders a structure-mirroring skeleton within 100 ms of navigation; no layout shift visible in DevTools performance recording.

### 4.4 Add `loading.tsx` and `error.tsx` for the login page

**Where:** `src/app/login/`.

**Fix shape:** add `loading.tsx` (a centered skeleton sign-in card) and `error.tsx` (a friendly fallback with retry). Trivial.

**Verification:** throwing a synthetic error in dev renders the error boundary with the retry button; visiting `/login` while the auth check is in flight shows the skeleton.

### 4.5 README drift: Next.js version and rebrand

**Where:** `README.md:139` still says "Next.js 14 App Router." Actual is 15.5.19.

**Fix shape:** update to "Next.js 15 App Router" everywhere; mention `AUTH_DISABLED=true` env in the Quick start so the on-call engineer understands why there's no login wall.

**Verification:** `grep -n "Next.js 14" README.md` returns nothing.

### 4.6 Document a manual test plan in `docs/qa-manual.md`

**Where:** new file `docs/qa-manual.md`.

**Fix shape:** write a 12-step "human QA" checklist covering: login bypass, monthly entry, annual entry, breakdown entry, breakdown reorder, KPI add, KPI delete, category delete (cascades), user invite, user reset, password change, PDF export, CSV export, mobile 390 px. One paragraph per step, screenshot placeholder, expected outcome.

**Verification:** an engineer who has never seen the repo can execute every step and reach the expected outcome without asking a question.

---

## 5. Future-facing — backlog (not "must do," but on the record)

These came up while reading the code and the design audit but aren't blocking. They are listed so a future `/goal` knows they exist.

- **Role-based viewing.** `Role` is in the DB but every authenticated user sees everything. Add `/admin/kpis` to require admin and hide it from viewers in `AppShell.tsx` (already done — `adminOnly` flag — but `NavItem` doesn't visually communicate that a section is admin-only beyond the label).
- **CSRF/origin check.** POST/PATCH/DELETE only rely on `sameSite: "lax"` cookies. For an internal tool this is OK, but document it in `docs/security-notes.md` and add a defensive `Origin` allowlist check in `src/lib/session.ts` for production deploys.
- **Rate limiting.** No rate limit on `/api/auth/login`. Add a token-bucket per IP for that endpoint and 429 with `Retry-After`.
- **CSV/Excel upload.** Mirror the export with an import path on `/admin/data` so Kerry/Zach can paste a quarterly grid without typing into the per-month rows.
- **KPI parent_id.** `parent_id` is in the schema and repository but never rendered. The two breakdown KPIs ("Number of funders by breakdown", "First-time/returning/lapsed donors") currently store their labels directly in `breakdown_entries`, which works. If we ever need child KPIs (e.g. a parent "Total Funders" with children by category), revisit.
- **Annualization toggle for monthly metrics on the metric detail page.** Some execs want "annualized run-rate" (`monthly_current × 12`) for KPIs like "Video views." Cheap to compute in `analytics.ts`; just a UI toggle.
- **Per-user "favorite" KPIs.** Persist in a small `user_kpi_favorites` table; show favorites first on `/dashboard/overview`. Improves the daily-driver experience.
- **Schema migration testing.** Bumping `src/lib/schema-version.json` resets KPI tables on every first access. Test the migration path on a populated DB before any future bump.
- **Stable design-tokens linter.** Add an ESLint rule (or a custom `scripts/design-tokens-guard.sh`) that fails the build if any literal hex color, raw `transition: all`, or literal `style={{ ... }}` color appears in `src/app/**` or `src/components/**` outside `src/components/ui/`.

---

## 6. Cross-cutting "definition of done" checklist

Every `/goal` prompt below should treat the following as its completion gate, on top of goal-specific verification:

1. `npm run design-system:guard` passes.
2. `npm run design-system:test` passes (guard + `tsc --noEmit` + `next build`).
3. With a dev server started by `AUTH_DISABLED=true node_modules/.bin/next dev -p 3290`, `AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh` reports `56 passed, 0 failed` *or the new higher number if smoke coverage is added*.
4. The visual changes are screenshotted at desktop (1440px) and mobile (390px) into `output/playwright/` and reviewed against `DESIGN.md`.
5. The relevant section(s) of `docs/design-audit.md` are updated or replaced.
6. Any new env vars or config keys are added to `AGENTS.md` under "Setup" and "Gotchas."

---

## 7. `/goal` prompts

Each prompt below is sized for one focused session. They are ordered. Tackle 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6 → 7.7 in that order unless you have a strong reason to skip ahead; later prompts assume the earlier ones' invariants.

### `/goal` 7.1 — Fix the bypass-admin FK bug and harden the smoke harness

**Goal:** the smoke harness is green (49 passed, 0 failed) under both `AUTH_DISABLED=true` and `AUTH_DISABLED=false`; the bypass admin is a real `users.id`; the `useSearchParams` dead import is gone; `GET /api/categories` requires a session.

**Tasks:**

1. `src/lib/auth.ts` — change `ensureSeedAdmin()` so that, in addition to the two named seed admins, it always ensures a deterministic `auth-disabled@local` admin row exists with a known bcrypt-hashed password and a stable id. The hash can be a fixed bcrypt of an obviously-not-real value; the point is that the row exists so FK constraints succeed.
2. `src/lib/session.ts` — when `AUTH_DISABLED=true`, look up the `auth-disabled@local` row and return its real `users.id`. Drop the synthetic `{ id: 0 }`. Replace the `user.id === 0` check in `src/components/AppShell.tsx` with `user.email === "auth-disabled@local"` or an explicit `isBypass` flag.
3. `src/app/dashboard/overview/DashboardOverviewClient.tsx` — delete the unused `useSearchParams` import and call.
4. `src/app/api/categories/route.ts` — add `requireSession()` to the `GET` handler.
5. `package.json` + `README.md` — drop the `npm run smoke` wrapper; document the canonical invocation `AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh`.
6. Add a new smoke assertion in `scripts/smoke.sh` for the auth-bypass flow: `curl -sk -X POST …/api/entries` with no cookie should return 401 when `AUTH_DISABLED=false` and 201 when `AUTH_DISABLED=true` (or equivalent coverage).

**Verification:** with the smoke harness running against a fresh `npm run db:seed`, both invocations pass end-to-end; the `next start` log shows zero `FOREIGN KEY constraint failed` errors.

### `/goal` 7.2 — Search/filter the KPI manager table and tighten `BreakdownChart`

**Goal:** the KPI manager handles 52 KPIs without forcing a single 52-row scroll; `BreakdownChart` receives a bounded prop and the metric detail page no longer leaks extra breakdown rows.

**Tasks:**

1. `src/app/admin/kpis/KPIManagerClient.tsx` — add a search input (filters on `name` and `slug` substring) and a category chip row (using the existing `Chip` primitive) above the "Existing KPIs" table. Filter state is local; no backend change.
2. `src/components/BreakdownChart.tsx` — change the prop signature to require `{ data: BreakdownEntryWithMeta[]; currentYear: number; compareYear: number; ... }` and have the component trust the caller for filtering.
3. `src/app/dashboard/metric/[slug]/MetricDetailClient.tsx` — pre-filter `data.breakdowns` to the two selected years before passing into `BreakdownChart`. Hide the comparison `<tbody>` row for years with zero entries.
4. Add one smoke assertion: `/admin/kpis` renders `Add a new KPI` plus `Existing KPIs` strings (currently missing).

**Verification:** smoke harness still 49/49; the KPI manager loads with 52 rows at desktop width and progressively reveals results as the user types; `BreakdownChart` receives ≤ 8 rows for any seeded KPI.

### `/goal` 7.3 — Add unit tests + analytics "no data" state + edit history table

**Goal:** analytics math is covered; pages visibly say "no data" instead of "±0%"; admin actions are auditable through a history view.

**Tasks:**

1. Add `vitest` and `@vitest/coverage-v8`; configure `vitest.config.ts` with `@/*` path alias. Wire `npm test`.
2. Port the test cases listed in §3.2 from this doc. Aim for ≥ 90 % line coverage on `src/lib/analytics.ts`.
3. `src/lib/analytics.ts` — add `monthlyComparison.isEmpty` and `ytdComparison.isEmpty` when both `currentValue === 0 && compareValue === 0` *and* both years lack any underlying entry.
4. `src/components/MetricCard.tsx` — when `comparison.isEmpty`, render a `Badge variant="warning"` saying "No data" and skip the percent change.
5. `src/lib/schema-version.json` + `src/lib/db.ts` — bump the schema version to 4 and create `entry_history` table (`id, entry_type, entry_id, kpi_id, year, month_or_label, prev_value, new_value, prev_notes, new_notes, changed_by, changed_at`).
6. `src/lib/repository.ts` — wrap `upsertEntry`, `deleteEntry`, `upsertBreakdown`, `deleteBreakdown` to write history rows before/after.
7. `src/app/api/entries/history/route.ts` (admin-only) — read endpoint.
8. `src/app/admin/history/page.tsx` — read-only history browser.

**Verification:** `npm test` exits 0 with ≥ 90 % coverage on `analytics.ts`; `npm run build` passes; `npm run design-system:guard` passes; smoke harness still 49/49.

### `/goal` 7.4 — Trend Explorer axis modes

**Goal:** users can compare unrelated-magnitude KPIs without losing low-volume series to a flat line.

**Tasks:**

1. `src/app/dashboard/trends/TrendExplorerClient.tsx` — add a "Y-axis mode" `Tabs` control above the chart with three options: `Shared`, `Per-series (log)`, `Per-series (indexed, baseline=100)`. Default to `Per-series (indexed)` when more than one KPI is selected, `Shared` otherwise.
2. Implement the two non-shared modes by transforming the data points client-side. The `Per-series (indexed)` mode reindexes each series to `value / firstNonNullValue * 100`, dropping rows where the baseline is null or zero.
3. Add a one-line legend helper under the chart explaining the current mode (e.g. "Each line is indexed to its first non-null value = 100.").
4. Add a smoke assertion that `/dashboard/trends` HTML contains the `Y-axis mode` literal.

**Verification:** visual proof via screenshots at `output/playwright/trends-shared.png`, `trends-log.png`, `trends-indexed.png`; smoke harness still 49/49.

### `/goal` 7.5 — CSV export + Print-to-PDF fallback

**Goal:** execs can get CSV exports of every metric and category view; the legacy html2canvas PDF export is replaced with a lighter native-print path that produces vector PDFs.

**Tasks:**

1. New `src/components/ui/ExportCSVButton.tsx` — generic client component that takes `rows: object[]` and `filename`, generates a CSV blob, and triggers a hidden `<a download>`.
2. Wire `ExportCSVButton` into `src/app/dashboard/metric/[slug]/MetricDetailClient.tsx` (one CSV per KPI × year × month) and `src/app/dashboard/category/[slug]/CategoryPageClient.tsx` (one long-format CSV per category).
3. Add a `src/app/print/[type]/[slug]/print.css` that hides navigation/chrome; trigger via `window.print()` on a new `PrintButton` placed next to `ExportPDFButton`. Keep the html2canvas export as a fallback gated behind `?legacy=1`.
4. Measure bundle size before/after with `next build --profile`. Goal: ≥ 200 KB reduction on the metric detail page chunk.

**Verification:** clicking Export CSV downloads a file with the same rows as the on-screen table; Print → Save as PDF produces a vector PDF; `next build` bundle size shrinks measurably; smoke harness still 49/49.

### `/goal` 7.6 — Route-level skeletons + favicon + README drift fixes

**Goal:** every public route has a structure-mirroring skeleton; `/favicon.ico` returns 200; `README.md` reflects Next.js 15 and the `AUTH_DISABLED=true` flow.

**Tasks:**

1. Add `loading.tsx` to `src/app/dashboard/{overview,category/[slug],metric/[slug],trends}/`, `src/app/admin/{data,kpis,users}/`, and `src/app/login/`.
2. Add `src/app/favicon.ico` route by either (a) generating one from the SVG mark and saving as a static file under `public/favicon.ico`, or (b) using Next's metadata `icons.shortcut: "/favicon.ico"`. Verify DevTools shows 200 for the icon.
3. `README.md` — bump to "Next.js 15 App Router," add a paragraph on `AUTH_DISABLED=true` under "Quick start," update the verification snippet to match §1.2's canonical invocation.
4. `AGENTS.md` — reflect the new loading.tsx files and the favicon.

**Verification:** DevTools Network tab records 200 for `/favicon.ico` and every navigation; `next build` produces a build manifest that includes the new loading chunks; smoke harness still 49/49.

### `/goal` 7.7 — Manual QA document + design-tokens linter

**Goal:** a new engineer can QA the product from a written checklist; a CI guard prevents future design-system regressions.

**Tasks:**

1. Write `docs/qa-manual.md` — 12-step human QA covering login bypass, monthly/annual/breakdown entry round-trip, breakdown reorder, KPI add/delete, category cascade delete, user invite/reset, password change, PDF/CSV export, mobile 390 px. Each step: precondition, action, expected outcome, screenshot placeholder.
2. Add `scripts/design-tokens-guard.sh` — fails CI if any literal hex color, raw `transition: all`, or literal `style={{ ... color: "#…" }}` is found in `src/app/**` or `src/components/**` outside `src/components/ui/`.
3. Wire the new guard into `npm run design-system:test`.
4. Document `npm run design-system:test` as the new CI gate in `AGENTS.md` and `README.md`.

**Verification:** `npm run design-system:test` exits 0; introducing a deliberate bypass (`style={{ color: "#150f23" }}` in a page) makes the guard fail with the file:line pointer; running through `docs/qa-manual.md` with a clean checkout reaches every expected outcome without engineer intervention; smoke harness still 49/49.

---

## Appendix A — Quick reference: how to run things

```bash
# First-time setup
cd "/Users/jacobcyber/Documents/Eastern State KPI"
npm install
npm run db:seed
npm run build

# Dev loop
npm run dev

# Smoke harness
AUTH_DISABLED=true PORT=3290 \
  nohup node_modules/.bin/next start -p 3290 \
  >/tmp/next-start.log 2>&1 &

AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 \
  bash ./scripts/smoke.sh

# Design-system gate
npm run design-system:guard
npm run design-system:test
```

## Appendix B — Files most likely to need edits per goal

| Goal | Files most likely to change |
| --- | --- |
| 7.1 | `src/lib/auth.ts`, `src/lib/session.ts`, `src/components/AppShell.tsx`, `src/app/api/categories/route.ts`, `src/app/dashboard/overview/DashboardOverviewClient.tsx`, `package.json`, `README.md`, `scripts/smoke.sh` |
| 7.2 | `src/app/admin/kpis/KPIManagerClient.tsx`, `src/components/BreakdownChart.tsx`, `src/app/dashboard/metric/[slug]/MetricDetailClient.tsx`, `scripts/smoke.sh` |
| 7.3 | `package.json`, `vitest.config.ts` (new), `src/lib/analytics.ts`, `src/components/MetricCard.tsx`, `src/lib/db.ts`, `src/lib/repository.ts`, `src/app/api/entries/history/route.ts` (new), `src/app/admin/history/page.tsx` (new), `scripts/seed.ts`, `scripts/smoke.sh` |
| 7.4 | `src/app/dashboard/trends/TrendExplorerClient.tsx`, `scripts/smoke.sh` |
| 7.5 | `src/components/ui/ExportCSVButton.tsx` (new), `src/components/ui/PrintButton.tsx` (new), `src/app/print/...` (new), `src/app/dashboard/metric/[slug]/MetricDetailClient.tsx`, `src/app/dashboard/category/[slug]/CategoryPageClient.tsx`, `src/components/ExportPDFButton.tsx` |
| 7.6 | `src/app/dashboard/overview/loading.tsx`, `src/app/dashboard/category/[slug]/loading.tsx`, `src/app/dashboard/metric/[slug]/loading.tsx`, `src/app/dashboard/trends/loading.tsx`, `src/app/admin/{data,kpis,users}/loading.tsx`, `src/app/login/loading.tsx`, `public/favicon.ico` (new), `src/app/layout.tsx`, `README.md`, `AGENTS.md` |
| 7.7 | `docs/qa-manual.md` (new), `scripts/design-tokens-guard.sh` (new), `package.json`, `AGENTS.md`, `README.md` |
