import { describe, expect, it } from "vitest";
import {
  buildCategoryCsvExport,
  buildMetricCsvExport,
  buildMetricValueRows,
  buildOverviewCsvExport,
  buildTrendCsvExport,
} from "./csv";
import type { ComparePeriod, ReportingData } from "./types";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";

const category: Category = {
  id: 1,
  slug: "museum",
  name: "Museum",
  description: "Museum metrics",
  sort_order: 1,
};

function kpi(overrides: Partial<KPIWithCategory>): KPIWithCategory {
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

function entry(overrides: Partial<MonthlyEntryWithMeta>): MonthlyEntryWithMeta {
  return {
    id: 1,
    kpi_id: 1,
    year: 2026,
    month: 1,
    value: 10,
    notes: null,
    updated_by: null,
    updated_at: "2026-01-01",
    kpi_name: "Visitors",
    kpi_unit: "visitors",
    kpi_unit_type: "count",
    category_id: category.id,
    category_name: category.name,
    category_slug: category.slug,
    ...overrides,
  };
}

function breakdown(overrides: Partial<BreakdownEntryWithMeta>): BreakdownEntryWithMeta {
  return {
    id: 1,
    kpi_id: 3,
    year: 2026,
    month: 0,
    label: "Group",
    value: 10,
    sort_order: 1,
    notes: null,
    updated_by: null,
    updated_at: "2026-01-01",
    kpi_name: "Breakdown",
    kpi_unit: "count",
    category_id: category.id,
    category_name: category.name,
    category_slug: category.slug,
    ...overrides,
  };
}

const monthlyKpi = kpi({ id: 1, slug: "visitors", name: "Visitors" });
const annualKpi = kpi({
  id: 2,
  slug: "budget",
  name: "Budget",
  unit: "USD",
  unit_type: "currency",
  reporting_frequency: "annual",
});
const breakdownKpi = kpi({
  id: 3,
  slug: "donor-breakdown",
  name: "Donor Breakdown",
  unit_type: "breakdown",
});

const period: ComparePeriod = {
  currentYear: 2026,
  compareYear: 2025,
  currentMonth: 2,
};

const reportingData: ReportingData = {
  categories: [category],
  kpis: [monthlyKpi, annualKpi, breakdownKpi],
  entries: [
    entry({ id: 1, kpi_id: monthlyKpi.id, year: 2026, month: 1, value: 100, notes: "Jan current" }),
    entry({ id: 2, kpi_id: monthlyKpi.id, year: 2025, month: 1, value: 80 }),
    entry({ id: 3, kpi_id: annualKpi.id, year: 2026, month: 0, value: 5000, notes: "Approved" }),
    entry({ id: 4, kpi_id: annualKpi.id, year: 2025, month: 0, value: 4500 }),
  ],
  breakdowns: [
    breakdown({ id: 1, kpi_id: breakdownKpi.id, year: 2026, month: 0, label: "Foundations", value: 7 }),
    breakdown({ id: 2, kpi_id: breakdownKpi.id, year: 2025, month: 1, label: "Referred", value: 20 }),
  ],
};

describe("reporting CSV builders", () => {
  it("builds overview CSV rows for monthly, annual month=0, and breakdown data", () => {
    const csv = buildOverviewCsvExport(reportingData, period);

    expect(csv.columns).toEqual([
      "Category",
      "KPI",
      "Unit",
      "Reporting",
      "Year",
      "Period",
      "Value",
      "Compare_Year",
      "Compare_Value",
      "Notes",
    ]);
    expect(csv.filename).toBe("eastern-state-overview-2026-vs-2025.csv");
    expect(csv.rows).toEqual([
      {
        Category: "Museum",
        KPI: "Visitors",
        Unit: "count",
        Reporting: "monthly",
        Year: 2026,
        Period: "January",
        Value: 100,
        Compare_Year: 2025,
        Compare_Value: 80,
        Notes: "Jan current",
      },
      {
        Category: "Museum",
        KPI: "Visitors",
        Unit: "count",
        Reporting: "monthly",
        Year: 2026,
        Period: "February",
        Value: "",
        Compare_Year: 2025,
        Compare_Value: "",
        Notes: "",
      },
      {
        Category: "Museum",
        KPI: "Budget",
        Unit: "currency",
        Reporting: "annual",
        Year: 2025,
        Period: "full year",
        Value: 4500,
        Compare_Year: "",
        Compare_Value: "",
        Notes: "",
      },
      {
        Category: "Museum",
        KPI: "Budget",
        Unit: "currency",
        Reporting: "annual",
        Year: 2026,
        Period: "full year",
        Value: 5000,
        Compare_Year: "",
        Compare_Value: "",
        Notes: "Approved",
      },
      {
        Category: "Museum",
        KPI: "Donor Breakdown",
        Unit: "breakdown",
        Reporting: "breakdown",
        Year: 2026,
        Period: "Foundations",
        Value: 7,
        Compare_Year: "",
        Compare_Value: "",
        Notes: "",
      },
      {
        Category: "Museum",
        KPI: "Donor Breakdown",
        Unit: "breakdown",
        Reporting: "breakdown",
        Year: 2025,
        Period: "Referred",
        Value: 20,
        Compare_Year: "",
        Compare_Value: "",
        Notes: "",
      },
    ]);
  });

  it("builds category CSV rows with monthly breakdown period labels", () => {
    const csv = buildCategoryCsvExport(reportingData, category.slug, period);

    expect(csv.columns).toEqual([
      "KPI",
      "Unit",
      "Reporting",
      "Year",
      "Period",
      "Value",
      "Compare_Year",
      "Compare_Value",
      "Notes",
    ]);
    expect(csv.filename).toBe("eastern-state-museum-2026-vs-2025.csv");
    expect(csv.rows).toContainEqual({
      KPI: "Donor Breakdown",
      Unit: "breakdown",
      Reporting: "monthly breakdown",
      Year: 2025,
      Period: "January - Referred",
      Value: 20,
      Compare_Value: "",
      Notes: "",
    });
  });

  it("builds metric table rows and matching monthly CSV columns", () => {
    const rows = buildMetricValueRows({
      kpi: monthlyKpi,
      entries: reportingData.entries.filter((row) => row.kpi_id === monthlyKpi.id),
      period,
    });
    const csv = buildMetricCsvExport({ kpi: monthlyKpi, rows, period });

    expect(rows[0]).toEqual({
      period: "Jan 2026",
      value: 100,
      notes: "Jan current",
      compare: 80,
    });
    expect(rows).toHaveLength(12);
    expect(csv.columns).toEqual(["Period", "Value (2026)", "Value (2025)", "Notes"]);
    expect(csv.rows[0]).toEqual({
      Period: "Jan 2026",
      "Value (2026)": 100,
      "Value (2025)": 80,
      Notes: "Jan current",
    });
  });

  it("builds annual metric rows from month=0 values only", () => {
    const rows = buildMetricValueRows({
      kpi: annualKpi,
      entries: [
        ...reportingData.entries.filter((row) => row.kpi_id === annualKpi.id),
        entry({ id: 5, kpi_id: annualKpi.id, year: 2026, month: 1, value: 9999 }),
      ],
      period,
    });
    const csv = buildMetricCsvExport({ kpi: annualKpi, rows, period });

    expect(rows).toEqual([
      { period: "2025", value: 4500, notes: null },
      { period: "2026", value: 5000, notes: "Approved" },
    ]);
    expect(csv.columns).toEqual(["Year", "Value", "Notes"]);
    expect(csv.rows).toEqual([
      { Year: "2025", Value: 4500, Notes: "" },
      { Year: "2026", Value: 5000, Notes: "Approved" },
    ]);
  });

  it("builds trend CSV rows from raw monthly trend data", () => {
    const csv = buildTrendCsvExport({
      rawTrendData: [
        { label: "Jan", month: 1, visitors__2026: 100, visitors__2025: null },
      ],
      kpiSlugs: ["visitors"],
      selectedYears: [2026, 2025],
    });

    expect(csv).toEqual({
      columns: ["Month", "visitors__2026", "visitors__2025"],
      rows: [{ Month: "Jan", visitors__2026: 100, visitors__2025: "" }],
      filename: "eastern-state-trends-visitors-2026-2025.csv",
    });
  });
});
