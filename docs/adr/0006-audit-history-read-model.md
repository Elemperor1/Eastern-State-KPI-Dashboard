# ADR 0006: Audit History Read Model Ownership

Status: accepted
Date: 2026-07-07

## Context

Audit history is a product safety feature, not a generic persistence detail. D8AD-CAN-005 requires history rows to remain visible and understandable after their source KPI or category is renamed or deleted. That means history browsing must read immutable snapshot columns from `entry_history`, use live metadata only as optional current-state context, and keep deleted metadata available as filter options.

Before this decision, the audit-history read model was the final responsibility left in `src/lib/repository.ts`. Metrics already owned audit writes inside their mutation transactions, and catalog metadata already owned deletion guards. Keeping only audit reads in a generic repository preserved behavior but left an obsolete abstraction in the codebase.

## Decision

Audit-history browsing is owned by `src/features/audit/server.ts`.

The audit feature exposes:

- `listEntryHistory`
- `listDeletedHistoryCategories`
- `listDeletedHistoryKpis`
- the `EntryHistoryFilter` input type

`listEntryHistory` filters by the immutable snapshot `kpi_id` and `category_id` columns, not by live joins. It LEFT JOINs current KPI/category rows only to populate nullable `*_current_*` fields and compute `metadata_deleted` / `metadata_renamed`. Deleted category and KPI filter options are also derived from `entry_history` snapshots with LEFT JOIN checks.

The admin history page is the user-facing adapter. It preserves the admin-only authorization path while avoiding a same-application HTTP read boundary.

`src/lib/repository.ts` has been removed rather than kept as a compatibility wrapper.

## Alternatives Considered

- Leave audit browsing in `src/lib/repository.ts`. This avoided movement but preserved a repository module after all other data access had moved to features.
- Move audit writes from `src/features/metrics/history.ts` into the audit feature at the same time. The write helper is part of metric entry mutation transactions, so moving it separately risks obscuring the transaction boundary that keeps entry writes and audit rows atomic.
- Add compatibility re-exports from `src/lib/repository.ts`. This would create a parallel path and weaken the ownership cleanup.

## Consequences

- Durable audit-history display rules are now located in the audit feature.
- The feature still reads live catalog metadata through SQL joins, but only as optional context; snapshot fields remain authoritative.
- Metric mutations continue to own audit writes inside their transactions.
- The old universal repository abstraction is gone, reducing one major source of cross-feature ambiguity.
