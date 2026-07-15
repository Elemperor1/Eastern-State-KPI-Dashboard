# Eastern State KPI — Product Design System

`DESIGN.md` is the authority for the application’s visual language. This
document translates it into implementation rules for the strategic-performance
product. `docs/product-foundation.md` owns vocabulary, navigation, objects,
flows, and states.

## Canvas model

- Dark canvas: only the persistent sidebar, the mobile header, and code blocks. Reserved for chrome, never for content surfaces.
- Light canvas: every Overview, report, table, data-entry form, and Setup surface. The default for the entire product.
- Do not blend dark and light treatments inside a single content surface. Sidebar/header code blocks may sit on dark, but the page they live in is always light.

## Tokens

Tokens live in `src/app/globals.css` and are exposed through Tailwind in `tailwind.config.ts`.

- Colors: three teals (tertiary navy `#003649`, secondary dark teal `#005f6f`, primary medium teal `#209ba5`), one bright yellow accent (`#f7f242`), white, and a small set of semantic tonal derivatives (success/danger/info/warning). The full chart palette mirrors the same three teals plus a single yellow accent.
- Type: Galano Grotesque (licensed brand face, © 2014 René Bieder) for every product UI role; Monaco for code-like data values where the user reads a number the way they would read a log line.
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Radius: 4, 6, 8, 12, 18, full.
- Motion: 120 ms fast feedback, 180 ms standard transitions, and 220 ms drawer entry.
- Elevation: flat light surfaces, restrained navy-tinted light-card and floating-dialog shadows. The navy tints root shadows in the brand instead of using off-the-shelf greyscale.

## Shared-library rule

Application code must compose controls from `src/components/ui/`. Do not hand-roll buttons, inputs, selects, checkboxes, tables, status messages, dialogs, or reusable surfaces outside the library.

```tsx
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  FilterToolbar,
  FormField,
  IconButton,
  Input,
  PageHeader,
  Select,
  StatusBanner,
  Table,
  Tabs,
} from "@/components/ui";
```

## Component principles

- One visually dominant action per screen or workflow region.
- Button labels use the tracked uppercase DESIGN.md treatment.
- Inputs are 44 px high on touch layouts and never below 40 px.
- Icon-only actions have an accessible label and a minimum 40 px hit area.
- Cards exist only when a region must read as an independent surface.
- Tables use whitespace and hairlines, not boxed cells.
- Badges are squared status tokens, not generic pills. Visible status badges
  qualify their subject (for example, `Board status: Not reported` or
  `Setup status: Needs attention`).
- Status color follows one semantic ladder: neutral/incomplete for missing or
  unfinished work, soft warning for attention, danger for invalid or off-track
  results, success for complete/active states, and the bright accent only for
  the highest-priority disclosure such as `Sample data`.
- Destructive actions require `ConfirmDialog`; never use browser `confirm()`.
- Errors and success states use `StatusBanner`; never use browser `alert()`.
- Loading states mirror the final page structure with skeletons.

## Design-detail rules

- Use `text-wrap: balance` for headings and `text-wrap: pretty` for short body copy.
- Use tabular numerals for Measure values, chart axes, dates, counts, and financial values.
- Nested rounded surfaces must use concentric radii.
- Use optical icon alignment where geometric centering looks wrong.
- Use exact transition properties; never `transition: all`.
- Use `scale(0.96)` for tactile press feedback.
- Respect `prefers-reduced-motion`.
- Keep the yellow accent scarce: at most one signature yellow focal treatment
  in a normal viewport. Repeated warnings use the semantic soft-warning
  treatment. The brand gradient is an optional structural accent, never a
  substitute for hierarchy or status meaning.

## Enforcement

```bash
npm run design-system:guard
npm run design-system:test
AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh
```

The guard is a floor, not the definition of quality. A screen can pass the guard and still fail the system if it overuses cards, ignores canvas polarity, introduces colors outside the teal/navy/yellow family, or weakens hierarchy.
