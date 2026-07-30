# Documentation map

The documentation serves several audiences. It is a reference library, not a
book, and it should not be read from beginning to end.

## Leadership and first-time readers

Start with the [leadership guide](leadership-guide.md). It explains the
product's purpose, the four main areas, roles, first sign-in, how to interpret
results, continuing after 2029, launch decisions, and questions for the first
walkthrough without requiring technical knowledge.

## Product users

- [Leadership guide](leadership-guide.md) — plain-language orientation and
  first sign-in
- [Data Entry workflow](data-entry-workflow.md) — how an Admin completes a
  reporting cycle
- [Goal completion rules](goal-completion-rules.md) — how Goals enter summary
  percentages
- [Board export behavior](export-behavior.md) — what the visible and downloaded
  reports contain
- [Successor Plans Admin guide](successor-plans-admin-guide.md) — how an Admin
  prepares, reviews, cancels, and activates the next Strategic Plan
- [Successor Plans Viewer and Board guide](successor-plans-viewer-board-guide.md)
  — how historical plan reporting and preserved Board scope work
- [QA manual](qa-manual.md) — guided staff acceptance and release checks

## System operators

- [Local server deployment](local-server-deployment.md) — primary on-premises
  installation, backup, security, onboarding, health, and rollback runbook
- [Operator provisioning](operator-provisioning.md) — account and password
  recovery details
- [Production observability](production-observability.md) — health checks,
  logs, and incident response
- [Migration notes](migration-notes.md) — database-version decisions and
  recovery boundaries
- [Successor Plans operator runbook](successor-plans-operator-runbook.md) —
  migration rehearsal, activation recovery, and fail-closed handling
- [Successor Plans QA acceptance](successor-plans-qa-acceptance.md) — required
  lifecycle, preservation, recovery, permission, and browser acceptance proof
- [Quality and security gates](quality-and-security-gates.md) — evidence
  required before a release

These documents assume command-line and server-administration experience. A
leader should assign them to the named system operator rather than trying to
perform the steps personally.

## Product, design, and engineering

- [Product foundation](product-foundation.md) — product decisions, evidence,
  user needs, vocabulary, navigation, and constraints
- [Successor Plans leadership overview](successor-plans-leadership.md) —
  lifecycle decisions, safeguards, and leadership expectations
- [Product context](../PRODUCT.md) — concise product and design direction
- [Domain glossary](../CONTEXT.md) — precise business and implementation terms
- [Visual system](../DESIGN.md) and [design-system guide](design-system.md)
- [ADR 0022](adr/0022-canonical-strategic-plan-product.md) — current
  four-destination product boundary
- [ADR 0023](adr/0023-database-authoritative-strategic-plan.md) — database
  content authority
- [ADR 0024](adr/0024-board-role-reporting-scope.md) — Board access and scope
- [API boundary inventory](api-boundary-inventory.md) — supported service
  boundaries

The remaining ADRs, inventories, calculation specifications, security reports,
and implementation audits exist for maintainers who need evidence about a
specific decision.

## Historical material

Files explicitly labeled historical, audit, inventory, stabilization, or
report preserve decision and verification history. They may describe routes,
versions, counts, or workflows that are no longer current. They should not be
used as a user guide or deployment runbook.

When historical material conflicts with the current product, use the root
[README](../README.md), the [leadership guide](leadership-guide.md), accepted
ADRs 0022–0024, and the live product as the current source.
