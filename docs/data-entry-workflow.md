# Monthly KPI Data-Entry Workflow

> Internal documentation for the Eastern State Penitentiary KPI dashboard.
> Describes who enters data, where it is entered, editing/correction behavior,
> audit logging, annual summary generation, and future automation plans.

---

## 1. Who enters data

Only **admin** users can enter or modify KPI data. The system has two roles:

| Role | Can view dashboard | Can enter/edit data | Can manage KPIs, goals, users |
|------|-------------------|---------------------|-------------------------------|
| **admin** | Yes | Yes | Yes |
| **viewer** | Yes | No | No |

The role is set per user at `/admin/users` (admin-only). The bypass user (`auth-disabled@local`, active when `AUTH_DISABLED=true` in dev) is also an admin and writes through the same paths.

Seeded admin account: `kerry@easternstate.org`. Seeded viewer: `zach@easternstate.org`. In dev with `AUTH_DISABLED=true`, no login is needed.

---

## 2. Where data is entered

All data entry happens on the **Data Entry** page at `/admin/data` (admin-only, sidebar → Manage → Data entry).

The page presents three filter controls:

1. **Category** — filter the metric list by category, or "All categories"
2. **Metric** — select the KPI to edit
3. **Year** — select the reporting year

The UI then adapts based on the KPI's `unit_type` and `reporting_frequency`:

### Monthly KPIs (`reporting_frequency = "monthly"`)

Shows 12 rows (Jan–Dec). Each row has:
- **Value** input — numeric, accepts decimals
- **Notes** input — free text, optional
- **Save** button — saves that month's value (per-field, not bulk save)
- **Clear** button (trash icon) — deletes the saved value with a confirmation dialog

A dirty indicator (left border highlight + bold Save button) appears when the on-screen value differs from the saved value.

### Annual KPIs (`reporting_frequency = "annual"` or `"flexible"`)

Shows a single row for the full-year value (`month = 0` in the database). Same value/notes/save/clear pattern as monthly.

### Breakdown KPIs (`unit_type = "breakdown"`)

Shows a variable-row table where each row is a labeled component (e.g. "Foundation funders", "Government grants"). Some breakdown KPIs are monthly (month selector appears); others are annual. Each row has:
- **Label** input — the breakdown component name
- **Value** input — numeric
- **Notes** input — optional
- **Save** / **Delete** per row
- **Add row** button to create a new breakdown component

---

## 3. Editing and correction behavior

### Saving a value

Clicking **Save** on any field sends a `POST /api/entries` (or `POST /api/breakdowns`) request with `{ kpi_id, year, month, value, notes }`. The backend uses an **upsert** (INSERT ... ON CONFLICT DO UPDATE) keyed on the natural unique key `(kpi_id, year, month)`. This means:

- **First save** creates the entry.
- **Subsequent saves** overwrite the existing value and notes in place. There is no separate "edit" or "correction" mode — the user just types the new value and clicks Save again.
- The `updated_by` and `updated_at` columns on `monthly_entries` / `breakdown_entries` are refreshed on every save.

### Clearing a value

Clicking the trash icon opens a confirmation dialog ("Clear [Month] [Year]?"). Confirming sends a `DELETE /api/entries` with `{ kpi_id, year, month }`. The row is removed from the database entirely. A cleared month shows an empty input on the data-entry page and renders as "—" on the dashboard.

### Validation

- Empty or non-numeric values are rejected client-side (Save button is disabled).
- The API validates with Zod: `value` must be a finite number, `year` in 1900–2100, `month` in 0–12.
- CSRF guard (`assertMutationRequest`) enforces same-origin, `application/json` content-type, and a double-submit `X-CSRF-Token` header on all POST/DELETE.

### No bulk import

There is currently no bulk CSV upload or paste-grid. Every value is entered one field at a time. (See §7 — future automation.)

---

## 4. Audit logging

Every save, clear, and delete operation writes a row to the `entry_history` table. This is the audit trail.

### What is logged

Each audit row captures:

| Field | Content |
|-------|---------|
| `entry_type` | `"monthly"` or `"breakdown"` |
| `entry_id` | The `monthly_entries.id` or `breakdown_entries.id` (may reference a deleted row) |
| `kpi_id` | The KPI the change affected |
| `year` | Reporting year |
| `month_or_label` | Month number (1–12, or 0 for annual) or label for breakdowns |
| `prev_value` | The value before the change (`null` if this was a create) |
| `new_value` | The value after the change (`null` if this was a delete) |
| `prev_notes` | Notes before the change |
| `new_notes` | Notes after the change |
| `changed_by` | The `users.id` of the actor |
| `changed_at` | Timestamp (UTC) |
| `kpi_name`, `kpi_slug`, `kpi_unit` | Immutable snapshot of KPI metadata at change time |
| `category_id`, `category_name`, `category_slug` | Immutable snapshot of category metadata |
| `changed_by_email` | Immutable snapshot of the actor's email |

### Immutability

The audit trail is **append-only**. No API endpoint exposes an UPDATE or DELETE on `entry_history`. The only state-changing endpoints that touch `entry_history` do so by INSERT via the metrics feature (`upsertEntry`, `deleteEntry`, `upsertBreakdown`, `deleteBreakdown`).

The KPI/category/user name columns are **immutable snapshots** frozen at the moment of the edit. If a KPI is later renamed, the audit row still shows the name it had when the edit was made. If the KPI or category is deleted, the audit row survives with its snapshot intact and a "Metadata deleted" badge in the UI.

### Transactional integrity

The upsert + read-back + history insert runs inside a single SQLite transaction. If any step fails, the entire operation rolls back — no torn audit rows. The read-back uses the natural key `(kpi_id, year, month)`, not `lastInsertRowid`, to avoid a known SQLite pitfall where ON CONFLICT updates produce a stale row id.

### Browsing the audit trail

The `/admin/history` page (admin-only, sidebar → Manage → History) renders the audit trail in a filterable, read-only table:
- Filter by category, KPI, or year (URL-synced, deep-linkable)
- Columns: When, KPI (with category chip + renamed/deleted badges), Period, Change (prev → new with Created/Updated/Deleted badge), By (actor email)
- Sorted newest-first, capped at 200 rows (max 1000)
- The API endpoint is `GET /api/entries/history` (admin-only)

### Deletion guards

KPIs and categories **cannot be deleted** while live `monthly_entries` or `breakdown_entries` still reference them. The catalog feature's `deleteKPI` / `deleteCategory` operations throw `DependentEntriesError` (HTTP 409) when dependents exist. The admin must delete the dependent entries first — each entry deletion records its own audit row — so no metadata deletion can hide a previously recorded change.

---

## 5. Annual summary generation

The dashboard does **not** generate annual summaries by rolling up monthly values into a separate annual record. Instead, annual and monthly data live in the same `monthly_entries` table, distinguished by the `month` column:

| `month` value | Meaning |
|----------------|---------|
| 0 | Annual full-year value (single entry per KPI per year) |
| 1–12 | Monthly value for that month |

### How annual values are displayed

- **Annual KPIs** (`reporting_frequency = "annual"` or `"flexible"`): the data-entry page shows a single row for `month = 0`. The dashboard reads that row directly as the full-year value.
- **Monthly KPIs**: the dashboard computes YTD (year-to-date) by summing months 1 through the selected "through month" (default = current calendar month). The full-year value is the sum of all 12 months. There is no separate annual roll-up row written to the database.

### Goal-based annual targets

Goals (managed at `/admin/goals`) define a target for a KPI in a given year. A goal's full-year target is computed from the **prior year's actual** as the baseline:

- **Percentage goals** (`goal_type = "pct"`): `target = baseline × (1 + target_value / 100)`
- **Absolute goals** (`goal_type = "number"`): `target = baseline + target_value`

If no prior-year data exists, the baseline is null and the target cannot be computed — the goal shows "—" and a message explains that prior-year data is needed.

### YTD pacing

For monthly KPIs, the YTD target is prorated: `ytd_target = full_year_target × (throughMonth / 12)`. The YTD baseline is prorated the same way so "lower is better" progress compares apples-to-apples. For annual KPIs, YTD equals full-year (no proration).

---

## 6. Data flow summary

```
Admin user
    │
    ▼
/admin/data  (UI: per-month value + notes inputs)
    │
    ▼  POST /api/entries  (or /api/breakdowns)
    │
    ▼  Zod validation + CSRF guard + requireAdmin()
    │
    ▼  metrics.upsertEntry()  — single transaction:
    │      1. Read prior value
    │      2. UPSERT monthly_entries
    │      3. Read back by natural key (not lastInsertRowid)
    │      4. INSERT into entry_history (prev → new, snapshot labels)
    │
    ▼
Dashboard pages read monthly_entries + breakdown_entries through the metrics feature
    │
    ▼  analytics.ts computes YoY %, YTD, deltas, isEmpty
    │
    ▼  MetricCard, TrendChart, BreakdownChart render
```

---

## 7. Future automation

The following are documented in `docs/roadmap.md` §5 (backlog) but are **not yet implemented**:

### CSV/Excel upload
The roadmap explicitly calls out: *"Mirror the export with an import path on `/admin/data` so Kerry/Zach can paste a quarterly grid without typing into the per-month rows."* This would let admins paste or upload a spreadsheet of monthly values instead of entering them one field at a time. No work has been done on this yet.

### Other backlog items (not data-entry-specific)
- Annualization toggle (show `monthly × 12` run-rate on metric detail page)
- Per-user favorite KPIs
- Role-based viewing refinements
- Schema migration testing

### What is already automated
- **Schema seeding**: `npm run db:seed` populates 52 KPIs across 8 categories with 2024–2026 sample data. Bumping `src/lib/schema-version.json` triggers a clean KPI table reset on next access (users preserved).
- **Bootstrap admin**: `ensureSeedAdmin()` runs at module load on every server start and creates the seed admin/viewer accounts on first DB access.
- **Production startup**: `scripts/ensure-seeded.mjs` compares the mounted DB's schema version against `src/lib/schema-version.json` and auto-seeds if needed.
- **Goal computation**: YTD pacing, full-year progress, and prorated targets are all computed server-side per request — no manual calculation needed.

There is **no scheduled data collection** (no cron, no external API polling, no automated data import from third-party systems). All KPI values are entered by hand.
