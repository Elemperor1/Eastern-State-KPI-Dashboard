# Eastern State KPI Intelligence Dashboard

A production-quality prototype of an internal KPI Intelligence Dashboard for **Eastern State Penitentiary Historic Site**. Built for executive leadership to instantly understand organizational performance through intuitive visualizations and year-over-year comparisons.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Seed the database with realistic dummy data
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
| Kerry Sautner | `kerry@easternstate.org`    | `KerryAdmin!2026`  | admin  |
| Zach Palmer   | `zach@easternstate.org`     | `ZachView!2026`    | viewer |

Change these in production.

## What you get

### Phase 1 — Decision-support foundation

- **Password-protected auth** with separate **admin** and **viewer** roles (`src/lib/auth.ts`, `src/lib/session.ts`)
- **Database** — SQLite (Node `node:sqlite`, file-based) with a normalized schema for users, categories, KPIs, and monthly entries (`src/lib/db.ts`, `src/lib/repository.ts`)
- **Admin data-entry interface** at `/admin/data` — month-by-month value entry, per-cell dirty tracking, edit historical entries, add notes (`src/app/admin/data`)
- **Dashboard UI** at `/dashboard/overview` — KPI summary cards, bar/line comparison charts, category rollup (`src/app/dashboard/overview`)
- **Sample data** — 7 seeded KPIs across 4 categories and 4 years (2023–2026): Website Traffic, Program Attendance, Justice 101 Participation, Tour Attendance, Active Memberships, Donations Received, Social Media Engagement (`scripts/seed.ts`)
- **Visualization framework** — Recharts + a clean, boardroom-ready design system built on Tailwind (`src/components/*`)

### Phase 2 — Polish & exporting

- **PDF export** — One-click "Export PDF" renders the entire current dashboard view to a multi-page, presentation-ready PDF (`src/components/ExportPDFButton.tsx`)
- **KPI management** at `/admin/kpis` — add/remove KPIs and categories without code changes
- **User management** at `/admin/users` — admin can invite viewers, reset passwords
- **Trend Explorer** at `/dashboard/trends` — multi-KPI, multi-year overlays
- **Three comparison modes** — Monthly, Year-to-date, Trend
- **Automatic calculations** — running YTD totals, year-over-year delta, percent change, performance indicators
- **Filters** — by KPI, category, current year, comparison year, and through-month

## Architecture

| Layer       | Tech                                              |
| ----------- | ------------------------------------------------- |
| Framework   | Next.js 14 App Router + TypeScript                |
| Styling     | Tailwind CSS with a custom brand palette          |
| Database    | SQLite via Node's built-in `node:sqlite` module   |
| Auth        | `iron-session` (encrypted cookies) + `bcryptjs`   |
| Validation  | Zod                                               |
| Charts      | Recharts                                          |
| PDF export  | `html2canvas` + `jspdf` (client-side)             |
| Icons       | `lucide-react`                                    |

The project is structured to deploy to Vercel. Because `node:sqlite` is part of Node 22+ standard library, the runtime is portable and self-contained — no native module compilation.

## Routes

| Path                    | Purpose                                     | Auth                |
| ----------------------- | ------------------------------------------- | ------------------- |
| `/login`                | Sign in                                     | public              |
| `/dashboard/overview`   | Executive KPI dashboard                     | viewer + admin      |
| `/dashboard/trends`     | Multi-KPI, multi-year trend explorer        | viewer + admin      |
| `/admin/data`           | Monthly data entry                          | admin only          |
| `/admin/kpis`           | Manage KPIs and categories                  | admin only          |
| `/admin/users`          | Manage team members                         | admin only          |

## Data model

- **categories** — `Audience Engagement`, `Programs & Education`, `Visitation`, `Development & Membership`
- **kpis** — name, slug, unit, format (`number`/`currency`/`percent`), category, sort order, active flag
- **monthly_entries** — KPI × year × month = value (with notes, last-updated user/timestamp), unique per (kpi, year, month)
- **users** — name, email, bcrypt-hashed password, role

## Verification

A repeatable smoke harness lives at `scripts/smoke.sh`. It boots up nothing of its own — point it at a running server.

```bash
# Build + start
npm run build
PORT=3200 node_modules/.bin/next start -p 3200 > /tmp/kpi.log 2>&1 &

# Wait for the listener
lsof -nP -iTCP:3200 -sTCP:LISTEN >/dev/null

# Run the smoke harness (32 checks)
PORT=3200 BASE=http://127.0.0.1:3200 npm run smoke
```

The harness verifies, against a live server:

- public login renders
- anonymous dashboard requests redirect (307) and API requests are rejected (401)
- admin login + session round-trip
- KPIs API returns the seven seeded KPIs
- overview renders every seeded KPI, the new YTD rollup, and the category strip
- all three comparison modes (`monthly`, `ytd`, `trend`) render
- the URL `currentMonth` parameter is honored end-to-end (March and November each render the correct title)
- admin pages render for admins
- monthly entries round-trip via POST then DELETE

Latest local run (verified via `npm run smoke`): **32 passed, 0 failed**.

### Manual proof — June 2026 vs June 2025

After seeding and starting the server:

```bash
# Log in as the seeded admin
curl -sk -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  --data \'{"email":"kerry@easternstate.org","password":"KerryAdmin!2026"}'

# Inspect any KPI by category and year
curl -sk -b cookies.txt 'http://localhost:3000/api/entries?kpi_id=9&year=2026'
# Returns the Website Traffic monthly values for 2026
```

The seeded Website Traffic KPI for June 2026 is **97,200 sessions** versus **88,400 in June 2025** (+9.95% YoY). The dashboard's summary card surfaces that comparison directly under "Website Traffic".
