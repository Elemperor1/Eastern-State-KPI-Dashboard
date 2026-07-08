# Eastern State KPI — Manual QA Checklist

This checklist lets a new engineer validate the dashboard end-to-end against a
running build without consulting the codebase. It mirrors the automated smoke
harness in `scripts/smoke.sh` but is intended for **human eyes** — every step
has a precondition, an action, an expected outcome, and a screenshot placeholder.

> **Screenshot placeholders.** Each step has an `[Insert screenshot: ...]`
> marker. When you run the checklist against a real build, paste a screenshot
> into the matching numbered slot in `docs/qa-screenshots/` (create that
> directory; it is intentionally gitignored) and link it next to the marker.

## 0. Preparation

Before starting, complete these one-time steps:

1. **Install + seed.**

   ```bash
   npm install
   npm run db:seed
   ```

   This resets the KPI tables and re-populates 2024–2026 sample data. The seed
   sets `meta.sample_data = true`, which surfaces the "Sample data" badge in
   the UI throughout the run.

2. **Build for production.**

   ```bash
   npm run build
   ```

3. **Run the server.** Two modes are documented. Bypass mode is development-only:
   `next start` runs with `NODE_ENV=production` and cannot serve app routes with
   `AUTH_DISABLED=true`.

   ```bash
   # Bypass mode (current default, dev server only — loopback-bound):
   AUTH_DISABLED=true PORT=3290 npm run dev &

   # Normal-auth mode (login form appears)
   AUTH_DISABLED=false PORT=3290 node_modules/.bin/next start -p 3290 &
   ```

   `npm run dev` (`scripts/dev.sh`) binds `next dev` to `127.0.0.1`
   automatically when `AUTH_DISABLED` is set, and `src/lib/auth-flag.ts`
   refuses startup if the bypass is enabled on a non-loopback bind. Do
   not run `next dev` directly with `AUTH_DISABLED=true` on `0.0.0.0`.

   In bypass mode, `getSession()` returns the real `auth-disabled@local` admin
   row from `users` so `/` redirects straight to
   `/dashboard/overview` and the `AccountBlock` is hidden. Every step below
   assumes bypass mode unless explicitly tagged **#auth-wall**.

4. **Confirm CI gate is green.** The QA run is meaningless if the project
   itself fails the design-system + type + build gate.

   ```bash
   npm run design-system:test
   ```

   Expect `✅ Design-tokens guard passed`, `✅ Design System guard passed`,
   then a clean `tsc --noEmit` and `next build`.

5. **Run the automated browser acceptance layer.**

   ```bash
   npm run test:e2e
   ```

   Playwright starts its own loopback-only dev server and uses the installed
   Google Chrome channel. The four serial workflows cover goal CRUD, an
   annual-entry failure/retry/restore cycle, desktop/mobile navigation, and
   representative PNG, legacy PDF, and native print-PDF output. Temporary
   goals and entries are deleted before the suite exits.

> **Conventions.** "Year" means the dropdown year (default `2025`). A
> through-month applies only to monthly KPIs; the canonical strategic set is
> annual-only. The metric pages and admin data-entry grid use the same period
> rules.

---

## Step 1 — Auth bypass / login round-trip

**Precondition.** Server is running (see §0). Browser is pointed at
`http://localhost:3290/`.

**Action.**

1. Visit `/`.
2. If `AUTH_DISABLED=true`: observe the redirect.
3. If `AUTH_DISABLED=false`: provision a known admin credential first
   (`BOOTSTRAP_ADMIN_PASSWORD=... npm run db:seed`, or
   `SETUP_ADMIN_PASSWORD=... npm run setup:admin` — see
   `docs/operator-provisioning.md`), then visit `/login` and enter those
   credentials. **Do not look for a password in the server's stdout** —
   `ensureSeedAdmin()` no longer prints any plaintext (D8AD-CAN-001). On a
   fresh bootstrap account the login will redirect to `/setup-password` to
   force a rotation before reaching the dashboard.

**Expected outcome.**

- Bypass mode: `/` 302-redirects to `/dashboard/overview`; the dashboard renders
  without a login prompt. The `AccountBlock` in the left nav is **not**
  rendered (no Logout button).
- Normal-auth mode (bootstrap account still flagged `must_change_password`):
  the login succeeds but redirects to `/setup-password`, not the dashboard,
  until the temporary credential is replaced.
- Normal-auth mode (credential already rotated): the form returns the user to
  `/dashboard/overview` on success; `/api/auth/me` then returns
  `{ id, email, name, role: "admin" }`.
- A wrong password (normal-auth mode) renders the in-form error: "Invalid
  email or password." (Or whatever the API message is — verify it is
  identical for unknown email vs wrong password, to avoid leaking which
  one matched.)
- **Secrecy check:** scan the server stdout/stderr from the seed and login
  for the known credential — it must never appear. (`src/lib/auth-secrecy.test.ts`
  automates this for `db:seed` and `setup:admin`.)

**Screenshot placeholder.** `[Insert screenshot: dashboard after redirect / login form]`

---

## Step 2 — Annual percentage entry round-trip

**Precondition.** Logged in as admin (step 1). Dashboard is on
`/dashboard/overview`.

**Action.**

1. Navigate to `/admin/data`.
2. Pick **Reimagine Visitor Experience → Interpretive Site Plan — Milestones completed on schedule**.
3. Set the year to `2099` (an out-of-range year, so the annual field is empty).
4. Type `42` into the **Annual** cell. Click **Save**.
5. Open a new tab → `/dashboard/metric/interpretive-plan-milestones-on-schedule?currentYear=2099&compareYear=2098`.
6. Confirm the current value renders as `42%`.
7. Return to `/admin/data`. Click **Clear** on the annual cell. Confirm the
   inline confirmation dialog, then verify the cell empties and the metric
   page now shows a "No data" badge for 2099.

**Expected outcome.**

- `POST /api/entries` returns `201`.
- The metric page reads `42%` in the annual values table and "Current" card.
- The API rejects the same KPI with `month = 1` as a `400` frequency/month
  mismatch; annual/flexible KPIs may only use `month = 0`.
- `DELETE /api/entries` returns `200` and the row disappears.
- An audit row appears at `/admin/history` for both the upsert and the delete,
  with `kpi=Interpretive Site Plan — Milestones completed on schedule`,
  `month=0`, `year=2099`, `changed_by=admin`.

**Screenshot placeholder.** `[Insert screenshot: admin data grid + metric page + history row]`

---

## Step 3 — Annual entry round-trip

**Precondition.** Logged in as admin.

**Action.**

1. `/admin/data`. Pick **Advance Historic Preservation → Conservation
   Management Plan — Total funds utilized for conservation**.
2. Set year to `2099`. Type `700000` into the single "Annual" cell. Save.
3. Visit `/dashboard/metric/conservation-funds-utilized?currentYear=2099&compareYear=2098`.
4. Verify the page shows the current value `$700,000`.
5. Return to `/admin/data`, clear the cell, confirm.

**Expected outcome.**

- Save returns `201`. The metric detail page shows `$700,000` as the current-year
  total. The "Through month" / YTD controls are hidden (annual metric — only
  the annual comparison is meaningful).
- Clear returns `200`; metric page shows the "No data" badge.
- `/admin/history` shows two audit rows for the upsert and delete.

**Screenshot placeholder.** `[Insert screenshot: annual cell + metric page annual view]`

---

## Step 4 — Breakdown entry round-trip

**Precondition.** Logged in as admin.

**Action.**

1. `/admin/data`. Pick **Enhance Organizational Capacity → Revenue
   Diversification — % of revenue from each major stream**
   (`unit_type: breakdown`).
2. Set year to `2099`. The grid switches to label/value rows.
3. Click **Add row**. Enter label `Test row`, value `99`. Save.
4. Visit `/dashboard/metric/revenue-by-stream?currentYear=2099`.
5. Verify the breakdown chart shows a `Test row` bar with value `99`.
6. Return to `/admin/data`. Delete the `Test row` via the row's trash icon.
   Confirm the inline dialog.

**Expected outcome.**

- The breakdown chart renders the new label alongside the seeded revenue streams.
  The values table on the metric page lists `Test row: 99`.
- Deleting the row removes it from both the chart and the values table on
  reload.
- Two audit rows in `/admin/history` (one for the breakdown POST, one for the
  DELETE). The audit row references `entry_history.breakdown_id`; the
  `entry_id` column is `NULL` for breakdown entries.

**Screenshot placeholder.** `[Insert screenshot: breakdown add row + chart + history]`

---

## Step 5 — Breakdown row add/delete (UI only — no reorder)

**Precondition.** Logged in as admin. On
`/dashboard/metric/revenue-by-stream?currentYear=2099`.

**Action.**

1. Go to `/admin/data`. Filter to **Enhance Organizational Capacity → Revenue
   Diversification — % of revenue from each major stream**, year `2099`.
2. Add three rows: `Alpha=10`, `Bravo=20`, `Charlie=30`. Save each.
3. Delete the middle row (`Bravo`). Confirm.
4. Add `Delta=40`.
5. Verify the rows remaining are `Alpha`, `Charlie`, `Delta` (the order in
   which they were created — **the breakdown UI does not currently expose
   reorder controls**; this step documents the absence intentionally).

**Expected outcome.**

- Rows render in the order they were added (insertion order).
- Delete prompts an inline confirmation ("This removes the breakdown row
  from {year}. The action cannot be undone.") and removes the row on
  confirm.
- A status banner confirms each save/delete.
- If a future change introduces reorder, add a step here covering drag-handle
  up/down and persistence across reload.

**Screenshot placeholder.** `[Insert screenshot: breakdown rows before and after delete]`

---

## Step 6 — KPI add (admin) and verify it propagates everywhere

**Precondition.** Logged in as admin.

**Action.**

1. `/admin/kpis`. On the **KPIs** tab, fill in the "Add a new KPI" form:
   - Category: **Reimagine Visitor Experience**
   - Slug: `qa-test-metric-{timestamp}` (must match `^[a-z0-9-]+$`)
   - Name: `QA test metric`
   - Unit: `visits`
   - Unit type: `count`
   - Frequency: `monthly`
   - Direction: `higher`
2. Submit. Verify a green status banner: "KPI created."
3. Reload `/dashboard/category/visitor-experience`. Confirm `QA test metric` appears in
   the category's metric grid.
4. Reload `/dashboard/metric/qa-test-metric-{timestamp}`. Confirm the page
   renders (no 404) and shows "No data" badges because no entries exist yet.

**Expected outcome.**

- A new row in the `kpis` table with the chosen fields; the slug is unique
  and lower-case.
- The metric is visible on the category page immediately (server components
  re-fetch on navigation).
- The dedicated metric page renders, even though it has zero entries — the
  page must not crash on empty data; the values table shows all 12 months as
  blank with "No data" badges.

**Screenshot placeholder.** `[Insert screenshot: KPI form + category page + metric page empty state]`

---

## Step 7 — KPI delete (admin)

**Precondition.** Logged in as admin. The KPI from step 6 still exists.

**Action.**

1. `/admin/kpis`. On the **KPIs** tab, find `QA test metric` in the existing
   list. Click its trash icon. Confirm.
2. Reload `/dashboard/category/visitor-experience`. Confirm `QA test metric` no longer
   appears.
3. Visit `/dashboard/metric/qa-test-metric-{timestamp}`. Confirm the page
   either 404s or redirects back to the category (verify the chosen
   behavior matches the current code).

**Expected outcome.**

- A green status banner: "KPI deleted."
- The metric disappears from every category-level surface.
- An audit row in `/admin/history` referencing the deleted KPI slug.

**Screenshot placeholder.** `[Insert screenshot: delete confirmation + post-delete category page]`

---

## Step 8 — Category cascade delete

**Precondition.** Logged in as admin. A throwaway test category exists
(create one at `/admin/kpis` → **Categories** tab: slug `qa-test-cat-{timestamp}`,
name `QA test category`).

**Action.**

1. `/admin/kpis`. On the **Categories** tab, delete `QA test category`.
   Confirm.
2. If the category has KPIs with live monthly/breakdown entries, confirm the
   delete is blocked with a conflict. Delete those entries first so audit
   tombstones are recorded, then retry the category delete.
3. Reload `/dashboard/overview`. Verify the deleted category is gone from the
   executive summary grid.
4. `/admin/kpis` should not include the deleted category, and
   `/dashboard/overview` should not render it in the executive summary grid.

**Expected outcome.**

- After deletion, `/admin/kpis` and `/dashboard/overview` exclude
  `qa-test-cat-{timestamp}`.
- The catalog deletion guard blocks categories with live metric entries.
  Once those dependents are gone, deleting the category removes its child
  KPIs through the schema cascade; no orphaned KPIs remain.
- `/admin/history` shows a delete audit row.

**Screenshot placeholder.** `[Insert screenshot: category delete + overview after]`

---

## Step 9 — User invite + password reset

**Precondition.** Logged in as admin (Kerry).

**Action.**

1. `/admin/users`. In the **Invite a team member** form, enter:
   - Name: `QA Viewer`
   - Email: `qa-viewer-{timestamp}@easternstate.org`
   - Password: `TempPass!2026` (8+ characters)
   - Role: `viewer`
2. Submit. Verify a green "User created." banner and the new row appears in
   the table.
3. Click the new user's **Reset password** icon. In the dialog, enter
   `NewPass!2026`. Confirm.
4. Open an incognito window. With `AUTH_DISABLED=false`, visit `/login`. Log
   in as `qa-viewer-{timestamp}@easternstate.org` with `NewPass!2026`.
5. Verify the viewer cannot see the admin nav group (Data entry, KPIs,
   History, Team).
6. With `AUTH_DISABLED=true`, repeat the verification: the incognito
   window should land on the dashboard but the admin links should be hidden
   in the side nav for a viewer role.

**Expected outcome.**

- The invite creates a row in the `users` table with a bcrypt hash.
- The password reset succeeds; logging in with the new password works.
- The viewer's nav reflects their role — `Manage` group is filtered out.
- An audit row is recorded for the invite and the reset (when
  `entry_history` is extended to cover users; if not yet implemented, note
  that as a future task).

**Screenshot placeholder.** `[Insert screenshot: invite form + user table + reset dialog + viewer nav]`

---

## Step 10 — Password change for self

**Precondition.** Logged in as a non-admin user (Kerry's account does not
have a self-service password change UI in the current build — flag this as a
known gap if it doesn't appear). If `AUTH_DISABLED=true` is active, the
`AccountBlock` is hidden, so this step can only be exercised under
`AUTH_DISABLED=false`.

**Action.**

1. With `AUTH_DISABLED=false`, provision and log in as an admin whose
   credential you set out-of-band via `BOOTSTRAP_ADMIN_PASSWORD` or
   `npm run setup:admin` (never via a stdout password line — that flow
   was removed in D8AD-CAN-001). A freshly seeded bootstrap account will
   land on `/setup-password`; use that forced-rotation page, or the
   side-nav affordance below on an already-rotated account.
2. Look in the side nav `AccountBlock` for a "Change password" affordance.
3. If present: enter current password + new password (8+ chars). Submit.
4. Log out, log back in with the new password. Confirm success.

**Expected outcome.**

- **Forced rotation (`/setup-password`):** on a `must_change_password`
  account, login and every protected page redirect to `/setup-password`;
  `requireSession`/`requireAdmin` return HTTP 403 until a new password is
  set. After a successful change, `must_change_password` clears and the
  dashboard is reachable.
- **Self-service change (`AccountBlock`):** current-password check
  passes, new password replaces the bcrypt hash, login works with the new
  password.
- **If not implemented:** the side nav only offers Logout; note this as a
  known gap and proceed.

**Screenshot placeholder.** `[Insert screenshot: AccountBlock showing Change password OR Logout-only]`

---

## Step 11 — PNG + PDF + CSV export

**Precondition.** Logged in. Start on
`/dashboard/overview?currentYear=2026&compareYear=2025&currentMonth=6`.

**Action.**

1. Click **Export PNG**, then **Export PDF**. Open both overview files.
2. Confirm the PDF is landscape Letter and has three compact pages at this
   desktop width. No category card may be split between pages.
3. Visit the annual percentage metric
   `/dashboard/metric/interpretive-plan-milestones-on-schedule?currentYear=2026&compareYear=2025`.
   Export PNG and CSV.
4. Repeat PNG/CSV for annual currency:
   `/dashboard/metric/conservation-funds-utilized?currentYear=2026&compareYear=2025`.
5. Repeat for the breakdown metric
   (`/dashboard/metric/revenue-by-stream`).
7. On metric/category pages, use **Print / PDF** for the supported native PDF
   path. To exercise the legacy raster fallback, append `legacy=1` to the
   query string; this intentionally reveals **Export PDF** on those pages.
8. Confirm the print preview is clean: no navigation, filters, or export
   buttons, and only one branded report header.

**Expected outcome.**

- PNG/PDF contain one branded report header, the active filter context, and a
  complete confidentiality footer. Long headings and labels wrap without
  clipping or colliding with values.
- Overview raster PDF has no blank pages and keeps each category-card row
  intact. Render every page to images when validating a code change; a
  successful download alone is not sufficient.
- Annual PNGs include visible KPI values, charts, legends, and values tables.
  Annual output has no through-month control; percentages use
  percentage-point deltas.
- CSV has a header row + one row for the year (annual metric) or one row per
  label (breakdown metric). Open in
  a spreadsheet — values should sort numerically and not have stray commas
  inside quoted fields.
- Print preview hides the side nav and the action buttons via the print
  stylesheet; only the metric content is visible.

**Screenshot placeholder.** `[Insert screenshot: overview PNG/PDF pages + representative metric PNG/CSV + print preview]`

---

## Step 12 — Mobile rendering at 390 px

**Precondition.** Logged in. Chrome DevTools device toolbar set to
**iPhone 14 Pro** (390 × 844 px logical, 3x DPR) — or any viewport at
exactly 390 px wide.

**Action.**

1. Visit `/dashboard/overview`. Verify:
   - Top header collapses to a hamburger menu.
   - Category cards stack vertically.
   - No horizontal scroll bar at the page level.
2. Tap the hamburger. Side drawer opens from the left. Close it.
3. Visit `/dashboard/category/visitor-experience`. Verify cards stack and toolbar
   controls wrap (year / month / compare-year dropdowns become full-width
   or wrap cleanly).
4. Visit `/dashboard/metric/interpretive-plan-milestones-on-schedule`. Verify the three stat cards
   stack, the chart resizes, and the values table scrolls horizontally
   inside its card (not the page).
5. Visit `/admin/data`. Verify the category/KPI/year filters become a
   vertical stack; the data entry grid scrolls inside its card.
6. Visit `/login` (in normal-auth mode). Verify the marketing panel is
   hidden on mobile; only the form panel renders.

**Expected outcome.**

- No element overflows the viewport at 390 px.
- The mobile drawer toggles open/closed without trapping focus on the
  hamburger (focus moves into the close button inside the drawer).
- All tap targets are ≥ 44 px tall (the design system enforces `min-h-11`
  on icon buttons and `min-h-10` on standard buttons).
- Chart tooltips remain visible and not clipped when shown on small
  screens.

**Screenshot placeholder.** `[Insert screenshot: 390px overview + drawer + category + metric + admin]`

---

## After the run

When every step has been exercised, run the automated gates one more time
to confirm the build is still green:

```bash
npm run design-system:test
AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh
```

If any step's expected outcome diverged from what you observed, file an
issue with:

- the step number
- what you observed vs. what was expected
- a screenshot
- browser + viewport
- `node --version` and the SHA of the build

This checklist should be re-run end-to-end whenever:

- a new KPI / category ships (steps 6–8 cover the lifecycle)
- the auth flow changes (step 1)
- the export pipeline changes (step 11)
- a new layout breakpoint ships (step 12)
