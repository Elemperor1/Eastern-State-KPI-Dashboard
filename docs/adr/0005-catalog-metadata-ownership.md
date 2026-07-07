# ADR 0005: Catalog Metadata Ownership

Status: accepted
Date: 2026-07-07

## Context

Category and KPI metadata define the finalized metric catalog: names, slugs, category ordering, KPI ordering, reporting frequency, units, parent relationships, and active state. They also own the metadata deletion guard required by D8AD-CAN-005: a KPI or category with live monthly or breakdown entries cannot be deleted until those entries are explicitly deleted and their audit tombstones are written.

Before this decision, the catalog reads, writes, and deletion guards lived in `src/lib/repository.ts` beside audit-history browsing. That kept the code working, but made the catalog look like a generic repository detail even though it is a product-owned feature surface used by admin metadata pages, dashboard lookup pages, seed data, goals, and audit-history filters.

## Decision

Category and KPI metadata data access is owned by `src/features/catalog/server.ts`.

The catalog feature exposes:

- category listing, lookup, create, update, and delete operations
- KPI listing, lookup, child lookup, create, update, and delete operations
- `DependentEntriesError`
- dependent-entry counting for KPI and category deletion guards

API routes remain adapters around this feature surface. They still enforce the approved `requireSession` / `requireAdmin` path, `assertMutationRequest` CSRF guard, zod validation, and existing HTTP response shapes, including 409 conflicts for dependent entries.

`src/lib/repository.ts` no longer exports catalog operations. Audit-history browsing has since moved to `src/features/audit/server.ts`, so the obsolete repository module has been removed.

## Alternatives Considered

- Split categories and KPIs into separate features immediately. The tables and operations are tightly coupled through ordering, joins, parent relationships, and deletion blast-radius checks, so a single catalog feature is simpler for the current product.
- Keep compatibility re-exports in `src/lib/repository.ts`. That would preserve two import paths for the same metadata operations and make future ownership less obvious.
- Move audit-history browsing at the same time. Audit browsing has its own LEFT JOIN and immutable snapshot requirements, and was extracted in the next focused slice.

## Consequences

- Developers can find metadata reads, writes, and deletion rules in one feature-owned module.
- Goals and dashboard pages now call catalog lookups through an explicit public server surface.
- The deletion guard still counts live `monthly_entries` and `breakdown_entries` directly and still fails closed with `DependentEntriesError`.
- Audit-history browsing now lives in `src/features/audit/server.ts`, preserving deleted/renamed metadata display behavior.
