---
name: Eastern State Strategic Plan design system
description: A calm, exact, evidence-led interface for strategic review, reporting, data entry, and governance.
colors:
  brand-primary: "#209ba5"
  brand-secondary: "#005f6f"
  ink: "#003649"
  ink-press: "#001f29"
  canvas: "#ffffff"
  page: "#f5f7f8"
  surface-muted: "#e7eef0"
  surface-pressed: "#cfdadd"
  sample-accent: "#f7f242"
  border-cool: "#cfe0e3"
  border-dark: "#113e4a"
  text-secondary: "#234954"
  text-tertiary: "#557883"
  text-muted: "#7a9aa3"
  on-dark-muted: "#ffffffb8"
  on-dark-faint: "#ffffff1f"
  success-bg: "#e6f4ee"
  success-text: "#0a4f3a"
  danger-bg: "#fdecec"
  danger-hover: "#fbdede"
  danger-text: "#8a1f1f"
  info-bg: "#eaf7f8"
  info-text: "#005f6f"
  warning-bg: "#fdfbe7"
  warning-text: "#6e6c10"
  focus: "#209ba5"
typography:
  auth-display:
    fontFamily: "Galano Grotesque, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(3.25rem, 5vw, 5.5rem)"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  page-title:
    fontFamily: "Galano Grotesque, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  section-title:
    fontFamily: "Galano Grotesque, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "Galano Grotesque, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  body-strong:
    fontFamily: "Galano Grotesque, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0"
  control:
    fontFamily: "Galano Grotesque, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.14
    letterSpacing: "0.02em"
  caption:
    fontFamily: "Galano Grotesque, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "0"
  label:
    fontFamily: "Galano Grotesque, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.08em"
  micro:
    fontFamily: "Galano Grotesque, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.8
    letterSpacing: "0.06em"
  report-caption:
    fontFamily: "Galano Grotesque, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
  report-title:
    fontFamily: "Galano Grotesque, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "26.4px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  mono:
    fontFamily: "Monaco, Menlo, Ubuntu Mono, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  xl: "12px"
  xxl: "18px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  block: "48px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-text}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "24px"
  nav-link:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-dark-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "44px"
  chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  sample-badge:
    backgroundColor: "{colors.sample-accent}"
    textColor: "{colors.ink-press}"
    typography: "{typography.micro}"
    rounded: "{rounded.xs}"
    padding: "4px 8px"
---

# Design System: Eastern State Strategic Plan

## Overview

**Creative North Star: "The Evidence Instrument"**

This is an internal strategic-performance product, not a marketing site. Its
design should disappear into review, reporting, data entry, and governance
work while making the evidence behind every conclusion easy to inspect. Calm
comes from predictable structure; confidence comes from qualified states,
visible denominators, sources, Targets, and recovery—not decorative authority.

`docs/product-foundation.md` owns the product model, ADR 0022 owns the
four-destination and legacy boundary, `CONTEXT.md` owns the domain glossary,
and this file owns the visual system. `PRODUCT.md` is only the concise
Impeccable entry point. Visual work must preserve exactly Overview, Reports,
Data Entry, and Setup, with Strategic Priority and Measure as supporting
drill-downs. Reports exclusively owns Board Report, Trends, and export actions.

Overview, Data Entry, Setup, authentication, and the interactive Reports shell
use the product register. The visible Board Report and its print/export chrome
use a restrained board-facing reporting register: denser headings, explicit
report context, stable tables, and ink-friendly pagination. It is not a second
visual language and never escapes Reports.

**Key Characteristics:**

- One light product canvas with a dark navy navigation shell.
- A restrained navy/teal identity; color communicates role and state, not
  decoration.
- Bright yellow appears only on the `Sample data` disclosure.
- Flat sections and divided rows are the default; cards mark truly bounded
  objects or workflow regions.
- One dominant action per workflow region, with destructive actions separated
  and quieter until required.
- Immediate route and filter changes; motion is limited to temporary layers,
  press feedback, and progress continuity.
- Evidence, missingness, and recovery remain visible at every viewport.

### Layout and responsive structure

The standard reading width is `72rem`; Reports, Data Entry, and Setup may use
the `84rem` wide container. Desktop page gutters are `32px`; mobile gutters are
`24px`. Major product sections use up to `48px` separation; the `96px` spacing
token is reserved for authentication and other deliberately spacious identity
surfaces.

| Range | Implemented behavior |
| --- | --- |
| `1440px` and wider | Keep content bounded; do not stretch reports or forms to the viewport edge. |
| `1152–1439px` | Persistent sidebar and list/detail workspaces remain visible. |
| `992–1151px` | Narrow list/detail columns while preserving readable forms and report context. |
| `768–991px` | Preserve the desktop shell until the mobile threshold; wide tables scroll locally. |
| `640–767px` | Replace the sidebar with the mobile header and left-origin navigation drawer. |
| `576–639px` | Use single-column content and list-then-detail workspaces. |
| `320–575px` | Stack long names before values, qualified states, and actions; never clip meaning. |

At `200%–400%` browser zoom, critical workflows must reflow as narrow-screen
layouts. Tables may scroll within a named region; page-level horizontal
overflow, clipped actions, and text collisions are defects. Long Measure,
Strategic Priority, Goal, state, unit, source, note, and error strings are
normal content.

### Motion and interaction

The shared timings are `120ms` fast, `180ms` standard, and `220ms` drawer.
Entering and system response use `cubic-bezier(0.23, 1, 0.32, 1)`; progress
continuity uses `cubic-bezier(0.77, 0, 0.175, 1)`; the drawer uses
`cubic-bezier(0.32, 0.72, 0, 1)`. Animations use opacity and transform, retarget
from the current state, and never delay semantic updates.

Buttons and chips may scale to `0.96` for pointer press feedback. Centered
dialogs crossfade and scale from `0.97`; the mobile drawer translates from the
left edge. Route, drill-down, filter, report, and list changes have no entrance
animation. Reduced motion removes translation and scale, makes progress
immediate, and retains the brief color/opacity response plus every loading,
open, saving, success, failure, and disabled state.

**The Orientation Rule.** Location is communicated by breadcrumbs, headings,
selected controls, URL state, skeleton geometry, and focus—not page theater.

## Colors

The normative palette is defined in the frontmatter and implemented as CSS
custom properties in `src/app/globals.css`. Navy carries structure and primary
action, teal carries focus, information, and current chart data, and white
keeps dense evidence readable.

### Primary

- **Evidence Teal** (`{colors.brand-primary}`): current chart series, focus
  support, informational emphasis, and the final step of the optional brand
  gradient. It is not the default filled button.
- **Review Teal** (`{colors.brand-secondary}`): comparison series, quiet
  section labels, and information text.
- **Authority Navy** (`{colors.ink}`): primary text, primary buttons, active
  controls, sidebar/header canvas, and the beginning of the brand gradient.
- **Pressed Navy** (`{colors.ink-press}`): pressed or deepest code-like
  surfaces; never a second page canvas.

### Neutral

- **Evidence Canvas** (`{colors.canvas}`): all product and report content.
- **Page Ground** (`{colors.page}`): the quiet background behind bounded
  surfaces.
- **Muted Surface** and **Pressed Surface** (`{colors.surface-muted}` and
  `{colors.surface-pressed}`): toolbars, disabled controls, and tactile neutral
  feedback.
- **Cool Border** and **Dark Border** (`{colors.border-cool}` and
  `{colors.border-dark}`): input boundaries, dividers, and dark-shell
  separation. Borders are one pixel unless they are a focus indicator.
- **Secondary, tertiary, and muted text** (`{colors.text-secondary}`,
  `{colors.text-tertiary}`, and `{colors.text-muted}`): supporting hierarchy.
  Body copy must retain at least `4.5:1` contrast; do not use the muted token as
  ordinary body text.

### Semantic treatments

| Meaning | Treatment | Required wording behavior |
| --- | --- | --- |
| Informational | `{colors.info-bg}` with `{colors.info-text}` | State context or next action without implying risk. |
| Partial or incomplete | muted neutral surface with explicit text | Name what is present and what is missing; never collapse partial evidence into an error. |
| Warning | `{colors.warning-bg}` with `{colors.warning-text}` | Qualify the consequence; warnings remain softer than validation or destructive states. |
| Validation | field-level error association plus error summary/focus | Keep the draft, mark `aria-invalid`, connect the message, and move focus to the first invalid field when useful. |
| Error | `{colors.danger-bg}` with `{colors.danger-text}` | Use assertive announcement for actionable failures; say whether the draft or prior state is safe. |
| Destructive | danger button and confirmation dialog | Keep separate from the primary action and require explicit confirmation. |
| Success | `{colors.success-bg}` with `{colors.success-text}` | Announce only after server confirmation or a browser action that actually started. |

**The Sample Data Rule.** `{colors.sample-accent}` is the only bright-yellow
treatment and always names `Sample data`. Warnings, `Needs attention`, missing
Targets, and incomplete setup use softer semantic or neutral treatments.

**The Qualified State Rule.** Color never carries meaning alone. Every visible
state names its subject, such as `Setup status`, `Board status`, `Calculation
state`, or `Progress state`; the generic label `Status` is prohibited.

### Charts and print

Current-year data uses Evidence Teal, comparison data uses Review Teal, and
additional series step through navy and muted teal. Grid and axis colors remain
quiet. Yellow may not become a chart series because it is reserved for Sample
data. Every chart needs a text summary, table, or equivalent alternative; tooltips
are supplemental.

Print uses white ground, black headings, repeated table headers, preserved
report context, and visible source/caveat text. Navigation, filters, and action
chrome disappear. Color must survive grayscale through labels, borders, values,
and structure rather than hue alone.

## Typography

**Display and body font:** Galano Grotesque with system sans-serif fallbacks.

**Data/mono font:** Monaco with Menlo and Ubuntu Mono fallbacks.

Galano Grotesque carries every user-interface role so dense workflows feel
coherent. Monaco is limited to code-like values when alignment or literal data
reading benefits; tabular numerals remain the default for comparative numbers.
Regular and medium weights are preloaded; every face uses `font-display: swap`
so slow font delivery never makes product text invisible.

### Hierarchy

- **Authentication display** (`{typography.auth-display}`): the identity panel
  only. It never enters authenticated product pages; letter spacing may not be
  tighter than `-0.04em`.
- **Page title** (`{typography.page-title}`): exactly one primary page heading.
- **Section title** (`{typography.section-title}`): bounded analytical or
  workflow groups.
- **Body** (`{typography.body}`) and **body strong**
  (`{typography.body-strong}`): default product copy and emphasis. Explanatory
  prose stays within roughly `65–75ch`.
- **Control** (`{typography.control}`): primary button labels, uppercase with
  restrained tracking. Long text links stay in sentence case.
- **Caption** (`{typography.caption}`): supporting detail, hints, and metadata.
- **Label** (`{typography.label}`): field and compact section labels, uppercase
  only where the compact cadence improves scanning.
- **Micro** (`{typography.micro}`): badges and terse qualified states, never
  paragraphs or essential instructions.
- **Report caption** (`{typography.report-caption}`) and **report title**
  (`{typography.report-title}`): print/export chrome and the Board Report title
  only; these roles never shrink interactive product controls.
- **Mono** (`{typography.mono}`): code-like data only.

Headings use balanced wrapping; prose uses pretty wrapping. Long names and
source references wrap without truncating meaning. Dense report tables may use
`12–14px` supporting text where print and screen contrast remain sufficient,
but interactive controls never shrink their hit area to match the type.

**The Product Type Rule.** Authenticated screens use a compact fixed scale;
fluid display type is reserved for authentication identity panels. No display
font, oversized hero number, or marketing-style eyebrow sequence may compete
with decision evidence.

## Elevation

The system is flat by default. Spacing, one-pixel dividers, the dark navigation
shell, and tonal surfaces establish most hierarchy. Shadows mark an independent
bounded object, a temporary layer, or a state response—not every section.

### Shadow vocabulary

- **Surface:** a navy-tinted hairline, `1–2px` local lift, and a restrained
  `14px` ambient tail. Use for a bounded Card only.
- **Surface hover:** slightly stronger hairline and local lift for genuinely
  interactive card actions; static cards do not rise on pointer movement.
- **Elevated:** a restrained navy-tinted `10–15px` shadow for dialogs and
  temporary floating objects.
- **Floating:** a deeper `0.5rem 1.5rem` shadow for the mobile skip-link and
  comparable shell chrome only.

Shapes use the frontmatter radius scale: `4px` badges, `6px` fields, `8px`
buttons and menus, `12px` cards and toolbars, and `18px` large identity
containers. Full rounding is limited to circular controls, avatars, and
progress tracks. Nested surfaces use a smaller inner radius so their geometry
remains concentric.

**The Bounded Object Rule.** A card is justified only when content behaves as
one object or workflow region. Strategic Priority rows, Measure lists, report
sections, and repeated warnings default to flat groups and dividers. A card
inside a card is a defect.

**The Single Depth Rule.** Do not pair a decorative one-pixel border with a
wide soft shadow. Choose a structural border or the defined shadow token; do
not manufacture a ghost card.

## Components

All shared product primitives live in `src/components/ui/` and are imported
through `@/components/ui`. Pages and feature components do not hand-roll
buttons, inputs, selects, tables, modal focus, or primitive visual classes.

### Buttons and action hierarchy

- **Primary:** authority navy on white, minimum `44px` high, uppercase control
  type. One dominant action per workflow region.
- **Secondary:** white with a cool hairline and navy text. Use for neutral
  alternatives, filters, and dialog cancellation.
- **Ghost:** text-led and quiet; use for low-priority contextual actions.
- **Inverted/dark ghost:** limited to dark navigation chrome.
- **Danger:** muted red surface and text; use only for destructive actions and
  keep it visually separate from the primary workflow.
- **Busy:** preserve the label, expose `aria-busy`, disable duplicate
  activation, and show motion-independent progress feedback. Disabled controls
  remain legible and do not use warning or Sample colors.

Buttons, chips, tabs, icon buttons, and links have visible hover on hover-capable
pointers, `3px` focus-visible rings, pressed feedback, disabled treatment, and
at least a `40px` hit area (`44px` for primary workflow controls). Icon-only
buttons always have an accessible name.

### Forms

Inputs, selects, and textareas use a white surface, cool inset hairline, `6px`
radius, `44px` minimum height, and explicit labels. Hints and descriptions use
stable IDs; errors associate to their fields and set `aria-invalid`. Required
raw inputs, source, notes, period context, unit, and calculation meaning remain
visible. Placeholder contrast must meet body-text contrast; placeholders never
replace labels.

Save state follows `Unsaved → Saving → Saved` only after server confirmation.
Validation, network failure, and conflict return to an editable draft. Offline
state says saving is unavailable while preserving only the current in-memory
draft; it never promises persistence or synchronization. Repeated save clicks
are suppressed while the request is pending. Unsaved navigation requires an
explicit stay-or-discard choice.

### Badges, chips, and status patterns

Badges are squared, terse, and qualified. Success, error, warning, incomplete,
information, brand, and Sample variants reuse the semantic palette. Repeated
states use text and soft surfaces; excessive pills are prohibited. Chips are
interactive filters with `40px` minimum height and a clear selected state; they
must not masquerade as static badges.

### Tables and lists

Tables use real table semantics, named context, stable headers, tabular
numerals, `10–14px` supporting type, and generous row padding. Wide tables keep
their columns and scroll inside a visible local region; they do not hide columns
or force the page to overflow. Print repeats headers and avoids splitting rows
where practical. Flat divided rows are preferred for Strategic Priority,
Measure, Goal, and Activity lists.

The complete 59-Measure Board Report remains in the document and accessibility
tree. On screen, off-viewport Measure evidence uses `content-visibility: auto`
to defer layout and paint; print, PNG, and PDF preparation force every deferred
section visible before measuring or capturing it.

### Charts and progress

Chart containers use a bounded surface only when the chart is one analytical
object. Titles, Reporting Period, comparison basis, legend, empty/partial state,
and a text or table alternative remain visible. Recharts defaults are replaced
by Galano typography, quiet axes/grid, and the canonical series roles.

Progress uses a left-anchored `scaleX` transition for `180ms`; the text and
accessible value update immediately. It exposes `role="progressbar"`, minimum,
maximum, and normalized current value. Reduced motion makes the fill immediate.
Never animate the number or layout width.

### Dialogs and drawers

Dialogs use a centered elevated panel, explicit title/description, deterministic
initial focus, a focus trap, Escape handling, inert background, and opener
restoration. Destructive confirmations focus Cancel first and disable closing
while the confirmed action is pending. Rapid close/reopen retargets from the
current visual state without duplicating submissions or losing focus.

The mobile navigation drawer enters from the persistent left edge, uses the
same role-appropriate destination order, traps focus, makes the background and
skip link inert, closes on Escape/scrim/destination selection, and restores the
opener. Its enter budget is `220ms`; exit is `180ms`; the scrim is `140ms`.

### Loading, empty, and route errors

Every public route uses a structure-mirroring skeleton with stable geometry and
an accessible loading label. Skeleton motion stops under reduced motion. Empty
states say what is absent and why, and offer an action only when the current
role can perform it. Partial data renders the available evidence plus explicit
missing or excluded reasons.

The four destinations have route-level error boundaries. Error recovery uses
an assertive, focused heading, suppresses repeated retry while navigation is
pending, provides a safe route, and moves focus to restored main content after
successful recovery. Unknown Priority or Measure handling must remain plain,
safe, and non-technical.

### Export and print feedback

CSV, PNG, PDF, and print actions live only in Reports and operate on the visible
report model. Feedback distinguishes preparation, confirmed browser-action
initiation, and failure. It may say a download or print dialog started; it may
not claim that the user retained a file or completed printing. Failures name the
format and provide an actionable fallback when available.

The export header records report identity, Reporting Year/Period, generation
context, and confidentiality treatment. The footer records provenance and
timestamp. Print removes product navigation and action chrome, repeats table
headers, preserves chart visibility, and uses Letter page geometry with
`0.5in` margins.

### Keyboard, focus, and live regions

The page provides a skip link to `#main-content`, logical landmark and heading
order, visible focus, predictable focus order, and target-heading focus after
Measure-to-target navigation. Tables, charts, statuses, progress, and actions
have screen-reader names that include their subject.

Errors use assertive announcements; progress and confirmed success use polite
announcements. One stable region replaces save/export feedback so state changes
do not produce duplicate or noisy messages. Visual motion never substitutes for
an announcement, disabled state, label, or focus movement.

## Do's and Don'ts

### Do

- **Do** preserve exactly four destinations and the supporting Priority and
  Measure drill-down hierarchy.
- **Do** use `Measure` and `Strategic Priority` in product copy and qualify every
  state label.
- **Do** keep Reporting Period, comparison basis, Targets, denominators,
  sources, completeness, and caveats visible where they support a decision.
- **Do** keep Overview bounded and Reports the exclusive owner of Board Report,
  Trends, CSV, PNG, PDF, and print.
- **Do** use strategic observations as the sole current reporting truth and
  keep saves atomic and server-confirmed.
- **Do** reserve bright yellow for `Sample data`; use the softer semantic
  warning treatment everywhere else.
- **Do** route new UI through `src/components/ui/`, semantic tokens, and the
  existing motion/focus contracts.
- **Do** verify long content, `320–1920px` viewports, `200%–400%` zoom, keyboard
  operation, reduced motion, print, and browser console behavior.
- **Do** keep missing, partial, stale, offline, unavailable, saving, failure,
  and conflict states explicit and recoverable.

### Don't

- **Don't** turn the product into a generic SaaS dashboard, marketing site,
  scorecard, or ornamental data visualization.
- **Don't** add a fifth destination, a hidden Board Report surface, a second
  export owner, or a parallel reporting truth.
- **Don't** add nested-card grids, redundant containers, decorative glass,
  arbitrary gradients, side-stripe alerts, gradient text, decorative grid or
  stripe backgrounds, excessive pills, or hero-metric templates.
- **Don't** use generic `Status`, `Category`, `Metric`, `KPI`, `entry`, or
  `Configuration Gap` as unqualified product labels.
- **Don't** introduce theatrical route entrances, staggered dashboard motion,
  blur reveals, bounce, elastic easing, or animation of layout properties.
- **Don't** fake save, export, download, print, offline-sync, or conflict
  completion.
- **Don't** hide Targets, definitions, Reporting Periods, comparison basis,
  sources, missingness, status qualification, report ownership, or conflict and
  offline truth in the name of simplicity.
- **Don't** use yellow for warnings, buttons, charts, progress, or decoration;
  its scarcity as the Sample-data signal is the point.
- **Don't** shrink touch targets, mute body text below contrast requirements,
  truncate meaningful long names, or rely on color alone.
- **Don't** change the `120/180/220ms` motion vocabulary without a measured,
  documented defect and focused verification.
