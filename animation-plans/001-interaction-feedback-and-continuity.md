# 001 — Make interaction feedback immediate and coherent

- **Status**: DONE
- **Commit**: 7612aa5
- **Severity**: HIGH
- **Category**: Purpose, interruptibility, accessibility, and performance
- **Estimated scope**: shared motion CSS, three shared interaction primitives,
  Data Entry, Reports/exports, route recovery, target focus, and focused tests

## Problem

The current high-frequency route and pane transition is a `360ms` keyframe that
animates opacity, translation, and blur. It is also reused for the mobile drawer:

```css
/* src/app/globals.css — current */
.page-enter {
  animation: page-enter 360ms cubic-bezier(0.2, 0, 0, 1) both;
}
```

The drawer does not trap or move focus, does not make the background inert, and
loses focus on close. Dialog focus logic is duplicated and is sensitive to
inline `onClose` callbacks. Save validation does not focus the first invalid
field, offline state is not explicit, exports do not announce successful
preparation, route retry has no pending state or recovery-focus contract, and
Measure-to-target navigation scrolls correctly but leaves focus on the body.
The progress primitive animates layout width for `500ms`.

## Target

- Frequent route, filter, list, and keyboard actions have no entrance motion.
- The mobile drawer uses `transform`/`opacity`, enters from the left in `220ms`
  with `cubic-bezier(0.32, 0.72, 0, 1)`, exits in `180ms` with
  `cubic-bezier(0.23, 1, 0.32, 1)`, traps focus, makes the page inert, closes on
  Escape, and restores the opener.
- Centered dialogs use opacity plus `scale(0.97)` for `180ms`, exit in `140ms`,
  share focus trapping/restoration, and expose an honest busy confirmation.
- Reduced motion removes translation/scale but keeps a `120ms` opacity/color
  transition and every semantic state.
- Data Entry focuses the first invalid field, preserves offline drafts, and
  reports offline/unavailable state without claiming synchronization.
- Reports expose real pending navigation; CSV/PNG/PDF/print feedback states
  announce only what the browser can confirm.
- Route retry announces pending work and focuses `#main-content` after recovery.
- Target hash navigation focuses the exact target heading without adding a new
  scroll animation.
- Progress uses left-anchored `scaleX` for `180ms`, never animated width.

## Repo conventions to follow

- Motion tokens and reduced-motion rules live in `src/app/globals.css`.
- UI primitives live in `src/components/ui/` and export through its index only
  when they are public components.
- All feedback uses `StatusBanner`, `Button`, and their existing semantic
  colors; bright yellow remains Sample-data-only.
- The canonical motion contract lives in `DESIGN.md`; this file is execution
  scaffolding, not a second design authority.

## Steps

1. Add shared motion tokens and replace the global page keyframe with static,
   frequent navigation behavior.
2. Add a shared modal-focus/presence hook and apply it to `Dialog`,
   `ConfirmDialog`, and the mobile drawer.
3. Add exact drawer/dialog CSS, inert background behavior, Escape handling,
   async confirmation feedback, and reduced-motion equivalents.
4. Improve Data Entry validation focus, offline state, and save availability
   while retaining editable drafts and atomic server confirmation.
5. Add report navigation pending state and honest export preparation/completion
   announcements for CSV, PNG, PDF, and print.
6. Add route-retry pending/focus restoration and target-heading focus.
7. Replace progress width animation with a compositor-friendly transform.
8. Add focused unit/source/e2e assertions, then run the full required gates and
   browser viewport/reduced-motion matrix.

## Boundaries

- Do NOT change destinations, vocabulary, report ownership, data semantics,
  save atomicity, permissions, or visual hierarchy.
- Do NOT add dependencies, springs, view-transition APIs, layout animation,
  chart animation, page entrance theater, or celebratory save feedback.
- Do NOT touch scanner artifacts or replace existing user-owned changes.

## Verification

- **Mechanical**: `npm test` passed 74 files / 1,170 tests;
  `npm run design-system:test` passed every guard, typecheck, and production
  build; `npm run test:e2e` passed 9/9 workflows; `git diff --check` passed.
- **Feel check**: at 360, 390, 768, 1440, and 1920 px, confirm the drawer
  originates at the left edge, rapid close/reopen retargets without jumping,
  dialogs stay centered, report/filter actions respond immediately, and no
  changed interaction causes layout shift or console errors.
- **Slow/reduced check**: inspect drawer/dialog transitions at reduced playback;
  emulate `prefers-reduced-motion: reduce` and confirm translation/scale is
  gone while opacity and semantic state remain.
- **Done when**: every state in `DESIGN.md` is observable and truthful, focus is
  trapped/restored, motion stays under its budget and on the compositor, and
  the required browser workflows pass.

All feel, reduced-motion, and done-when checks passed in the final Chrome
acceptance run. The strict review removed the global route animation and found
three interaction defects during verification: a focusable skip link behind
the drawer, a portal-mount initial-focus race, and a server-error retry that
needed a fresh route request. All three were corrected and rerun in Chrome.
