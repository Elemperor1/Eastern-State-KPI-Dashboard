---
version: alpha
name: Eastern-State-KPI-design-system
description: An internal KPI dashboard for Eastern State Penitentiary Historic Site, built on a calm teal-and-navy palette with a single bright yellow accent. The system uses Galano Grotesque for every UI text role and Monaco for code-like data, leans on a single light canvas for all product surfaces, and uses one polarity (light) by default. The signature device is the brand gradient (tertiary navy → secondary dark teal → primary medium teal) used as a top-edge accent on category cards and the "no data" warning call-out, paired with a single high-saturation yellow used sparingly for highlights, focus states, and the most important KPI movers.
colors:
  primary: "#209ba5"
  secondary: "#005f6f"
  tertiary: "#003649"
  ink: "#003649"
  ink-press: "#001f29"
  on-primary: "#ffffff"
  on-dark: "#ffffff"
  on-dark-muted: "rgba(255,255,255,0.72)"
  on-dark-faint: "rgba(255,255,255,0.12)"
  accent: "#f7f242"
  accent-soft: "#fdfbe7"
  surface-canvas-dark: "#003649"
  surface-canvas-light: "#ffffff"
  surface-night: "#001f29"
  surface-press-light: "#eef3f4"
  surface-press-stronger: "#cfdadd"
  hairline-cool: "#cfe0e3"
  hairline-cloud: "#e7eef0"
  hairline-dark: "#113e4a"
  ring-focus: "rgba(32,155,165,0.55)"

typography:
  display-hero:
    fontFamily: "Galano Grotesque, system-ui, sans-serif"
    fontSize: 88px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  display-large:
    fontFamily: "Galano Grotesque, system-ui, sans-serif"
    fontSize: 60px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: 0
  heading-xl:
    fontFamily: "Galano Grotesque, -apple-system, system-ui, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: 30px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0
  heading-lg:
    fontFamily: "Galano Grotesque, -apple-system, system-ui, sans-serif"
    fontSize: 27px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0
  heading-md:
    fontFamily: "Galano Grotesque, -apple-system, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0
  heading-sm:
    fontFamily: "Galano Grotesque, -apple-system, system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0
  body-lg:
    fontFamily: "Galano Grotesque, -apple-system, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 2.0
    letterSpacing: 0
  body-strong:
    fontFamily: "Galano Grotesque, -apple-system, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0
  body-md:
    fontFamily: "Galano Grotesque, -apple-system, sans-serif"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
  eyebrow:
    fontFamily: "Galano Grotesque, -apple-system, sans-serif"
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  button-cap:
    fontFamily: "Galano Grotesque, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.14
    letterSpacing: 0.2px
  button-cap-light:
    fontFamily: "Galano Grotesque, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.29
    letterSpacing: 0.2px
  caption:
    fontFamily: "Galano Grotesque, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: 0
  micro-cap:
    fontFamily: "Galano Grotesque, -apple-system, sans-serif"
    fontSize: 10px
    fontWeight: 600
    lineHeight: 1.8
    letterSpacing: 0.25px
  code:
    fontFamily: "Monaco, Menlo, Ubuntu Mono, monospace"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  code-strong:
    fontFamily: "Monaco, Menlo, Ubuntu Mono, monospace"
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  xl: 12px
  xxl: 18px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 96px

components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.md}"
    padding: 12px 16px
  button-primary-pressed:
    backgroundColor: "{colors.ink-press}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.md}"
    padding: 12px 16px
  button-inverted:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.tertiary}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.md}"
    padding: 12px 16px
  button-inverted-pressed:
    backgroundColor: "{colors.surface-press-light}"
    textColor: "{colors.ink-press}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.md}"
    padding: 12px 16px
  button-ghost-on-dark:
    backgroundColor: "{colors.on-dark-faint}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.xl}"
    padding: 8px
  button-secondary:
    backgroundColor: "{colors.surface-canvas-light}"
    textColor: "{colors.tertiary}"
    typography: "{typography.button-cap-light}"
    rounded: "{rounded.md}"
    padding: 12px 16px
  button-disabled:
    backgroundColor: "{colors.hairline-cloud}"
    textColor: "{colors.on-dark-muted}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.md}"
    padding: 12px 16px
  pill-neutral-dark:
    backgroundColor: "{colors.surface-night}"
    textColor: "{colors.on-dark}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 4px 8px
  pill-accent-keyword:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.tertiary}"
    typography: "{typography.micro-cap}"
    rounded: "{rounded.xs}"
    padding: 0 8px
  text-input:
    backgroundColor: "{colors.surface-canvas-light}"
    textColor: "{colors.tertiary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  text-input-focused:
    backgroundColor: "{colors.surface-canvas-light}"
    textColor: "{colors.tertiary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  select-teal:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 8px 16px
  card-kpi:
    backgroundColor: "{colors.surface-canvas-light}"
    textColor: "{colors.tertiary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: 20px
  card-kpi-featured:
    backgroundColor: "{colors.surface-night}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: 20px
  card-category-accent:
    backgroundColor: "{colors.surface-canvas-light}"
    textColor: "{colors.tertiary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: 20px
  code-block:
    backgroundColor: "{colors.surface-night}"
    textColor: "{colors.on-dark}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: 16px
  link-on-dark:
    backgroundColor: "{colors.surface-canvas-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xs}"
    padding: 0px
  link-on-light:
    backgroundColor: "{colors.surface-canvas-light}"
    textColor: "{colors.tertiary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xs}"
    padding: 0px
  nav-bar-dark:
    backgroundColor: "{colors.surface-canvas-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xs}"
    padding: 16px 24px
  footer-light:
    backgroundColor: "{colors.surface-canvas-light}"
    textColor: "{colors.tertiary}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 32px 24px
---

## Overview

Eastern State KPI is an internal intelligence surface, not a marketing site. Every page is a working surface — a card grid, a chart, a table, a data-entry form — and the design system reflects that: one light canvas everywhere, one set of three teal/navy tokens driving every brand-colored element, and one high-saturation yellow reserved for the rare moments where a screen needs the user's eye to land on a specific value. Pages scan, don't narrate. The product reads like an instrument panel, not a brochure.

The palette is deliberately narrow. Three brand teals — tertiary navy `#003649`, secondary dark teal `#005f6f`, primary medium teal `#209ba5` — carry the entire visual identity: sidebar canvas, primary buttons, chart strokes, focus ring, and the brand gradient (tertiary → secondary → primary, left to right). A single yellow `#f7f242` is the only color outside the teal/navy family, and it is kept scarce. White is the dominant surface, and the same light canvas is used for dashboards, tables, data entry, and administration — the system never tries to blend a "marketing" polarity into the product.

Typography collapses to two families: **Galano Grotesque** (Eastern State Penitentiary's licensed brand face — a calm geometric grotesque by René Bieder, 2014 — used for every UI text role: body, captions, eyebrows, button labels) and **Monaco** (used for code-like data values where the user is meant to read a number the way they would read a log line). Buttons and eyebrows always run uppercase with a 0.2px tracking lift, giving the product a quiet "console output" cadence without leaning on display type or marketing flourishes.

**Key Characteristics:**
- Single light canvas across the product — every dashboard, table, chart, and admin surface uses `{colors.surface-canvas-light}`. The dark navy is reserved for the persistent sidebar, the mobile header, and code blocks; it is never blended into a content surface.
- Three teals, no rainbow. The teal/navy family is the only brand palette, and every chart series, button, focus ring, and gradient endpoint lives inside it.
- Yellow is treated as a scarcity. The bright `{colors.accent}` (`#f7f242`) is reserved for highlight chips on the most important KPI movers, the "no data" warning badge, the BrandMark glyph accent, and as a single focus-when-active accent. It is never used as a button background, never as a full card fill, and never stacked next to itself inside a viewport.
- Brand gradient as a structural device. `{colors.tertiary}` → `{colors.secondary}` → `{colors.primary}` (navy → dark teal → medium teal) appears as a 3px top edge on category cards, as a left-aligned vertical bar on the brand mark, and as the rare "featured" hero strip on summary pages. It is the closest thing the product has to a signature device.
- Uppercase eyebrow + button caps in `{typography.button-cap}` and `{typography.eyebrow}`, with a consistent 0.2px tracking lift, give the brand its quiet "developer console" cadence.
- One primary CTA per region. Every page has one filled button reading as the strongest UI affordance; outlined and ghost variants are downgraded. The single button polarity is dark navy on light — never yellow, never teal — so the action reads as the most authoritative control regardless of which surface it sits on.
- Card chrome follows the chart. Cards are white with a navy-tinted shadow at level 1, elevation level 2 lifts them slightly more, and the only place a colored card appears is the navy "featured" treatment for primary actions. There are no accent-bordered cards.
- Data first, decoration last. Charts use the teal/navy family in a deliberate depth order — current year = primary teal, compare year = secondary dark teal, earlier years fade through grey — so the eye reads the most recent value first without competing accents.

## Colors

> **Source pages:** `/dashboard/overview`, `/dashboard/category/[slug]`, `/dashboard/metric/[slug]`, `/dashboard/trends`, `/admin/*`, `/login`.

### Brand & Accent
- **Primary Teal** (`{colors.primary}` — `#209ba5`): The system's primary brand color. Used for the current-year chart stroke, focus ring at 50% alpha, info callouts, and the gradient endpoint. Never a button background, never a full card fill.
- **Secondary Teal** (`{colors.secondary}` — `#005f6f`): The dark teal. Used for the compare-year chart stroke, `{typography.eyebrow}` eyebrows inside cards, the active step in the brand gradient, and the hover state on dark-on-light buttons. Sits between the navy and the primary in luminance so it reads as a depth step, not a hue change.
- **Tertiary Navy** (`{colors.tertiary}` — `#003649`): The deepest tone. Used for the persistent sidebar canvas, the mobile header, code blocks, primary buttons, the active chip, and the gradient start. Treated as the new "ink" — body text, headings, and structural borders all use it on light surfaces.
- **Bright Yellow** (`{colors.accent}` — `#f7f242`): The single high-saturation accent. Reserved for the "No data" warning badge on `MetricCard`, the `pill-accent-keyword` microchip wrapping the top mover in a category card, and a one-time focal highlight on a single featured KPI per dashboard region. Never a button background. Never body text at any size below 24px.
- **Accent Soft** (`{colors.accent-soft}` — `#fdfbe7`): A near-white tint of the yellow used as a quiet warning fill when the bright yellow would shout. Same family, used as background only.

### Surface
- **Light Canvas** (`{colors.surface-canvas-light}` — `#ffffff`): The default surface for every dashboard, table, chart, data-entry form, and admin panel. The system never blends in a "marketing" polarity.
- **Dark Canvas** (`{colors.surface-canvas-dark}` — `#003649`): Reserved for the persistent sidebar, the mobile header strip, and code blocks. Always paired with `{colors.on-dark}` text and never used as a content surface inside a page.
- **Night** (`{colors.surface-night}` — `#001f29`): A near-black navy used for code blocks and the rare "featured" inverted card. Sits one step deeper than the dark canvas so the code block lifts off the sidebar without a separate hue.
- **Surface Press Light** (`{colors.surface-press-light}` — `#eef3f4`) and **Press Stronger** (`{colors.surface-press-stronger}` — `#cfdadd`): The pressed/active fill of inverted buttons on dark surfaces and the hover state of secondary buttons on light surfaces. Two steps so the press feels tactile.
- **Hairline Cool** (`{colors.hairline-cool}` — `#cfe0e3`): 1px borders on text inputs and form fields. A washed-out version of the brand-soft teal, so the hairline reads as part of the system rather than a generic grey.
- **Hairline Cloud** (`{colors.hairline-cloud}` — `#e7eef0`): Table dividers and card borders on light canvas. Lower-contrast than the cool hairline so structural lines don't compete with data.
- **Hairline Dark** (`{colors.hairline-dark}` — `#113e4a`): 1px borders on dark cards. The dark-navy equivalent of the cool hairline.

### Text
- **On Primary** (`{colors.on-primary}` — `#ffffff`): All CTA labels on filled navy buttons, all text inside dark cards and code blocks, all sidebar text.
- **Tertiary Navy** (`{colors.tertiary}` — `#003649`): The ink. Body text, headings, table headers, button labels, link color, and structural borders on light canvas. The same token does double duty as the dark canvas and as ink — a deliberate cost of keeping the palette narrow.
- **Ink Press** (`{colors.ink-press}` — `#001f29`): Reserved for the pressed/active state of inverted buttons.
- **On Dark Muted** (`{colors.on-dark-muted}` — `rgba(255,255,255,0.72)`): Secondary text, captions, and table cell values on dark canvas.
- **On Dark Faint** (`{colors.on-dark-faint}` — `rgba(255,255,255,0.12)`): Translucent surface-on-dark — used for ghost button fills and dimmed nav items.

### Chart Palette
> The chart palette is published as CSS custom properties under `--chart-*` in `globals.css`, and as the brand gradient endpoint in `tailwind.config.ts`.

- **Current Year** (`--chart-primary` / `{colors.primary}` — `#209ba5`): The main stroke and primary bar fill. Always the loudest series in any chart.
- **Compare Year** (`--chart-secondary` / `{colors.secondary}` — `#005f6f`): The compare-year bar/line. Reads as a depth step below the current year.
- **Tertiary** (`--chart-tertiary` / `{colors.tertiary}` — `#003649`): Used for a recent comparison series and for the third stacked series in breakdown charts.
- **Brand Soft** (`--chart-brand-soft` — `#9cd9de`): Low-emphasis fills for area charts and stacked backgrounds.
- **Brand Mid** (`--chart-brand-mid` — `#36adb6`): Mid-tone variant for stacked series that need a third step.
- **Accent** (`--chart-accent` / `{colors.accent}` — `#f7f242`): The yellow, used at most once per chart — for the most recent data point in a trend line, or for the single most important slice in a breakdown. Never as a continuous stroke, never as a series fill.
- **Ink Soft** (`--chart-ink-soft` — `#557883`): An additional comparison-series color. A grey that still carries a teal tint so it reads as part of the family.
- **Muted** (`--chart-muted` — `#a9c2c8`): Disabled and null data.
- **Grid** (`--chart-grid` — `{colors.hairline-cloud}`): 1px gridline stroke.
- **Axis** (`--chart-axis` — `#557883`): Axis tick labels.
- **Cursor** (`--chart-cursor` — `#eaf7f8`): Hover-state fill on the chart canvas.
- **Compatibility aliases** — older chart code referencing `--chart-violet`/`--chart-pink`/`--chart-lime`/`--chart-purple`/`--chart-red`/`--chart-cyan`/`--chart-brand`/`--chart-brand-light`/`--chart-success` is intentionally not retained; the palette was rewritten cleanly, not aliased.

### Semantic
- **Focus Ring** (`{colors.ring-focus}` — `rgba(32,155,165,0.55)`): Translucent teal focus ring — the only color in the system at non-100% alpha, reserved for keyboard focus on form fields, buttons, and tabs.
- **Success** (`--color-success-bg` `#e6f4ee` / `--color-success-text` `#0a4f3a`): A muted green for favorable deltas in tables and KPI deltas. Distinct from the teal family.
- **Danger** (`--color-danger-bg` `#fdecec` / `--color-danger-text` `#8a1f1f`): A muted red for unfavorable deltas and destructive actions. Same role as before, recolored to sit outside the teal family.
- **Info** (`--color-info-bg` `#eaf7f8` / `--color-info-text` `#005f6f`): Tinted with the brand-soft teal so it reads as part of the system.
- **Warning** (`--color-warning-bg` `#fdfbe7` / `--color-warning-text` `#6e6c10`): The warning fill pair. The background is a near-white tint of the yellow accent; the text is the dark-yellow step. Used for "No data" badges and the `SampleDataBadge`.

## Typography

### Font Family

The single UI family is **Galano Grotesque** (© 2014 René Bieder, licensed for use by Eastern State Penitentiary Historic Site) — a calm geometric grotesque with even rhythm, a slightly humanist x-height, and four shipped weights (Light 300, Regular 400, Medium 500, Bold 700) — used at every size from 10px micro-caps up to 88px hero display. The @font-face declarations in `globals.css` load the OTF files from `/public/fonts/` with `font-display: swap`, and the system fallback chain (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`) covers the gap while the web font is in flight. The slightly humanist proportions keep dense KPI tables from feeling mechanical at small sizes, and the heavier weights hold up at the 60–88px display tier without needing a custom display face.

The code/data tier is **Monaco** with Menlo and Ubuntu Mono fallbacks — used for KPI values that read as a "log line" (large currency values, percentage figures, year-over-year deltas in tables), for code blocks, and for the install/setup snippets. Monaco is treated as a numeric font, not a typographic accent.

### Hierarchy

| Token                           | Size | Weight | Line Height | Letter Spacing | Use                                                                                |
| ------------------------------- | ---- | ------ | ----------- | -------------- | ---------------------------------------------------------------------------------- |
| `{typography.display-hero}`     | 88px | 700    | 1.2         | 0              | Reserved for the login page hero or future marketing surfaces. Not used inside the product. |
| `{typography.display-large}`    | 60px | 500    | 1.1         | 0              | Reserved for the largest KPI value on a page (e.g., a single number-of-the-year callout). |
| `{typography.heading-xl}`       | 30px | 500    | 1.2         | 0              | Page titles (e.g., the Overview heading).                                         |
| `{typography.heading-lg}`       | 27px | 500    | 1.25        | 0              | Sub-section headings, large card titles.                                          |
| `{typography.heading-md}`       | 24px | 500    | 1.25        | 0              | Card titles, in-page section headings.                                            |
| `{typography.heading-sm}`       | 20px | 600    | 1.25        | 0              | Compact card title, list-group title.                                             |
| `{typography.body-lg}`          | 16px | 400    | 2.0         | 0              | Marketing-paragraph body — the airy, two-line-leading variant. Reserved for marketing surfaces. |
| `{typography.body-strong}`      | 16px | 600    | 1.5         | 0              | Emphasized body run, lead sentence.                                               |
| `{typography.body-md}`          | 16px | 500    | 1.5         | 0              | Default UI body, table cells, form labels.                                        |
| `{typography.eyebrow}`          | 15px | 500    | 1.4         | 0              | Section eyebrow above large headings, all-caps.                                   |
| `{typography.button-cap}`       | 14px | 700    | 1.14        | 0.2px          | Filled button labels (uppercase).                                                 |
| `{typography.button-cap-light}` | 14px | 500    | 1.29        | 0.2px          | Ghost / outline button labels (uppercase).                                        |
| `{typography.caption}`          | 14px | 400    | 1.43        | 0              | Footer text, fine print, helper copy.                                             |
| `{typography.micro-cap}`        | 10px | 600    | 1.8         | 0.25px         | Status labels, badge text, micro-eyebrow.                                         |
| `{typography.code}`             | 16px | 400    | 1.5         | 0              | Code block content.                                                               |
| `{typography.code-strong}`      | 16px | 700    | 1.5         | 0              | Highlighted code keyword.                                                         |

### Principles
- **Two leading worlds.** Marketing copy uses 2.0 line-height on `{typography.body-lg}` — extremely airy, generous breathing room. Functional UI copy uses 1.5 line-height on `{typography.body-md}` — denser, closer to console output. The choice is deliberate: marketing reads like prose, the product reads like a log.
- **Caps with tracking.** All button labels and eyebrows are uppercase with 0.2px tracking. This is the brand's typographic signature — a console-prompt cadence applied to UI affordances.
- **Numbers as type.** KPI values use Galano Grotesque at `{typography.heading-md}`–`{typography.display-large}` sizes, but always paired with `.tabular` (`font-variant-numeric: tabular-nums`) so columns line up on the decimal. The visual goal: a table of currency values should scan like a spreadsheet.
- **No display face in the product.** The product never uses a custom display sans — Galano Grotesque at heavier weights does the entire job. The 88px hero tier is reserved for non-product surfaces (login, future marketing pages).

## Layout

### Spacing System
- **Base unit**: 8px
- **Tokens**: `{spacing.xxs}` 2px · `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.md}` 12px · `{spacing.lg}` 16px · `{spacing.xl}` 24px · `{spacing.xxl}` 32px · `{spacing.section}` 96px
- **Section padding**: `{spacing.section}` 96px between major page bands on desktop, collapsing to `{spacing.xxl}` 32px–48px on mobile.
- **Card internal padding**: `{spacing.xl}` 24px on KPI and category cards; `{spacing.lg}` 16px on compact tag/badge groups.
- **Form field padding**: `{spacing.sm}` 8px vertical, `{spacing.md}` 12px horizontal — matches the text-input token directly.

### Grid & Container
- The dashboard uses a wide centered container with generous outer gutters; max width sits at 72rem (`page-content`) and 84rem (`page-content-wide`) for tables and chart strips. Content flexes across a 12-column grid, but most pages use 1-up or 2-up card rows rather than the full 12-column grid.
- The overview page uses a category card grid that breaks at 1/2/3 columns across mobile/tablet/desktop; the metric and category detail pages use a single-column main with a 320px right rail.
- Breakpoints stair-step at 1440 → 1152 → 992 → 768 → 640 → 576 — see Responsive Behavior.

### Whitespace Philosophy
The product is information-dense by design, not spacious. The light canvas absorbs whitespace without complaint, so the rule of thumb is: at desktop, give each KPI card 24px of internal padding and let the page grid do the rest of the breathing. On the login page (the only "spacious" surface) section padding stretches to 96px to let the single accent feel deliberate.

## Elevation & Depth

| Level | Treatment                                                                      | Use                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Flat on canvas, no shadow                                                      | Default surface, every page                                                                                                            |
| 1     | `box-shadow: rgba(0,54,73,0.07) 0 0 0 1px, rgba(0,54,73,0.08) 0 1px 2px -1px, rgba(0,54,73,0.035) 0 4px 14px` | The default `surface` card. Hairline + small lift so the card reads as a discrete object on the page.                                  |
| 2     | `box-shadow: rgba(0,54,73,0.1) 0 10px 15px -3px, rgba(0,54,73,0.1) 0 4px 6px -4px` | Floating cards on light canvas, modals. Tinted with the navy so the shadow reads as part of the brand.                                 |
| 3     | `box-shadow: rgba(0,33,48,0.18) 0 0.5rem 1.5rem`                              | Pressed inverted button on dark canvas. The deepest tone of the brand (the press state) becomes the shadow color.                     |

### Decorative Depth
Depth in the product does not come from stacked drop shadows — it comes from the **brand gradient** as a 3px top edge on category cards, the **single yellow accent** as a one-per-page highlight, and the **navy-tinted shadows** that root cards in the brand palette. These structural devices do the work that heavier shadow stacks do in flatter design systems.

## Shapes

### Border Radius Scale

| Token            | Value  | Use                                                         |
| ---------------- | ------ | ----------------------------------------------------------- |
| `{rounded.xs}`   | 4px    | Badges, status pills, the accent keyword highlight chip.    |
| `{rounded.sm}`   | 6px    | Text inputs, search boxes.                                  |
| `{rounded.md}`   | 8px    | Primary and inverted buttons, code blocks, select dropdowns. |
| `{rounded.lg}`   | 10px    | Generic divs, container blocks.                              |
| `{rounded.xl}`   | 12px   | KPI cards, navigation pill chrome, table containers.        |
| `{rounded.xxl}`  | 18px   | Brand mark, image containers.                               |
| `{rounded.full}` | 9999px | Avatars, circular icon buttons.                             |

### Photography Geometry
The product doesn't use traditional photography — it uses a small set of product illustrations and inline product UI screenshots. Any embedded UI screenshot sits inside a `{rounded.xl}` 12px container with a single hairline border, and is constrained to a 16:10 or 4:3 frame so the chart bar reads at the same scale as the surrounding text. Mascot characters, when used, sit at section junctions with no container and no shadow — they break the grid the way a hand-drawn arrow would.

## Components

> **No hover states documented.** Every spec below shows only Default and Pressed/Active states. Variants are formal entries in the front-matter `components:` block.

### Buttons

**`button-primary`** — the dominant CTA across light surfaces.
- Background `{colors.tertiary}`, text `{colors.on-primary}`, type `{typography.button-cap}` (uppercase, 14px / 700, 0.2px tracking), padding `{spacing.md} {spacing.lg}` (12px 16px), rounded `{rounded.md}`. The single button polarity is dark navy on light — never yellow, never teal — so the action reads as the most authoritative control regardless of which surface it sits on.
- Pressed state lives in `button-primary-pressed`: background drops to `{colors.ink-press}` (`#001f29`), text stays `{colors.on-primary}`. The button effectively darkens on press.

**`button-inverted`** — the dominant CTA when the surrounding surface is dark (the sidebar, the mobile header).
- Background `{colors.on-primary}` (white), text `{colors.tertiary}`, same `{typography.button-cap}`, rounded `{rounded.md}`. Visually identical hierarchy, polarity-flipped.
- Pressed in `button-inverted-pressed`: background drops to `{colors.surface-press-light}`, text to `{colors.ink-press}`.

**`button-ghost-on-dark`** — secondary CTA on dark canvas (e.g., the "Open navigation" hamburger on the mobile header).
- Translucent fill `{colors.on-dark-faint}`, text `{colors.on-dark}`, type `{typography.button-cap}`, padding `{spacing.sm}` (8px), rounded `{rounded.xl}`. The translucent fill lets the dark canvas show through.

**`button-secondary`** — the default neutral button on light surfaces (filter toolbar, table actions, dialog "Cancel").
- Background `{colors.surface-canvas-light}`, text `{colors.tertiary}`, type `{typography.button-cap-light}` (one weight step down from the primary), padding `{spacing.md} {spacing.lg}`, rounded `{rounded.md}`. Outlined via `1px` `{colors.hairline-cool}` border built into the shadow, no accent stroke.

**`button-disabled`**
- Background `{colors.hairline-cloud}`, text `{colors.on-dark-muted}`, otherwise identical to `button-primary`. Never receives a "yellow / disabled" state — disabled means disabled.

### Cards & Containers

**`card-kpi`** — the standard metric card on the dashboard.
- Background `{colors.surface-canvas-light}`, text `{colors.tertiary}`, padding `{spacing.xl}` 24px, rounded `{rounded.xl}` 12px, level-1 surface shadow. Headline at top in `{typography.heading-md}`, KPI value in `{typography.display-large}` (or `{typography.heading-lg}` for the comparison value), and a single `pill` at the bottom-left of the card holding the favorable/unfavorable delta.

**`card-kpi-featured`** — the dark inverted card, used at most once per dashboard region (typically a single "year total" callout).
- Background `{colors.surface-night}` (`#001f29`), text `{colors.on-dark}`, otherwise identical structure to `card-kpi`. The inversion (rather than an accent-bordered light card) is the product's distinctive choice — the featured KPI reads as the brand's voice, not as a marketing decoration.

**`card-category-accent`** — the category card on the Overview page.
- Background `{colors.surface-canvas-light}`, text `{colors.tertiary}`, padding `{spacing.xl}` 24px, rounded `{rounded.xl}` 12px, level-1 surface shadow. The top edge is a 3px brand-gradient strip (tertiary → secondary → primary) that runs the full card width — this is the product's most visible signature device. Inside: a small `{typography.micro-cap}` category label, a `{typography.heading-md}` category name, a percent-improving progress bar tinted with the brand-secondary teal, and a "top mover" line at the bottom.

**`code-block`** — code/install snippets.
- Background `{colors.surface-night}`, text `{colors.on-dark}` rendered in `{typography.code}`. Padding `{spacing.lg}` 16px, rounded `{rounded.md}`. The night navy is barely lifted from the sidebar dark canvas — only the slightly deeper fill differentiates it.

### Inputs & Forms

**`text-input`** — every form field across the admin and login surfaces.
- Background `{colors.surface-canvas-light}`, text `{colors.tertiary}`, type `{typography.body-md}`, padding `{spacing.sm} {spacing.md}` (8px 12px), rounded `{rounded.sm}` 6px, 1px `{colors.hairline-cool}` border.
- Focus state in `text-input-focused`: same fill, but adds an inset shadow `rgba(0,0,0,0.1) 0 2px 10px inset` plus a `{colors.primary}` (teal) inset 1px border to suggest depth pressed inward and indicate keyboard focus.

**`select-teal`** — the dropdown variant used inside a colored panel (e.g., the data-entry year selector inside an admin form).
- Background `{colors.primary}` (medium teal), text `{colors.on-primary}`, type `{typography.body-md}`, padding `{spacing.sm} {spacing.lg}`, rounded `{rounded.md}`. Distinctive because it doesn't mimic a plain text input — it reads as a deliberate brand surface, not as a chrome control.

### Navigation

**`nav-bar-dark`** — the persistent left sidebar (desktop) and the top header (mobile).
- Background `{colors.surface-canvas-dark}` (the tertiary navy), text `{colors.on-dark}` rendered in `{typography.body-md}`. Brand mark on top, primary nav items stacked in two groups (Explore / Manage), and an account block at the bottom with the logout button. Padding `{spacing.lg} {spacing.xl}` (16px 24px). The active nav item flips polarity via `nav-link-active` (white background, navy text).

**Mobile nav** — collapses to a hamburger toggle below the 768px breakpoint. The drawer is the same navy canvas as the sidebar, slides in from the left, and the same nav items appear in the same order.

### Pills, Badges, and Highlight Chips

**`pill-neutral-dark`** — small status / category pill on dark surfaces.
- Background `{colors.surface-night}`, text `{colors.on-dark}`, type `{typography.caption}` 14px, padding `{spacing.xs} {spacing.sm}` (4px 8px), rounded `{rounded.xs}` 4px.

**`pill-accent-keyword`** — the system's single highlight chip. Used to wrap the top mover inside a category card, the "no data" label on a metric card, and a single featured value on a summary page. Never used as a button, never used to wrap a word inside a headline.
- Background `{colors.accent}` (the bright yellow), text `{colors.tertiary}` (the deep navy), type `{typography.micro-cap}` (10px / 600, uppercase, 0.25px tracking), padding `0 {spacing.sm}` (8px horizontal, 0 vertical so the chip hugs the cap-height), rounded `{rounded.xs}` 4px. This is the rarest component in the system — at most one per viewport.

### Signature Components

**Brand Gradient Top Edge** — the 3px-tall brand gradient (tertiary → secondary → primary, left to right) running across the full top of every `card-category-accent`. It is the product's most visible signature device and is the only place the gradient appears in the standard product UI. Implementation: `background: var(--color-gradient-brand)` on a `<span>` that sits absolutely positioned at the top of the card, full width, 3px tall.

**Brand Mark** — the official Eastern State Penitentiary mark (`src/components/ui/BrandMark.tsx`), rendered as a `next/image` `<Image>` pointing at the source-of-truth raster at `public/logos/eastern-state-mark.png`. The mark is the two-bar prison gate with a central locking mechanism that Eastern State's brand team delivered — a 600×636 PNG, RGBA with transparent background, using the brand's two teals (`{colors.primary}` #209ba5 for the teal faces and `{colors.secondary}` #005f6f for the navy extrusion faces) so it drops onto either the navy sidebar or the white page chrome without modification. **Do not hand-trace or re-render the mark** — the official raster is the source of truth and the BrandMark component renders it as-is. The full-stack master (with the wordmark area reserved as empty white space) is at `public/logos/eastern-state-logo.png` for deck/slide exports.

The mark ships at favicon sizes (16/32/48/64/128/256px) via `public/favicon.ico` — a multi-size raster generated from `public/logos/eastern-state-mark.png` via `magick`. `metadata.icons` in `src/app/layout.tsx` registers both the multi-size `.ico` (legacy) and the 256×256 PNG (modern) so browsers pick the right one.

The `inverted` prop on `<BrandMark />` is preserved for API compatibility with the previous square-container version of the mark but is a no-op — the new design renders identically on light and dark surfaces.

**Single-Accent Rule** — the most important invariant in the system. No viewport may show more than one bright-yellow element at a time. If a category card already has a yellow "top mover" pill, the metric card on the same page must surface its top mover in the teal family or omit it. This rule is what keeps the yellow scarce and meaningful; loosen it and the brand voice loses its center of gravity.

**`link-on-dark`** — inline links in body copy on dark surfaces. Default text is `{colors.on-dark}` rendered in `{typography.body-md}` with a persistent underline; the underline is the entire affordance, no color change. Sits flush in copy with no padding, no rounded corners beyond the inherited `{rounded.xs}`.

**`link-on-light`** — inline links in body copy on light surfaces. Same shape contract as `link-on-dark`, but text is `{colors.tertiary}` (the navy ink). Used across admin, data entry, and login surfaces.

**`footer-light`** — site-wide footer on the light-canvas template.
- Background `{colors.surface-canvas-light}`, text `{colors.tertiary}`, type `{typography.caption}`, padding `{spacing.xxl} {spacing.xl}` (32px 24px). Holds three to four columns of link groups, social icons in a horizontal strip at the bottom right, and a small legal/copyright row at the very bottom in `{typography.caption}`. The single yellow accent (when used) appears in the footer as a 2px-tall brand-gradient strip running across the top edge of the footer block — a quieter echo of the category-card top edge.

## Do's and Don'ts

### Do
- Reserve `{colors.accent}` (the yellow) for the `pill-accent-keyword` chip, the "No data" warning badge, and the BrandMark glyph. Never use it as a button background, never use it as body text at sizes below 24px, never stack two yellow elements in the same viewport.
- Pair every `button-primary` with `{typography.button-cap}` in uppercase with 0.2px tracking — the cadence is part of the brand, not a stylistic option.
- Use the brand gradient (`var(--color-gradient-brand)`) as the 3px top edge on every category card, and as the only decorative gradient in the product. Don't reach for other gradients.
- Let the chart palette do the talking on chart pages — three teals, one yellow, no other colors. The current year is always `{colors.primary}`, the compare year is always `{colors.secondary}`.
- Treat the dark canvas (`{colors.surface-canvas-dark}`) as a chrome surface only. The sidebar, the mobile header, and the code block are the only places the dark canvas appears.
- Default body line-height to 1.5 on functional UI surfaces and 2.0 on marketing surfaces — the difference is intentional.

### Don't
- Don't introduce additional accent colors beyond the yellow and the teal/navy family. Adding orange, pink, or a second yellow dilutes the three-teal signature.
- Don't apply heavy drop shadows to cards — depth comes from the navy-tinted level-1 shadow and the brand-gradient top edge, not from light-on-light shadows that would muddy the page.
- Don't use `{typography.display-hero}` (88px) for anything inside the product — even a top-level KPI callout caps at `{typography.display-large}` (60px).
- Don't put body text in `{colors.accent}` — it's a chip color and the contrast at body sizes fails accessibility.
- Don't soften the `{colors.tertiary}` button to brand-primary teal — the navy is the point; it reads as the most authoritative action regardless of which surface it sits on.
- Don't put the brand gradient as a full card fill — it's a 3px top edge and a footer strip, never a backdrop.

## Responsive Behavior

### Breakpoints

| Name         | Width       | Key Changes                                                                              |
| ------------ | ----------- | ---------------------------------------------------------------------------------------- |
| 4K / Wide    | ≥ 1440px    | Category card grid holds 3-up; KPI card grid holds 4-up                                  |
| Desktop      | 1152–1440px | Default content max-width sits at 72rem, all patterns hold                              |
| Laptop       | 992–1151px  | Category card grid drops to 2-up; right rail on metric/category pages collapses to bottom|
| Tablet       | 768–991px   | Nav still horizontal but compresses; right rail becomes a bottom section                  |
| Mobile Large | 640–767px   | Sidebar becomes a top header; hamburger toggle appears                                   |
| Mobile       | 576–639px   | Single-column everything; KPI card grid drops to 1-up                                    |
| Small Mobile | 1–575px     | Compact mode; all side rails drop to the bottom of the page                              |

### Touch Targets
- Primary buttons hit a minimum 44×44px on mobile (12px vertical padding × 16px font + line-height = ~44px). Maintains WCAG AAA touch-target spec.
- Pill tags and badges in nav and feature surfaces stay above 32×32px even at small mobile breakpoints; they enlarge if necessary rather than shrink.
- Form fields stay at the 44px minimum height on mobile contact pages.

### Collapsing Strategy
- **Heading stair** — `{typography.heading-xl}` (30px) holds from desktop down to tablet, then drops to 24px at mobile large and to 20px at mobile.
- **KPI card grid** stair-steps from 4-up → 2-up → 1-up. The featured dark card (when used) remains visually distinguished at every breakpoint.
- **Top nav** collapses to a hamburger below 768px; the dropdown menu uses the same dark canvas polarity as the page.
- **Tables** preserve their full data column set at every breakpoint by adding horizontal scroll within a `.scroll-hint` container; they never wrap or hide columns by default.

### Image Behavior
- Product UI mocks scale proportionally; on small mobile they often anchor to one edge with horizontal overflow rather than shrink to illegibility.
- The brand gradient strips (category card top edge, footer top edge) preserve their 3px / 2px height at every breakpoint — they never stretch vertically.

## Iteration Guide

1. Focus on ONE component at a time. Don't rebuild the system — extend it.
2. Reference component names and tokens directly (`{colors.accent}`, `{button-primary}-pressed`, `{rounded.xxl}`) — do not paraphrase.
3. Run the design-system guard (`npm run design-system:guard`) and the full CI gate (`npm run design-system:test`) after edits — `broken-ref`, hex-literal, and `transition: all` warnings flag issues automatically.
4. Add new variants as separate component entries (`-pressed`, `-disabled`, `-focused`) — do not bury them inside prose.
5. Default to `{typography.body-md}` for product UI body and `{typography.body-lg}` for marketing prose — the leading difference is intentional and load-bearing.
6. Keep `{colors.accent}` scarce — at most one signature yellow element per viewport. The signature only works because it's rare.
7. When polarizing a new surface, choose one canvas (`{colors.surface-canvas-dark}` for sidebar/header/code, `{colors.surface-canvas-light}` for everything else) and commit to it; don't blend the two on a single content surface.
