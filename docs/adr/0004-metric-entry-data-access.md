# ADR 0004: Metric Entry Data Access Ownership

Status: accepted
Date: 2026-07-07

## Context

Monthly entries, annual entries, and breakdown entries are the dashboard's core metric facts. They also own one of the highest-risk persistence rules: every create, update, and delete must write an audit-history snapshot in the same transaction so historical rows remain understandable after KPI or category metadata changes.

Before this decision, those reads, writes, row mappers, available-year lookup, and audit-history write helper lived in `src/lib/repository.ts` alongside category and KPI metadata operations. That made metric data access look like a generic repository concern even though it encodes domain-specific annual month `0`, breakdown month defaults, and immutable audit snapshot behavior.

## Decision

Metric entry data access is owned by `src/features/metrics`.

The feature now exposes:

- `listEntries`, `upsertEntry`, and `deleteEntry`
- `listBreakdowns`, `upsertBreakdown`, and `deleteBreakdown`
- `listAvailableYears`
- metric entry row mappers in `records.ts`
- the internal audit snapshot writer used by metric entry and breakdown mutations

`src/lib/repository.ts` no longer exports metric entry or breakdown operations. API routes, dashboard/admin pages, seed data, and tests import the server-only public surface at `src/features/metrics/server.ts`.

The default `src/features/metrics/index.ts` barrel remains client-safe and exports period rules only. Client components must not import the server subpath.

The upsert transaction boundary remains the same: write the row, read it back by natural key, assert the key matches, record immutable history, then commit. Delete operations snapshot the prior row before removal and record a tombstone history event.

## Alternatives Considered

- Move only read queries first and leave writes in `src/lib/repository.ts`. This would reduce some imports but split one feature's read/write ownership and leave the audit transaction behavior in the old module.
- Move audit-history writing to a full audit feature immediately. That may become useful when audit browsing is extracted, but the current write helper is tightly coupled to metric entry mutations and their transaction boundary.
- Keep compatibility re-exports in `src/lib/repository.ts`. This would ease imports but create a parallel path after callers had already moved to the metrics feature.

## Consequences

- Metric entry and breakdown mutations are easier to locate and review.
- The metrics feature now depends directly on SQLite, as intended for feature-owned data access.
- The split between `@/features/metrics` and `@/features/metrics/server` prevents client components from pulling SQLite or Node built-ins into the browser bundle.
- Audit-history browsing now lives in `src/features/audit/server.ts`, preserving LEFT JOIN and snapshot semantics.
- KPI and category metadata deletion guards live in `src/features/catalog/server.ts` and count metric fact tables directly.
