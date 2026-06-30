# Eastern State KPI Intelligence Dashboard

A production-quality internal KPI Intelligence Dashboard for **Eastern State Penitentiary Historic Site**. Built for executive leadership (Curry, Zach, and board-facing exports) to instantly understand organizational performance through intuitive visualizations, year-over-year comparisons, and clean executive summaries.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Seed the database with realistic sample data (2024–2026)
npm run db:seed

# 3. Build and run
npm run build
npm start          # production server on :3000

# Or for development
npm run dev
```

Open <http://localhost:3000> and sign in.

> **Auth bypass (temporary).** `AUTH_DISABLED=true` is set in `.env.local`, so the
> dashboard is publicly reachable in dev — `/` redirects straight to
> `/dashboard/overview` and the login form is skipped. The flag is read by
> `src/lib/auth-flag.ts`; with it on, `getSession()` returns a static admin user
> (id `0`) and the `AccountBlock` in `AppShell` hides its Logout button. To
> restore iron-session login, set `AUTH_DISABLED=false` in `.env.local` (or
> unset it) and revert the four conditional branches in `src/lib/session.ts`,
> `src/app/page.tsx`, and `src/components/AppShell.tsx`. The `/login` page,
> `/api/auth/*` routes, seeded accounts, and `requireSession`/`requireAdmin`
> call sites are all preserved — no other restoration work is needed.

### Default accounts (seeded on first DB access)

On the first run against a fresh database, `ensureSeedAdmin()` creates `kerry@easternstate.org` (admin) and `zach@easternstate.org` (viewer) with **per-install random passwords**. The plaintexts are printed to the server's stdout exactly once and are never stored in source or docs. Read the password line at first startup, rotate it through `/admin/users`, and the seed is done.

The default development workflow runs with `AUTH_DISABLED=true` and never reads the password line, so it stays out of your way.

## What you get

### Data model

Every KPI defines:

- **category** — one of the 8 finalized Eastern State categories
- **metric name**
- **unit type** — `count`, `percent`, `currency`, `attendance`, `note`, or `breakdown`
- **reporting frequency** — `monthly`, `annual`, or `flexible`
- **direction** — `higher` is better, `lower` is better, or `neutral`
- optional **notes** for context

Annual-only metrics are stored as a single full-year value (month `0`) so they never require month-by-month entry. Breakdown metrics (funder breakdowns, donor categories) use a dedicated `breakdown_entries` table keyed by label × year.

### Finalized metric set (8 categories · 52 metrics)

- **Education** — Video views, Webpage views, Lesson downloads, Virtual program attendees, States and countries represented, Teachers attending in-person PDs, Teachers attending online PDs, State/national conferences with ES presence, Educational/program partners, Overall attendance in education programs
- **Adult Programs** — Speaker program attendance onsite, Speaker program attendance online, YouTube views of videos
- **Workforce Development** — Participants in open call event, Percent completing program, Programs offered, Percent job placement at completion, Percent job placement 1 year post-graduation, Percent female, Percent justice impacted, Community partners, Awareness of workforce programs
- **Preservation** — Percent of site in triage, Articles on ES preservation work, Conferences presented, Items in collection, Percent of items in collection available online
- **Museum** — Overall museum attendance, School groups attendance, Virtual exhibit participants, Festival attendees, Media mentions during festival, Festivals with partner sponsors
- **General Awareness** — Public events as speaker, Broadcast/streaming/radio/podcast interviews, Print/online mentions, Overall media hits
- **Fundraising** — Percent cultivated as donors, Number of overall individual donors, Percent of revenue from development, **Number of funders by breakdown**, Percent of board engagement, Percent of board giving, Number of corporate sponsorships, Percent of donors retained, Percent of members converted to donors, Percent of donors converted to members, **First-time/returning/lapsed donors**
- **Economic Impact** — Total annual budget, Economic impact, Jobs held at ES, Indirect jobs via vendors

Two metrics are **breakdowns** (Number of funders by breakdown; First-time/returning/lapsed donors) and render as grouped comparison bars + tables.

### Dashboard views

- **Category overview** (`/dashboard/overview`) — executive summary card per category showing YoY improving/declining mix, top mover, and a sample-data badge.
- **Individual category pages** (`/dashboard/category/[slug]`) — every metric in the category as a direction-aware summary card, plus breakdown charts where applicable.
- **Individual metric detail** (`/dashboard/metric/[slug]`) — single-metric deep dive: summary stats, trend/YTD/annual-over-year charts, breakdown view, values table, and PDF export.
- **Trend Explorer** (`/dashboard/trends`) — multi-KPI, multi-year overlays (monthly metrics).

Comparison logic adapts to unit type:

- Monthly count/attendance/currency metrics support month-by-month, year-to-date (always January through the selected month), and trend comparisons with percent change.
- Annual metrics compare full-year values directly; YTD/through-month is hidden.
- Percent metrics show percentage-point deltas (pts) in addition to relative change.
- Direction-aware coloring marks an increase as good/bad depending on whether higher or lower is better.
- PDF export renders the current dashboard view via `html2canvas` + `jspdf`.

### Admin

- **Data entry** (`/admin/data`) — pick category, metric, and year. Monthly metrics get a 12-month grid; annual metrics get a single full-year value; breakdown metrics get editable label/value rows. Optional notes per entry.
- **KPIs & categories** (`/admin/kpis`) — add/remove KPIs (with unit type, frequency, direction) and categories without code changes.
- **Users** (`/admin/users`) — invite viewers, reset passwords.

## Architecture

| Layer       | Tech                                              |
| ----------- | ------------------------------------------------- |
| Framework   | Next.js 15 App Router + TypeScript          |
| Styling     | Tailwind CSS with a custom brand palette          |
| Database    | SQLite via Node's built-in `node:sqlite` module   |
| Auth        | `iron-session` (encrypted cookies) + `bcryptjs`   |
| Validation  | Zod                                               |
| Charts      | Recharts                                          |
| PDF export  | `html2canvas` + `jspdf` (client-side)             |
| Icons       | `lucide-react`                                    |

The schema is versioned (`meta.schema_version`); bumping the version cleanly resets KPI tables while preserving users. All sample data is flagged via `meta.sample_data` and surfaced as a "Sample data" badge throughout the UI.

## Routes

| Path                           | Purpose                                     | Auth                |
| ------------------------------ | ------------------------------------------- | ------------------- |
| `/login`                       | Sign in                                     | public              |
| `/dashboard/overview`          | Category overview (executive summary)       | viewer + admin      |
| `/dashboard/category/[slug]`   | Individual category page                    | viewer + admin      |
| `/dashboard/metric/[slug]`     | Individual metric detail view               | viewer + admin      |
| `/dashboard/trends`            | Multi-KPI, multi-year trend explorer         | viewer + admin      |
| `/admin/data`                  | Data entry (monthly/annual/breakdown)       | admin only          |
| `/admin/kpis`                  | Manage KPIs and categories                  | admin only          |
| `/admin/users`                 | Manage team members                         | admin only          |

## Verification

A repeatable smoke harness lives at `scripts/smoke.sh`. Invoke it directly (no
npm wrapper) against a running server. The canonical invocation exercises both
auth modes end-to-end:

```bash
# 1. Build the production server once.
npm run build

# 2. Smoke test the bypass-auth flow (no login required).
AUTH_DISABLED=true PORT=3290 node_modules/.bin/next start -p 3290 &
AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh

# 3. Restart in normal-auth mode and smoke test login + session handling.
AUTH_DISABLED=false PORT=3290 node_modules/.bin/next start -p 3290 &
AUTH_DISABLED=false PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh
```

It verifies the finalized metric set, all category/metric pages, through-month handling, admin pages, monthly/annual/breakdown entry round-trips, and the auth-bypass behavior of `POST /api/entries` (401 with no session when auth is enabled; 201 when the bypass is in effect).

### CI gate

`npm run design-system:test` is the **CI gate** and must pass on every PR.
It chains four checks in order; any failure aborts:

1. `scripts/design-tokens-guard.sh` — fails if any literal hex color, raw `transition: all`, or inline `style={{ ... color: "#…" }}` bypass is introduced in `src/app/**` or `src/components/**` outside the design-system library (`src/components/ui/`) and the source-of-truth `src/app/globals.css`.
2. `scripts/design-system-guard.sh` — fails if any raw `<button>` / `<input>` / `<select>` / `<table>` element or shared primitive class (`surface`, `btn-*`, `input`, `pill`, `data-table`, …) is used outside `src/components/ui/`.
3. `npx tsc --noEmit` — typecheck.
4. `npm run build` — production build.

To verify the gate locally before opening a PR:

```bash
npm run design-system:test
```

A **human-readable QA checklist** that exercises every flow the smoke harness
covers — plus mobile rendering at 390 px, exports, and the self-service
password change flow — lives at `docs/qa-manual.md`. New engineers should
walk the checklist end-to-end after their first checkout.

Latest local runs:
- `AUTH_DISABLED=true` → **47 passed, 0 failed**
- `AUTH_DISABLED=false` → **51 passed, 0 failed** (login + auth-wall checks included)

## Data model (schema)

- **categories** — slug, name, description, sort order
- **kpis** — category, optional parent, slug, name, unit label, `unit_type`, `reporting_frequency`, `direction`, description, sort order, active flag
- **monthly_entries** — KPI × year × month (1–12 monthly, 0 annual) = value + notes; unique per (kpi, year, month)
- **breakdown_entries** — KPI × year × label = value + notes; unique per (kpi, year, label)
- **users** — name, email, bcrypt-hashed password, role
- **meta** — schema version + sample-data flag
