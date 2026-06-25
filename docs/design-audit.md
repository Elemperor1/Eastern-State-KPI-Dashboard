# Eastern State KPI — Premium Redesign Audit & Migration Plan

> Audit date: June 25, 2026  
> Authority: `DESIGN.md` is the single source of truth. Accessibility and usability take precedence only where a literal design treatment would create an inaccessible or unusable result.

## Executive assessment

The application is functionally mature and already has a reusable component library, but its visual language does not match `DESIGN.md`. The current slate-blue dashboard resembles a generic component-library admin template: white cards on a pale gray canvas, a blue active sidebar item, many rounded containers, and a wide categorical chart palette. It is orderly, but it is not distinctive, brand-consistent, or sufficiently refined.

The redesign will preserve routing, data behavior, state, APIs, authentication, and all admin workflows. The migration will change the composition and presentation:

- Adopt the deep violet / white two-canvas system from `DESIGN.md`.
- Use Rubik for the complete product UI.
- Reduce cards and borders; use spacing and alignment to group information.
- Make the dark navigation shell the persistent brand surface.
- Keep dense analytical and transactional content on the light canvas.
- Restrict the palette to midnight violet, violet, pink, lime, white, and semantic tonal variants from those families.
- Replace one-off controls and browser dialogs with shared design-system primitives.
- Compress mobile layouts through progressive disclosure instead of stacking desktop cards indefinitely.

## Audit evidence

The audit covered:

- `/login`
- `/dashboard/overview`
- `/dashboard/category/[slug]`
- `/dashboard/metric/[slug]` for monthly, annual, and breakdown metrics
- `/dashboard/trends`
- `/admin/data` for monthly, annual, and breakdown entry
- `/admin/kpis`
- `/admin/users`
- the shared shell, chart components, loading states, feedback, tables, forms, and navigation

Baseline artifacts are stored in `output/playwright/before-*.png`.

Browser measurements at 390 px found no document-level horizontal overflow, but did reveal:

- 37 rendered elements below 12 px on metric detail.
- 23 rendered elements below 12 px on Trend Explorer.
- 27 undersized interactive targets in Trend Explorer.
- 25 undersized interactive targets in Data Entry.
- 56 undersized interactive targets in KPI management.
- A mobile overview longer than 3,000 px because eight full dashboard cards are nested inside another card.

Baseline verification:

- `npm run design-system:guard` passes.
- `npm run build` passes.
- The only console error is a missing `/favicon.ico`.
- A standalone `npx tsc --noEmit` run can fail if executed while `next build` is regenerating `.next/types`; it must be rerun after the build finishes.

## Required-reference synthesis

### `DESIGN.md`

The product must use:

- Midnight violet `#150f23` as the authoritative primary and dark canvas.
- Ink violet `#1f1633` as dark surface and light-surface text.
- White as the transactional canvas.
- Lime `#c2ef4e` as a scarce signature highlight.
- Pink `#fa7faa` and violet tones as supporting punctuation.
- Rubik for UI text and a chunky, weighty display treatment.
- Uppercase tracked button labels and eyebrows.
- 8 px primary button radii, 6 px inputs, 12 px cards, 18 px large visual containers.
- A single dominant CTA, with polarity inverted between light and dark canvases.
- Dense light transactional surfaces and spacious dark identity/feature surfaces.

### Expo professional-design principles

The redesign must improve:

- **Contrast:** one obvious focal point; not every control receives equal emphasis.
- **Hierarchy:** title, primary action, filters, data, and supporting metadata must read in that order.
- **Alignment:** shared edges and baseline alignment replace approximate card placement.
- **Proximity:** whitespace groups related information without requiring another border.
- **Repetition:** the same tokens, control heights, radii, and label treatments recur everywhere.
- **Balance:** wide charts, controls, and side panels distribute visual weight deliberately.
- **White space:** negative space is active and creates calm; it is not leftover room.
- **Unity:** every screen must feel like one product rather than a set of separately generated features.

### Interface-detail guidance

- Headings use balanced wrapping; body copy uses pretty wrapping.
- Dynamic and tabular data use tabular numerals.
- Nested rounded surfaces use concentric radii.
- Controls use optical alignment, not only geometric centering.
- Interactive motion uses interruptible CSS transitions.
- Press feedback uses `scale(0.96)`.
- Transitions specify exact properties; never `transition: all`.
- Touch targets are at least 40 × 40 px, preferably 44 × 44 px.
- Reduced-motion preferences are respected.

## Prioritized design audit

### Critical

| Finding | Screen / system | Decision |
| --- | --- | --- |
| The app ignores the visual language in `DESIGN.md` | Entire product | Replace slate/blue tokens with the violet two-canvas system before polishing individual pages. |
| Mobile workflows contain many sub-40 px targets | Trends, Data Entry, KPI Manager | Introduce a shared checkbox and enforce 40–44 px minimum control heights. |
| Native `confirm()` and `alert()` break product unity and accessibility | Admin destructive actions, PDF failure | Add a shared confirmation dialog and use in-product feedback. |
| Trend Explorer compares unrelated magnitudes in a visually unreadable chart | Trends | Preserve the data behavior, but redesign controls, legend, and guidance so the limitation is clear and the chart remains scannable. |
| Missing favicon produces a browser console error and weakens brand completeness | Global | Add a custom Eastern State mark and favicon metadata. |
| Mobile overview is excessively long and nested | Overview | Remove the outer “card around cards”; compress category cards and hide nonessential detail on small screens. |

### High

| Finding | Screen / system | Decision |
| --- | --- | --- |
| Sidebar is visually generic and disconnected from `DESIGN.md` | App shell | Make navigation the persistent midnight-violet brand canvas with a white active state. |
| Login is a centered generic form card | Login | Build a two-polarity split composition: spacious dark identity panel + focused light sign-in panel. |
| Color usage is uncontrolled and introduces teal, orange, red, cyan, green, and blue accents | Charts and category cards | Restrict categorical and comparison colors to DESIGN.md violet, pink, ink, lime, and neutral values. |
| Excessive cards and nested borders create noise | Overview, Trends, Data Entry, metric detail | Flatten grouping; reserve cards for independent surfaces and use whitespace/dividers for internal structure. |
| Page titles and body type are too small relative to the wide desktop canvas | All authenticated pages | Move to the DESIGN.md 30 px page-title tier and 16 px functional body tier. |
| Admin monthly entry uses twelve repeated cards | Data Entry | Replace with one structured entry surface containing compact month rows. |
| Filters are visually detached from the data they change | Dashboard and metric pages | Consolidate filters into a shared contextual toolbar immediately above their data. |
| Loading treatment reflects the old palette and card geometry | Route loading states | Retheme skeletons and match the final information architecture. |

### Medium

| Finding | Screen / system | Decision |
| --- | --- | --- |
| Buttons use sentence case and blue emphasis instead of the specified uppercase cadence | Shared controls | Apply tracked uppercase labels to action buttons while leaving long text links in sentence case. |
| Inputs use 8 px radii instead of the defined 6 px radius | Forms | Standardize input/select geometry and focus treatment. |
| Cards use 16–24 px radii instead of the defined 12 px product radius | Shared surfaces | Use 12 px cards and 18 px only for large visual/identity containers. |
| Checkbox UI bypasses the shared library | Trend Explorer | Add a shared checkbox primitive with a 40 px label hit area. |
| Empty-state icon composition is broken because `Avatar` ignores children | Empty states | Fix the primitive and create a dedicated icon tile instead of misusing Avatar. |
| `Table` builds a dynamic Tailwind class that cannot be statically generated | Tables | Apply dynamic minimum width through the component style API. |
| Category cards give every category an unrelated accent hue | Overview | Use one restrained violet system with pink/lime only as scarce punctuation. |
| Sample-data warning visually competes with page actions | Dashboard pages | Use a quiet square-cornered status token, not a bright outlined pill. |

### Low

| Finding | Screen / system | Decision |
| --- | --- | --- |
| Mathematical icon centering makes several button labels feel shifted | Shared buttons | Apply icon-side optical padding and consistent icon boxes. |
| Chart tooltips, legends, and axes feel like Recharts defaults | Charts | Retheme typography, spacing, tooltip surfaces, line weights, and legend layout. |
| Mobile navigation appears instantly with no spatial continuity | App shell | Add a short interruptible slide/fade transition. |
| Section eyebrows repeat too aggressively | Detail and admin pages | Keep them only where they clarify hierarchy; remove redundant labels. |

## Screen-by-screen recommendations

### `/login`

- Use a full-height split layout on desktop.
- Place brand promise and a restrained lime keyword highlight on the dark half.
- Keep the form on a white panel with one dominant dark primary button.
- Remove the floating generic avatar treatment.
- Preserve security copy, but place it with the form as quiet supporting text.

### `/dashboard/overview`

- Keep a single page title and a compact comparison toolbar.
- Remove the outer chart card around category cards.
- Use compact category summaries with a strong title, percentage, three counts, and one top-mover line.
- On mobile, hide descriptions and top-mover detail until the category page.
- Use violet-family accents rather than eight unrelated colors.

### `/dashboard/category/[slug]`

- Keep breadcrumb, page identity, and comparison toolbar aligned to one content axis.
- Replace equal-height generic cards with denser metric summaries.
- Keep breakdowns as standalone analytical surfaces.
- Use one visible primary reading path: overview metrics first, composition second.

### `/dashboard/metric/[slug]`

- Combine the four summary cards into one metric summary band with four aligned columns.
- Use stronger numeric hierarchy and quieter units.
- Reduce the number of disconnected chart containers.
- Make current-year data the strongest series; previous years recede.
- Keep the values table dense and highly legible.

### `/dashboard/trends`

- Turn the filter stack into one cohesive control rail.
- Use a shared checkbox primitive and larger hit areas.
- Replace the multi-row rainbow legend with a structured legend inside the chart header.
- Keep the chart on the light canvas and use violet/pink/lime comparison roles.
- On mobile, put filters above the chart without wrapping each filter group in a separate heavy card.

### `/admin/data`

- Treat metric selection as the screen’s primary setup action.
- Replace twelve month cards with one list/table surface.
- Show save controls only as visually primary when a row is dirty.
- Keep breakdown rows in the same structured entry grammar.
- Retain per-field saving and all API behavior.

### `/admin/kpis`

- Keep tabs, but restyle them as a compact segmented control.
- Use a restrained form surface and a denser management table.
- Move destructive actions into a consistent confirmation dialog.
- On mobile, preserve horizontal data access with a visible scroll affordance.

### `/admin/users`

- Use one invite surface and one team table.
- Keep roles as squared status tokens instead of generic pills.
- Replace browser confirmations with the shared dialog.
- Ensure action buttons remain at least 40 px.

## Design-system specification

### Color tokens

| Role | Value | Usage |
| --- | --- | --- |
| `--color-primary` | `#150f23` | Primary action, deepest canvas |
| `--color-ink` | `#1f1633` | Text on light, raised dark surface |
| `--color-canvas-dark` | `#1f1633` | Navigation and identity surfaces |
| `--color-canvas-light` | `#ffffff` | Transactional pages and forms |
| `--color-page` | `#f7f6f8` | Quiet light page ground |
| `--color-lime` | `#c2ef4e` | Scarce signature highlight |
| `--color-pink` | `#fa7faa` | Supporting emphasis and chart punctuation |
| `--color-violet` | `#6a5fc1` | Secondary comparison / selected state |
| `--color-violet-deep` | `#422082` | Dark select / highlighted surface |
| `--color-violet-mid` | `#79628c` | Tags and quiet chart series |
| `--color-hairline-dark` | `#362d59` | Dividers on dark surfaces |
| `--color-hairline-light` | `#e5e7eb` | Dividers and card boundaries |
| `--color-focus` | `#9dc1f5` | Keyboard-only focus ring |

### Typography

| Token | Specification | Usage |
| --- | --- | --- |
| Display | Rubik 60/66, 500–700 | Login identity statement only |
| H1 | Rubik 30/36, 500 | Page titles |
| H2 | Rubik 24/30, 500 | Major analytical sections |
| H3 | Rubik 20/25, 600 | Card and table-group titles |
| Body | Rubik 16/24, 400–500 | Default product UI |
| Small | Rubik 14/20, 400–600 | Buttons, labels, supporting copy |
| Caption | Rubik 14/20, 400 | Fine print and metadata |
| Micro | Rubik 10/18, 600, tracked | Nonessential uppercase status only |

All data uses tabular numerals. Headings use balanced wrapping; short body text uses pretty wrapping.

### Spacing

Use only: `4, 8, 12, 16, 24, 32, 48, 64, 96`.

- Page gutter: 24 px mobile, 32 px desktop.
- Compact card padding: 16–24 px.
- Large identity/feature padding: 32–48 px.
- Major section spacing: 48 px in product UI.
- Marketing/identity spacing: up to 96 px.

### Radius and elevation

| Element | Radius |
| --- | --- |
| Inputs | 6 px |
| Buttons / code / menus | 8 px |
| Cards / segmented controls | 12 px |
| Large identity or chart frames | 18 px |
| Status tags | 4 px |
| Circular controls only | 9999 px |

Light cards use a hairline and very restrained depth. Dark surfaces remain flat. Nested surfaces follow concentric radius math.

### Motion

- 150 ms for press, hover, and focus transitions.
- 220 ms for drawers and menus.
- Use transitions for state changes; keyframes only for one-time skeleton/loading sequences.
- Press scale is `0.96`.
- Exit motion is quieter than enter motion.
- Reduced-motion mode removes nonessential movement.

### Shared component migration

Required primitives:

- `BrandMark`
- `Button`
- `IconButton`
- `Input`
- `Select`
- `Checkbox`
- `FormField`
- `Card`
- `CardAction`
- `Badge`
- `Tabs`
- `Table`
- `PageHeader`
- `FilterToolbar`
- `StatusBanner`
- `EmptyState`
- `Skeleton`
- `ConfirmDialog`

## Implementation record

1. ✅ Replaced global tokens, fonts, chart palette, radii, shadows, and typography.
2. ✅ Added the custom mark, favicon, checkbox, filter toolbar, dialog, and confirmation dialog.
3. ✅ Rebuilt the app shell and login composition.
4. ✅ Migrated overview, category, and metric surfaces to the new hierarchy.
5. ✅ Redesigned Trend Explorer controls, legend, line roles, guidance, and responsive layout.
6. ✅ Replaced monthly card grids with structured data-entry rows.
7. ✅ Migrated KPI and user management to the same form/table grammar.
8. ✅ Replaced browser confirmations and the broken password-reset path with product-native dialogs.
9. ✅ Rethemed loading, empty, success, error, disabled, hover, focus, and pressed states.
10. ✅ Completed design-system guard, typecheck, production build, smoke, and desktop/mobile browser QA.

## Major before / after rationale

| Before | After | Rationale |
| --- | --- | --- |
| Pale gray canvas, blue active state, multicolor accents | Violet brand shell, white transactional canvas, restricted accents | Direct migration to `DESIGN.md`; stronger unity and recall. |
| Card around a grid of cards | Open section with purposeful standalone category summaries | Proximity and whitespace replace unnecessary containment. |
| Twelve monthly entry cards | One structured month-entry surface | Lower cognitive load, less scrolling, clearer alignment. |
| Centered generic login card | Dark identity panel paired with focused light form | Establishes brand, balance, and a clear primary action. |
| Four separate KPI stat cards | One aligned summary band | Values compare faster and read as one analytical statement. |
| Rainbow chart series | Role-based violet / pink / lime series | Better cohesion and a more legible comparison hierarchy. |
| Browser confirm / alert | Product confirmation dialog and status feedback | Consistent, accessible interaction language. |
| 32 px checkboxes and small icon targets | 40–44 px shared hit areas | Meets touch and keyboard usability requirements. |

## Pre-implementation quality assessment

| Dimension | Baseline | Target |
| --- | --- | --- |
| `DESIGN.md` fidelity | 2/10 | 9/10 |
| Hierarchy | 6/10 | 9/10 |
| Brand distinction | 3/10 | 9/10 |
| Mobile density | 4/10 | 8/10 |
| Accessibility | 6/10 | 9/10 |
| Component consistency | 7/10 | 9/10 |
| Interaction polish | 6/10 | 9/10 |
| Overall perceived quality | 5/10 | 9/10 |

The current product is a solid functional baseline, not a finished premium interface. The redesign is complete only when the new token system, shell, screens, responsive behavior, and interaction states all agree with `DESIGN.md`.

## Final verification

- `npm run design-system:test` — passed.
  - Design-system guard passed.
  - TypeScript passed.
  - Production build passed.
- `PORT=3300 BASE=http://127.0.0.1:3300 npm run smoke` — **48 passed, 0 failed**.
- Desktop and 390 px mobile screenshots were captured for login, overview, category, metric, trends, data entry, KPI management, and user management.
- No document-level horizontal overflow was found at 390 px.
- All reported sub-40 px elements are either:
  - the visible 20 px checkbox inside a 40 px+ clickable label, or
  - resolved by the final mobile brand-link adjustment.
- No browser `confirm()` or `alert()` calls remain.
- No raw button, input, select, or table bypasses remain outside `src/components/ui/`.
- No `transition: all` or noncanonical press scales remain.
- No literal hex colors remain in application TSX; visual values resolve through tokens.

## Final design quality assessment

| Dimension | Baseline | Final | Assessment |
| --- | --- | --- | --- |
| `DESIGN.md` fidelity | 2/10 | 9/10 | Violet/white canvas polarity, Rubik, tracked caps, scarce lime, defined radii, and dark primary actions now govern the product. |
| Hierarchy | 6/10 | 9/10 | Page identity, actions, filters, summary, analysis, and detail now read in a deliberate order. |
| Brand distinction | 3/10 | 9/10 | The custom mark, dark shell, split login, starfield identity surface, and restricted palette remove the generic dashboard-template feel. |
| Mobile density | 4/10 | 8.5/10 | Overview detail is progressively disclosed; data entry is row-based; navigation and filters are touch-safe. |
| Accessibility | 6/10 | 9/10 | Focus states, skip link, labeled icon actions, accessible dialogs, expanded checkbox labels, reduced motion, and responsive targets are present. |
| Component consistency | 7/10 | 9.5/10 | Controls, surfaces, dialogs, feedback, tables, filters, and states route through the shared library and token layer. |
| Interaction polish | 6/10 | 9/10 | Hover, pressed, loading, disabled, focus, success, error, empty, and skeleton states share one interaction language. |
| Overall perceived quality | 5/10 | 9/10 | The interface now feels calm, deliberate, and product-specific rather than AI-generated. |

### Remaining product caveats

- Trend Explorer intentionally preserves native values and can visually compress low-volume measures when a high-volume KPI is selected. The redesign explains this and improves line/legend roles without changing the underlying analytical meaning.
- KPI management still shows all 52 measures in one table because search/filter behavior would be a functional addition, not part of this visual migration.
- The existing Recharts and Lucide dependencies remain to preserve the stack. Their default appearance has been substantially restyled and the product now uses a custom brand mark.

### Final verdict

The application now conforms consistently to `DESIGN.md` across public, dashboard, detail, trend, and admin surfaces. The design system is enforceable, the critical workflows are materially calmer and more legible, and the final product no longer reads as a generic AI-generated SaaS dashboard.
