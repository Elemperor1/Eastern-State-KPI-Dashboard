import { describe, expect, it } from "vitest";
import {
  buildIndexedTrendBaselines,
  buildRawTrendData,
  buildTrendExplorerModel,
  defaultTrendAxisMode,
  defaultTrendYears,
  filterVisibleTrendKpis,
  selectInitialTrendKpiSlugs,
  transformTrendData,
} from "./trend-explorer";
import type {
  Category,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";

const museumCategory: Category = {
  id: 1,
  slug: "museum",
  name: "Museum",
  description: "Museum metrics",
  sort_order: 1,
};

const developmentCategory: Category = {
  id: 2,
  slug: "development",
  name: "Development",
  description: "Development metrics",
  sort_order: 2,
};

const operationsCategory: Category = {
  id: 3,
  slug: "operations",
  name: "Operations",
  description: "Operations metrics",
  sort_order: 3,
};

function kpi(
  category: Category,
  overrides: Partial<KPIWithCategory>,
): KPIWithCategory {
  return {
    id: 1,
    category_id: category.id,
    parent_id: null,
    slug: "visitors",
    name: "Visitors",
    unit: "visitors",
    unit_type: "count",
    reporting_frequency: "monthly",
    direction: "higher",
    description: null,
    sort_order: 1,
    is_active: 1,
    created_at: "2026-01-01",
    category_name: category.name,
    category_slug: category.slug,
    ...overrides,
  };
}

function entry(
  kpiRecord: KPIWithCategory,
  overrides: Partial<MonthlyEntryWithMeta>,
): MonthlyEntryWithMeta {
  return {
    id: 1,
    kpi_id: kpiRecord.id,
    year: 2026,
    month: 1,
    value: 10,
    notes: null,
    updated_by: null,
    updated_at: "2026-01-01",
    kpi_name: kpiRecord.name,
    kpi_unit: kpiRecord.unit,
    kpi_unit_type: kpiRecord.unit_type,
    category_id: kpiRecord.category_id,
    category_name: kpiRecord.category_name,
    category_slug: kpiRecord.category_slug,
    ...overrides,
  };
}

const visitorsKpi = kpi(museumCategory, {
  id: 1,
  slug: "visitors",
  name: "Visitors",
});

const admissionsKpi = kpi(museumCategory, {
  id: 2,
  slug: "admissions",
  name: "Admissions",
});

const revenueKpi = kpi(developmentCategory, {
  id: 3,
  slug: "revenue",
  name: "Revenue",
  unit: "USD",
  unit_type: "currency",
});

const annualKpi = kpi(operationsCategory, {
  id: 4,
  slug: "annual-budget",
  name: "Annual budget",
  reporting_frequency: "annual",
  unit_type: "currency",
});

const breakdownKpi = kpi(developmentCategory, {
  id: 5,
  slug: "funders-by-type",
  name: "Funders by type",
  unit_type: "breakdown",
});

const allKpis = [
  visitorsKpi,
  admissionsKpi,
  revenueKpi,
  annualKpi,
  breakdownKpi,
];

describe("reporting trend explorer model", () => {
  it("selects the same default KPIs, years, and axis mode as the existing trend view", () => {
    expect(selectInitialTrendKpiSlugs(allKpis)).toEqual([
      "visitors",
      "revenue",
      "annual-budget",
    ]);
    expect(selectInitialTrendKpiSlugs(allKpis, 2)).toEqual(["visitors", "revenue"]);
    expect(defaultTrendYears([2022, 2023, 2024, 2025, 2026])).toEqual([2024, 2025, 2026]);
    expect(defaultTrendAxisMode(["visitors"])).toBe("shared");
    expect(defaultTrendAxisMode(["visitors", "revenue"])).toBe("indexed");
  });

  it("shows only monthly non-breakdown KPIs in the category selector list", () => {
    expect(filterVisibleTrendKpis(allKpis, "all").map((item) => item.slug)).toEqual([
      "visitors",
      "admissions",
      "revenue",
    ]);
    expect(filterVisibleTrendKpis(allKpis, "development").map((item) => item.slug)).toEqual([
      "revenue",
    ]);
    expect(filterVisibleTrendKpis(allKpis, "operations")).toEqual([]);
  });

  it("builds raw monthly series while excluding month 0 annual snapshots", () => {
    const rawTrendData = buildRawTrendData({
      kpis: allKpis,
      kpiSlugs: ["visitors"],
      selectedYears: [2025, 2026],
      entries: [
        entry(visitorsKpi, { id: 1, year: 2026, month: 0, value: 999 }),
        entry(visitorsKpi, { id: 2, year: 2026, month: 1, value: 10 }),
        entry(visitorsKpi, { id: 3, year: 2026, month: 1, value: 2 }),
        entry(visitorsKpi, { id: 4, year: 2026, month: 2, value: 20 }),
        entry(visitorsKpi, { id: 5, year: 2025, month: 1, value: 5 }),
        entry(visitorsKpi, { id: 6, year: 2024, month: 1, value: 100 }),
      ],
    });

    expect(rawTrendData).toHaveLength(12);
    expect(rawTrendData[0]).toMatchObject({
      label: "Jan",
      month: 1,
      visitors__2025: 5,
      visitors__2026: 12,
    });
    expect(rawTrendData[1]).toMatchObject({
      label: "Feb",
      month: 2,
      visitors__2025: null,
      visitors__2026: 20,
    });
    expect(rawTrendData[2]?.visitors__2026).toBeNull();
  });

  it("normalizes indexed mode against the first non-null non-zero monthly value", () => {
    const rawTrendData = buildRawTrendData({
      kpis: [visitorsKpi, revenueKpi],
      kpiSlugs: ["visitors", "revenue"],
      selectedYears: [2026],
      entries: [
        entry(visitorsKpi, { id: 1, year: 2026, month: 1, value: 0 }),
        entry(visitorsKpi, { id: 2, year: 2026, month: 2, value: 50 }),
        entry(visitorsKpi, { id: 3, year: 2026, month: 3, value: 100 }),
        entry(revenueKpi, { id: 4, year: 2026, month: 1, value: 0 }),
        entry(revenueKpi, { id: 5, year: 2026, month: 2, value: 0 }),
      ],
    });
    const indexedBaselines = buildIndexedTrendBaselines({
      axisMode: "indexed",
      rawTrendData,
      kpiSlugs: ["visitors", "revenue"],
      selectedYears: [2026],
    });
    const trendData = transformTrendData({
      axisMode: "indexed",
      rawTrendData,
      indexedBaselines,
      kpiSlugs: ["visitors", "revenue"],
      selectedYears: [2026],
    });

    expect(indexedBaselines).toEqual({
      visitors__2026: 50,
      revenue__2026: null,
    });
    expect(trendData[0]?.visitors__2026).toBe(0);
    expect(trendData[1]?.visitors__2026).toBe(100);
    expect(trendData[2]?.visitors__2026).toBe(200);
    expect(trendData[0]?.revenue__2026).toBeNull();
  });

  it("drops non-positive values in log mode instead of producing invalid chart values", () => {
    const rawTrendData = buildRawTrendData({
      kpis: [visitorsKpi],
      kpiSlugs: ["visitors"],
      selectedYears: [2026],
      entries: [
        entry(visitorsKpi, { id: 1, year: 2026, month: 1, value: 0 }),
        entry(visitorsKpi, { id: 2, year: 2026, month: 2, value: -10 }),
        entry(visitorsKpi, { id: 3, year: 2026, month: 3, value: 100 }),
      ],
    });
    const trendData = transformTrendData({
      axisMode: "log",
      rawTrendData,
      indexedBaselines: {},
      kpiSlugs: ["visitors"],
      selectedYears: [2026],
    });

    expect(trendData[0]?.visitors__2026).toBeNull();
    expect(trendData[1]?.visitors__2026).toBeNull();
    expect(trendData[2]?.visitors__2026).toBe(2);
  });

  it("builds render-ready labels, series metadata, export rows, and empty states", () => {
    const model = buildTrendExplorerModel(
      {
        kpis: allKpis,
        entries: [
          entry(visitorsKpi, { id: 1, year: 2026, month: 1, value: 10 }),
          entry(revenueKpi, { id: 2, year: 2026, month: 1, value: 100 }),
        ],
      },
      {
        categorySlug: "all",
        kpiSlugs: ["visitors", "revenue"],
        selectedYears: [2025, 2026],
        axisMode: "indexed",
      },
    );

    expect(model.selectedKpiFilterLabel).toBe("Visitors, Revenue");
    expect(model.selectedYearsFilterLabel).toBe("2025, 2026");
    expect(model.sampleUnitType).toBe("count");
    expect(model.series.map((series) => [series.dataKey, series.name, series.isCurrentSelection])).toEqual([
      ["visitors__2025", "Visitors 2025 (idx)", false],
      ["visitors__2026", "Visitors 2026 (idx)", true],
      ["revenue__2025", "Revenue 2025 (idx)", false],
      ["revenue__2026", "Revenue 2026 (idx)", true],
    ]);
    expect(model.csvExport.filename).toBe("eastern-state-trends-visitors+revenue-2025-2026.csv");
    expect(model.pngFileName).toBe("eastern-state-trends-visitors+revenue-2025-2026.png");
    expect(model.emptyState).toBeNull();

    const noKpis = buildTrendExplorerModel(
      { kpis: allKpis, entries: [] },
      { categorySlug: "all", kpiSlugs: [], selectedYears: [2026], axisMode: "shared" },
    );
    const noYears = buildTrendExplorerModel(
      { kpis: allKpis, entries: [] },
      { categorySlug: "all", kpiSlugs: ["visitors"], selectedYears: [], axisMode: "shared" },
    );
    expect(noKpis.emptyState?.title).toBe("Select a KPI");
    expect(noYears.emptyState?.title).toBe("Select a year");
  });
});
