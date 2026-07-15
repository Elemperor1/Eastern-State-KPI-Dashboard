# Product context

`PRODUCT.md` is the concise Impeccable entry point. It does not replace the
canonical hierarchy: [product foundation](docs/product-foundation.md) owns the
cross-layer product model, [ADR 0022](docs/adr/0022-canonical-strategic-plan-product.md)
owns the four-destination and legacy-archive boundary, [CONTEXT.md](CONTEXT.md)
owns the domain glossary, and [DESIGN.md](DESIGN.md) owns the visual system.

## Register

product

Overview, Data Entry, Setup, authentication, and the interactive Reports shell
use the product register. The visible Board Report, its print layout, and its
exports use a restrained board-facing reporting register inside Reports; this
is a reporting treatment, not a brand or marketing surface.

## Platform

web

## Users

Decision reviewers use the product to prepare for and participate in
strategic-performance reviews. Reporting Admins record results, resolve
definitions and Targets, manage access, and review Activity. System operators
provision, migrate, and release the application outside normal product work.
`Admin` and `Viewer` are permission roles, not personas.

## Product Purpose

Help Eastern State leadership and Board reviewers understand performance of
the 2025–2029 Strategic Plan while making missing, partial, invalid, stale, or
unresolved evidence explicit. Success means a reporting cycle can become
review-ready without silent data loss, parallel reporting truth, or
disagreement between the visible report and its exports.

## Positioning

An evidence-led strategic-performance decision-support product whose summaries,
drill-downs, data entry, governance, and exports share one reporting truth.

## Brand Personality

Calm, exact, and accountable. The interface should feel credible under dense or
incomplete data, using plain language and proportionate emphasis rather than
decorative authority.

## Anti-references

Do not turn the product into a generic SaaS dashboard, marketing site, scorecard,
or ornamental data visualization. Avoid hidden report surfaces, nested-card
grids, decorative glass or gradients, excessive pills, theatrical motion,
unqualified status labels, and any interaction that implies unconfirmed save or
export completion.

## Design Principles

1. Preserve exactly four destinations—Overview, Reports, Data Entry, and Setup—
   with Priority and Measure as supporting drill-downs.
2. Keep decision evidence visible: Reporting Period, comparison basis, Targets,
   denominators, sources, provenance, completeness, and qualified states.
3. Prefer less chrome, not less truth; keep Overview bounded and Reports the
   exclusive owner of Board Report, Trends, and exports.
4. Make consequential work honest and recoverable through atomic,
   server-confirmed saves, retained drafts, explicit failure, and predictable
   focus recovery.
5. Preserve canonical vocabulary, effective-dated meaning, immutable Activity,
   and strategic observations as the sole current reporting truth.

## Accessibility & Inclusion

Do not assert an unverified conformance level. The binding contract requires
semantic landmarks and headings, explicit labels and errors, non-color meaning,
visible focus, logical keyboard order, deterministic modal focus, 44 px targets,
named tables and chart summaries, useful live regions, reflow and zoom support,
and reduced-motion behavior that preserves every semantic state.
