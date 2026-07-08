import { describe, expect, it } from "vitest";
import {
  buildDonorConversionModel,
  donorConversionRate,
} from "./donor-conversion";
import type { BreakdownEntryWithMeta } from "@/lib/types";

function breakdown(
  overrides: Partial<BreakdownEntryWithMeta>,
): BreakdownEntryWithMeta {
  return {
    id: 1,
    kpi_id: 10,
    year: 2026,
    month: 1,
    label: "Referred",
    value: 0,
    sort_order: 0,
    notes: null,
    updated_by: null,
    updated_at: "2026-01-01",
    kpi_name: "Donor conversion",
    kpi_unit: "%",
    category_id: 1,
    category_name: "Fundraising",
    category_slug: "fundraising",
    ...overrides,
  };
}

describe("donor conversion reporting model", () => {
  it("builds monthly rows, totals, chart data, and point change through the selected month", () => {
    const rows = [
      breakdown({ id: 1, year: 2026, month: 1, label: "Referred", value: 20 }),
      breakdown({ id: 2, year: 2026, month: 1, label: "Donors", value: 10 }),
      breakdown({ id: 3, year: 2026, month: 2, label: "Referred", value: 10 }),
      breakdown({ id: 4, year: 2026, month: 2, label: "Donors", value: 2 }),
      breakdown({ id: 5, year: 2026, month: 3, label: "Referred", value: 999 }),
      breakdown({ id: 6, year: 2025, month: 1, label: "Referred", value: 20 }),
      breakdown({ id: 7, year: 2025, month: 1, label: "Donors", value: 5 }),
      breakdown({ id: 8, year: 2025, month: 2, label: "Referred", value: 10 }),
      breakdown({ id: 9, year: 2025, month: 2, label: "Donors", value: 1 }),
    ];

    const model = buildDonorConversionModel({
      breakdowns: rows,
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 2,
    });

    expect(model.showCompare).toBe(true);
    expect(model.monthlyRows.map((row) => row.monthLabel)).toEqual(["Jan", "Feb"]);
    expect(model.currentTotal).toEqual({
      referred: 30,
      donors: 12,
      conversionPct: 40,
    });
    expect(model.compareTotal).toEqual({
      referred: 30,
      donors: 6,
      conversionPct: 20,
    });
    expect(model.pointChange).toBe(20);
    expect(model.monthlyRows[0].pointChange).toBe(25);
    expect(model.conversionChartData).toEqual([
      { month: "Jan", 2026: 50, 2025: 25 },
      { month: "Feb", 2026: 20, 2025: 10 },
    ]);
    expect(model.volumeChartData).toEqual([
      { month: "Jan", Referred: 20, Donors: 10 },
      { month: "Feb", Referred: 10, Donors: 2 },
    ]);
  });

  it("keeps zero-denominator conversions null while charting them as zero", () => {
    const rows = [
      breakdown({ id: 1, year: 2026, month: 1, label: "Donors", value: 5 }),
      breakdown({ id: 2, year: 2025, month: 1, label: "Donors", value: 3 }),
    ];

    const model = buildDonorConversionModel({
      breakdowns: rows,
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 1,
    });

    expect(donorConversionRate(rows, 2026, 1)).toBeNull();
    expect(model.currentTotal.conversionPct).toBeNull();
    expect(model.compareTotal.conversionPct).toBeNull();
    expect(model.pointChange).toBeNull();
    expect(model.monthlyRows[0].pointChange).toBeNull();
    expect(model.conversionChartData).toEqual([{ month: "Jan", 2026: 0, 2025: 0 }]);
  });

  it("omits compare chart series when the compare year has no rows", () => {
    const model = buildDonorConversionModel({
      breakdowns: [
        breakdown({ id: 1, year: 2026, month: 1, label: "Referred", value: 20 }),
        breakdown({ id: 2, year: 2026, month: 1, label: "Donors", value: 10 }),
      ],
      currentYear: 2026,
      compareYear: 2025,
      currentMonth: 1,
    });

    expect(model.showCompare).toBe(false);
    expect(model.conversionChartData).toEqual([{ month: "Jan", 2026: 50 }]);
  });
});
