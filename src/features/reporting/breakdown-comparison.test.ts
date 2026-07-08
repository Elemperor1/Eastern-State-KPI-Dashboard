import { describe, expect, it } from "vitest";
import { buildBreakdownComparisonModel } from "./breakdown-comparison";
import type { BreakdownEntryWithMeta } from "@/lib/types";

function breakdown(
  overrides: Partial<BreakdownEntryWithMeta>,
): BreakdownEntryWithMeta {
  return {
    id: 1,
    kpi_id: 20,
    year: 2026,
    month: 0,
    label: "Foundations",
    value: 0,
    sort_order: 0,
    notes: null,
    updated_by: null,
    updated_at: "2026-01-01",
    kpi_name: "Funders by breakdown",
    kpi_unit: "funders",
    category_id: 1,
    category_name: "Fundraising",
    category_slug: "fundraising",
    ...overrides,
  };
}

describe("breakdown comparison reporting model", () => {
  it("orders labels by first sort order and sums current/compare values per label", () => {
    const model = buildBreakdownComparisonModel({
      currentYear: 2026,
      compareYear: 2025,
      breakdowns: [
        breakdown({ id: 1, year: 2026, label: "Individuals", value: 8, sort_order: 2 }),
        breakdown({ id: 2, year: 2026, label: "Foundations", value: 10, sort_order: 1 }),
        breakdown({ id: 3, year: 2026, label: "Foundations", value: 5, sort_order: 1 }),
        breakdown({ id: 4, year: 2025, label: "Foundations", value: 12, sort_order: 1 }),
        breakdown({ id: 5, year: 2025, label: "Individuals", value: 4, sort_order: 2 }),
      ],
    });

    expect(model.rows).toEqual([
      { label: "Foundations", currentValue: 15, compareValue: 12, delta: 3 },
      { label: "Individuals", currentValue: 8, compareValue: 4, delta: 4 },
    ]);
    expect(model.chartData).toEqual([
      { label: "Foundations", 2026: 15, 2025: 12 },
      { label: "Individuals", 2026: 8, 2025: 4 },
    ]);
    expect(model.totalCurrent).toBe(23);
    expect(model.totalCompare).toBe(16);
    expect(model.pctChange).toBe(43.75);
    expect(model.showCompare).toBe(true);
  });

  it("keeps compare hidden and percent change empty when compare-year rows are absent", () => {
    const model = buildBreakdownComparisonModel({
      currentYear: 2026,
      compareYear: 2025,
      breakdowns: [
        breakdown({ id: 1, year: 2026, label: "Foundations", value: 10, sort_order: 1 }),
      ],
    });

    expect(model.rows).toEqual([
      { label: "Foundations", currentValue: 10, compareValue: 0, delta: 10 },
    ]);
    expect(model.totalCompare).toBe(0);
    expect(model.pctChange).toBeNull();
    expect(model.showCompare).toBe(false);
  });
});
