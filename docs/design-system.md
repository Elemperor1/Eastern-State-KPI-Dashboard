# Eastern State KPI — Design System

This project uses a single shared component library in [`src/components/ui/`](/src/components/ui/). All new UI must be composed from library components and tokens; direct use of primitive classes or elements outside the library is blocked by the design-system guard.

## Quick reference

```tsx
import { Button, Card, FormField, Input, Select, Table, Badge, Tabs } from "@/components/ui";
```

## Library inventory

| Category | Components | Purpose |
|---|---|---|
| Primitives | `Button`, `IconButton`, `Input`, `Select` | Action and form controls |
| Surfaces | `Card`, `CardAction`, `ChartContainer` | Containers, clickable cards, chart wrappers |
| Feedback | `StatusBanner`, `Alert`, `EmptyState`, `Skeleton`, `Progress` | Loading, empty, success/error, progress |
| Navigation | `Breadcrumb`, `Tabs` | Page-level navigation |
| Data | `Badge`, `Table` | Tags, lists, tables |
| Page | `PageHeader`, `Avatar`, `FormField` | Header blocks, avatars, labeled form fields |
| Tokens | `globals.css` | Colors, radius, shadow, typography, chart palette |

## Tokens

Design tokens live in `src/app/globals.css` as CSS custom properties and Tailwind `@layer components` classes:

- `--radius-*` — corner radius
- `--shadow-*` — elevation shadows
- `--color-*` — semantic surface/text colors
- `--chart-*` — chart palette (single source for all chart colors)
- Component classes: `.btn`, `.btn-primary`, `.input`, `.surface`, `.pill`, `.chip`, `.data-table`, `.scroll-hint`, `.section-eyebrow`, `.section-title`

**Rule:** app code should not reference these classes directly. Use the React components that consume them.

## No-bypass enforcement

```bash
npm run design-system:guard   # scan for bypasses
npm run design-system:test    # guard + typecheck + build
npm run lint                  # runs the guard before next lint
```

The guard (`scripts/design-system-guard.sh`) fails if any file outside `src/components/ui/` uses:

- `surface`, `btn-*`, `input`, `pill`, `chip-active/inactive`, `scroll-hint`, `data-table` classes
- raw `<button>`, `<input>`, `<select>`, `<table>` elements

When the guard fails, refactor the violation into a library component or use an existing one.

## Adding a new component

1. Place it in `src/components/ui/`.
2. Export it from `src/components/ui/index.ts`.
3. Prefer tokens from `globals.css` over literal values.
4. Update this doc and the review skill if the new component changes patterns.
5. Run `npm run design-system:test` before committing.

## Migration status

All existing dashboard, admin, and login components have been migrated to the library. Domain chart components (`BreakdownChart`, `TrendChart`) remain domain-specific but consume chart tokens via CSS custom properties.
