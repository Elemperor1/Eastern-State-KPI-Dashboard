# ADR 0017: Feature-Oriented Modular Monolith

Status: accepted
Date: 2026-07-08

## Context

Eastern State KPI is one Next.js application backed by one SQLite database.
Its current requirements do not justify independent services, a generic
repository, dependency injection, an event bus, or an HTTP boundary between
server-side parts of the same application.

The previous organization spread business rules, SQL, route adapters, and page
model construction across generic `src/lib` modules and large route clients.
That made a local product change require knowledge of unrelated files.

## Decision

The application is a feature-oriented modular monolith.

- `src/features/<feature>` owns business rules, validation, named application
  operations, data access, and server-side view-model construction for that
  feature.
- `src/app` owns Next.js routing, authentication redirects, request adapters,
  and composition.
- `src/components` owns reusable product presentation and focused interactive
  components.
- `src/components/ui` owns design-system primitives.
- `src/lib` is limited to genuinely shared infrastructure or cross-cutting
  primitives such as SQLite lifecycle, session mechanics, request guards,
  formatting/analytics primitives, and application metadata.

Dependencies flow from pages and interactive components to feature operations,
then to feature rules and feature-owned data access, then to the database. A
feature may import another feature only through that feature's public root or
explicit `server` surface. Relative imports remain the normal way to access
internals within the same feature.

The public surface stays practical: a direct named module is acceptable for an
app page or component, while cross-feature dependencies use `index.ts` or
`server.ts`. No identical folder template is imposed on every feature.

`scripts/architecture-boundary-guard.sh` enforces the highest-value rules:

- server-owned code cannot call this application's own API routes;
- app/components cannot import low-level database access;
- client components cannot import server-only feature modules;
- production feature code cannot import another feature's internal file;
- calculation modules cannot depend on React, Next.js, or database code; and
- removed internal read routes cannot reappear.

## Alternatives Considered

- Keep generic repository/service modules. This hides meaningful query
  differences and recreates a central module every feature must understand.
- Introduce microservices or message-based boundaries. There is no current
  independent deployment, scaling, or integration requirement.
- Require every feature to expose one universal service class. This adds
  ceremony and vague method names without improving the current application.
- Move every shared helper into a new `shared` tree immediately. Folder churn
  would not improve ownership; existing narrow infrastructure can move only
  when a concrete ambiguity exists.

## Consequences

- Most changes should stay within one feature plus a thin app/component caller.
- SQL remains explicit and close to the feature that owns the data.
- Feature boundaries are protected without creating wrapper layers solely to
  satisfy a diagram.
- Cross-feature coordination remains visible in imports.
- New abstractions require a current duplication or complexity benefit, not a
  hypothetical future consumer.
