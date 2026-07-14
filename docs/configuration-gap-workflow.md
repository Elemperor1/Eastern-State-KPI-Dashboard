# Needs attention workflow

Setup → Measures is the single place to finish incomplete measure setup. Use
the **Needs attention** filter; the former Configuration Gaps page is removed.

## What people see

- **Needs attention** — a definition, target, owner, or answer is still missing.
- **Ready** — the measure can be used for reporting.
- **Archived** — the measure is kept for history but is not in current reporting.

The database retains the more precise internal states `draft`,
`needs_definition`, `needs_target`, `ready`, `active`, and `archived`. Production
screens translate them into the three labels above wherever the distinction is
not needed for the task.

## Resolve an item

1. Open Setup → Measures → Needs attention.
2. Choose a measure.
3. Complete **How this measure works**, its reporting fields, and its target in
   Setup → Goals.
4. Record the owner, due date, source, and the question that still needs an
   answer when the item cannot be finished yet.
5. Save it as Ready when reporting can begin.

Missing information is never turned into zero. A measure that still needs
attention remains visible in reporting with a reason and is not counted as a
failed goal. Every saved change keeps its before/after record and actor in
Setup → Activity.

Historical reports continue to use the setup that applied to their reporting
year. Changing calculation rules after values exist requires a future change,
so earlier results are not silently recalculated.
