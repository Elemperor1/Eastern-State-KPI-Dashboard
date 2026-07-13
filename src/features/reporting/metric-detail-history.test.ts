import { describe, expect, it } from "vitest";
import type { MonthlyEntryWithMeta } from "@/lib/types";
import type { StrategicCalculatedActual } from "./strategy-actuals";
import { buildMetricDetailStrategicHistory } from "./metric-detail-history";

describe("buildMetricDetailStrategicHistory", () => {
  it("recalculates retained raw-count YOY rows instead of presenting counts as results", () => {
    const history = buildMetricDetailStrategicHistory({
      kpiId: 7,
      throughYear: 2026,
      firstClassHistory: [],
      legacyEntries: [
        entry(2024, 12),
        entry(2025, 14),
        entry(2026, 17),
        entry(2027, 20),
      ],
      measurementType: "year_over_year",
      reportingFrequency: "annual",
      legacyUnit: "partnerships",
    });

    expect(history.map((actual) => ({
      year: actual.year,
      periodType: actual.periodType,
      value: actual.calculation.value,
      numerator: actual.calculation.numerator,
      denominator: actual.calculation.denominator,
    }))).toEqual([
      {
        year: 2025,
        periodType: "annual",
        value: 16.7,
        numerator: 2,
        denominator: 12,
      },
      {
        year: 2026,
        periodType: "annual",
        value: 21.4,
        numerator: 3,
        denominator: 14,
      },
    ]);
  });

  it("retains direct legacy YOY percentages with explicit provenance", () => {
    const history = buildMetricDetailStrategicHistory({
      kpiId: 7,
      throughYear: 2026,
      firstClassHistory: [],
      legacyEntries: [entry(2025, 8.5, "%"), entry(2026, 10, "%")],
      measurementType: "year_over_year",
      reportingFrequency: "annual",
      legacyUnit: "%",
    });

    expect(history.map(({ calculation }) => ({
      value: calculation.value,
      normalizedPercentage: calculation.normalizedPercentage,
      calculationProvenance: calculation.calculationProvenance,
    }))).toEqual([
      {
        value: 8.5,
        normalizedPercentage: 8.5,
        calculationProvenance: "legacy_direct_percentage",
      },
      {
        value: 10,
        normalizedPercentage: 10,
        calculationProvenance: "legacy_direct_percentage",
      },
    ]);
  });

  it("retains cumulative annual rows as annual strategic history", () => {
    const history = buildMetricDetailStrategicHistory({
      kpiId: 7,
      throughYear: 2026,
      firstClassHistory: [],
      legacyEntries: [entry(2025, 1, "upgrades"), entry(2026, 2, "upgrades")],
      measurementType: "cumulative",
      reportingFrequency: "annual",
      legacyUnit: "upgrades",
    });

    expect(history.map((actual) => ({
      year: actual.year,
      periodType: actual.periodType,
      value: actual.calculation.value,
      calculationProvenance: actual.calculation.calculationProvenance,
    }))).toEqual([
      {
        year: 2025,
        periodType: "annual",
        value: 1,
        calculationProvenance: "legacy_direct_value",
      },
      {
        year: 2026,
        periodType: "annual",
        value: 2,
        calculationProvenance: "legacy_direct_value",
      },
    ]);
  });

  it("retains binary legacy rows with one-time cadence semantics", () => {
    const history = buildMetricDetailStrategicHistory({
      kpiId: 7,
      throughYear: 2026,
      firstClassHistory: [],
      legacyEntries: [entry(2025, 0, "Yes/No"), entry(2026, 1, "Yes/No")],
      measurementType: "binary",
      reportingFrequency: "one_time",
      legacyUnit: "Yes/No",
    });

    expect(history.map((actual) => ({
      year: actual.year,
      periodType: actual.periodType,
      value: actual.calculation.value,
      normalizedPercentage: actual.calculation.normalizedPercentage,
      calculationProvenance: actual.calculation.calculationProvenance,
    }))).toEqual([
      {
        year: 2025,
        periodType: "one_time",
        value: 0,
        normalizedPercentage: 0,
        calculationProvenance: "legacy_direct_value",
      },
      {
        year: 2026,
        periodType: "one_time",
        value: 1,
        normalizedPercentage: 100,
        calculationProvenance: "legacy_direct_value",
      },
    ]);
  });

  it("uses first-class observations without mixing in compatibility rows", () => {
    const firstClass = strategicActual();

    const history = buildMetricDetailStrategicHistory({
      kpiId: 7,
      throughYear: 2026,
      firstClassHistory: [firstClass],
      legacyEntries: [entry(2025, 1), entry(2026, 2)],
      measurementType: "cumulative",
      reportingFrequency: "annual",
      legacyUnit: "upgrades",
    });

    expect(history).toEqual([firstClass]);
  });
});

function entry(year: number, value: number, unit = "partnerships"): MonthlyEntryWithMeta {
  return {
    id: year,
    kpi_id: 7,
    year,
    month: 0,
    value,
    notes: null,
    updated_by: null,
    updated_at: `${year}-12-31 00:00:00`,
    kpi_name: "Test KPI",
    kpi_unit: unit,
    kpi_unit_type: unit === "%" ? "percent" : "count",
    category_id: 1,
    category_name: "Test priority",
    category_slug: "test-priority",
  };
}

function strategicActual(): StrategicCalculatedActual {
  return {
    kpiId: 7,
    year: 2026,
    periodType: "annual",
    periodIndex: 0,
    value: 9,
    calculation: {
      state: "ok",
      measurementType: "cumulative",
      value: 9,
      normalizedPercentage: null,
      numerator: null,
      denominator: null,
      respondentCount: null,
      precision: 0,
      issues: [],
    },
  };
}
