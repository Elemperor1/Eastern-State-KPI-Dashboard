# Eastern State KPI — Product Design System

`DESIGN.md` is the authority for the application’s visual language. This document translates it into implementation rules for the KPI product.

## Canvas model

- Dark canvas: navigation, identity, and high-emphasis brand moments.
- Light canvas: dashboards, charts, tables, data entry, and administration.
- Do not blend dark and light treatments inside a single surface. Use a clean boundary between the two worlds.

## Tokens

Tokens live in `src/app/globals.css` and are exposed through Tailwind in `tailwind.config.ts`.

- Colors: midnight violet, ink violet, white, lime, pink, violet support tones, semantic tonal derivatives.
- Type: Rubik for all product UI; Monaco/Menlo for code-like data where needed.
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Radius: 4, 6, 8, 12, 18, full.
- Motion: 150 ms controls, 220 ms navigation/dialogs.
- Elevation: flat dark surfaces, restrained light-card and floating-dialog shadows.

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
- Badges are squared status tokens, not generic pills.
- Destructive actions require `ConfirmDialog`; never use browser `confirm()`.
- Errors and success states use `StatusBanner`; never use browser `alert()`.
- Loading states mirror the final page structure with skeletons.

## Design-detail rules

- Use `text-wrap: balance` for headings and `text-wrap: pretty` for short body copy.
- Use tabular numerals for KPIs, chart axes, dates, counts, and financial values.
- Nested rounded surfaces must use concentric radii.
- Use optical icon alignment where geometric centering looks wrong.
- Use exact transition properties; never `transition: all`.
- Use `scale(0.96)` for tactile press feedback.
- Respect `prefers-reduced-motion`.
- Keep lime scarce: no more than one signature lime focal treatment in a normal viewport.

## Enforcement

```bash
npm run design-system:guard
npm run design-system:test
npm run smoke
```

The guard is a floor, not the definition of quality. A screen can pass the guard and still fail the system if it overuses cards, ignores canvas polarity, introduces new accent colors, or weakens hierarchy.
