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

### Default accounts (seeded on first DB access)

| Name          | Email                       | Password           | Role   |
| ------------- | --------------------------- | ------------------ | ------ |
| Kerry Sautern | `kerry@easternstate.org`    | `KerryAdmin!2026`  | admin  |
| Zach Palmer   | `zach@easternstate.org`     | `ZachView!2026`    | viewer |

Change these in production.

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

A repeatable smoke harness lives at `scripts/smoke.sh`. Point it at a running server:

```bash
npm run build
PORT=3200 node_modules/.bin/next start -p 3200 &

PORT=3200 BASE=http://127.0.0.1:3200 npm run smoke
```

It verifies the finalized metric set, all category/metric pages, through-month handling, admin pages, and monthly/annual/breakdown entry round-trips.

Latest local run: **49 passed, 0 failed**.

## Data model (schema)

- **categories** — slug, name, description, sort order
- **kpis** — category, optional parent, slug, name, unit label, `unit_type`, `reporting_frequency`, `direction`, description, sort order, active flag
- **monthly_entries** — KPI × year × month (1–12 monthly, 0 annual) = value + notes; unique per (kpi, year, month)
- **breakdown_entries** — KPI × year × label = value + notes; unique per (kpi, year, label)
- **users** — name, email, bcrypt-hashed password, role
- **meta** — schema version + sample-data flag
