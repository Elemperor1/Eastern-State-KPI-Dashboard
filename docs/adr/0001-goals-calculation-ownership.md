# ADR 0001: Goals Calculation Ownership

Status: accepted
Date: 2026-07-07

## Context

Goal behavior is a high-risk part of the KPI dashboard. It includes fixed prior-year baselines, percentage and numeric targets, annual month `0` values, monthly YTD pacing, full-year completion, lower-is-better inversion, missing data, and zero-valued data.

Before this decision, the deterministic calculation rules lived inside `src/lib/repository.ts` beside SQL reads and unrelated repository operations. That made the rule harder to locate and encouraged future goal work to understand repository internals before touching business behavior.

## Decision

Goal target, progress, YTD pacing, and full-year completion calculations are owned by `src/features/goals/calculations.ts`.

Goal database reads and writes are owned by `src/features/goals/queries.ts` and `src/features/goals/mutations.ts`. Those modules read the relevant baseline, YTD, and full-year values from SQLite, then call the feature calculation module.

Goal API validation and query-param normalization are owned by `src/features/goals/validation.ts`. Production call sites import through the public `src/features/goals/index.ts` surface. `src/lib/repository.ts` does not re-export goal operations.

DB-backed goal behavior tests live with the feature in `src/features/goals/integration.test.ts`.

## Alternatives Considered

- Leave goal calculations in `src/lib/repository.ts`. This avoided movement but kept business rules inside an oversized data-access module.
- Move all goals code, including API route validation and client refresh behavior, in one change. This would better match the final architecture but would combine validation, API behavior, UI behavior, data access, and calculation movement in a larger risk surface.
- Create a generic dashboard calculation service. This would add indirection without clarifying the goals language or preserving a simple feature-oriented structure.

## Consequences

- Goal math now has direct pure unit coverage in `src/features/goals/calculations.test.ts`.
- Database integration tests continue to protect DB-backed goal behavior.
- Future goals refactor slices can move UI/server mutation boundaries behind the same feature surface without also relocating calculation, validation, or data-access rules.
- The goals feature depends on the catalog feature for KPI existence checks and test setup, and on the metrics feature for entry setup. Those are explicit cross-feature calls through public server surfaces.
