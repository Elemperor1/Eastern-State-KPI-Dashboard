# ADR 0024: Board Role Reporting Scope

Status: accepted
Date: 2026-07-22

## Context

Board members need authenticated access to statistics for fifteen current focus
statements across the five strategic priorities. Generic read-only staff access
is broader: it includes every configured strategic measure and configuration
definitions used by data-entry workflows. Hiding links in the browser would not
prevent a Board account from requesting an unrelated detail page or export.

Several supplied focus statements do not yet have a dedicated durable measure.
Inventing a proxy value would misrepresent what the database actually measures.

## Decision

- Add `board` as a durable user role in schema 13.
- Keep the four-destination product boundary. Board navigation contains only
  Overview and Reports; Data Entry and Setup remain Admin-only.
- Persist the editable Board view in schema 14. Setup → Goals lets Admins show
  or hide priorities, edit Board-specific titles and focus statements, link or
  unlink active measures, preview the resulting focus list, and atomically save
  the complete configuration with optimistic revision checks.
- Bootstrap the supplied five-priority scope once for an uninitialized schema
  14 database. After the initialization marker is consumed, the database is the
  only runtime authority; startup and migration never recreate an Admin-removed
  statement, priority, or measure link.
- Apply the saved scope in the server reporting layer before calculations. The
  same scope governs Overview, Board Report, Trends, priority details, metric
  details, and JSON/CSV report export.
- Show all fifteen statements on the Board Overview. A statement with no linked
  KPI says `No linked measure yet` and contributes no invented statistic.
- Permit Board report export through `requireSession()`, then scope it using the
  authenticated role. Protect distribution-band configuration reads with
  `requireStaffSession()`; all mutations remain Admin-only.
- Record every full-scope replacement as an immutable before/after snapshot in
  Setup → Activity with the Admin actor's durable id and email snapshot.

## Consequences

- A future priority or KPI is not exposed to Board accounts merely because it is
  added to the database. An Admin must explicitly select or link it.
- Staff viewers retain their existing full read-only strategic reporting view.
- Changing a user's role revokes their current sessions through the existing
  `sessions_valid_after` watermark.
- Adding a real measure for an unmeasured Board statement requires normal Setup
  configuration plus an explicit Admin link in Board visibility; the
  application does not infer a proxy.
- Concurrent editors cannot silently overwrite each other: a stale revision is
  rejected with HTTP 409 and the Admin must refresh before retrying.
