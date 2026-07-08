import { describe, expect, it } from "vitest";
import {
  buildAdminGoalCategorySummaries,
  buildAdminGoalKpiOptions,
  buildAdminGoalYearOptions,
  countEnabledAdminGoals,
  filterAdminGoals,
  formatAdminGoalChangeLabel,
  formatAdminGoalTarget,
} from "./admin-goals";
import type { KPIWithCategory, KpiGoalWithMeta } from "@/lib/types";

function kpi(id: number, name: string, categoryId: number, categoryName: string): KPIWithCategory {
  return {
    id,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    description: null,
    category_id: categoryId,
    category_name: categoryName,
    category_slug: categoryName.toLowerCase().replaceAll(" ", "-"),
    unit: "people",
    unit_type: "count",
    direction: "higher",
    reporting_frequency: "monthly",
    sort_order: id,
    is_active: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    parent_id: null,
  };
}

function goal(
  id: number,
  kpiId: number,
  name: string,
  categoryId: number,
  categoryName: string,
  year = 2026,
): KpiGoalWithMeta {
  return {
    id,
    kpi_id: kpiId,
    target_year: year,
    baseline_year: year - 1,
    goal_type: "pct",
    target_value: 20,
    enabled: id !== 2,
    notes: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_by: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    kpi_name: name,
    kpi_slug: name.toLowerCase().replaceAll(" ", "-"),
    kpi_unit: "people",
    kpi_unit_type: "count",
    category_id: categoryId,
    category_name: categoryName,
    category_slug: categoryName.toLowerCase().replaceAll(" ", "-"),
    direction: "higher",
    reporting_frequency: "monthly",
    progress_year: year,
    ytd_value: null,
    ytd_target: null,
    ytd_progress_pct: null,
    full_year_value: null,
    full_year_target: 120,
    full_year_progress_pct: null,
  };
}

describe("admin goal view helpers", () => {
  const kpis = [
    kpi(1, "Video views", 10, "Education"),
    kpi(2, "Donors", 20, "Fundraising"),
    kpi(3, "Attendance", 10, "Education"),
  ];
  const goals = [
    goal(1, 1, "Video views", 10, "Education"),
    goal(2, 2, "Donors", 20, "Fundraising"),
    goal(3, 3, "Attendance", 10, "Education", 2025),
  ];

  it("builds category filter summaries in KPI order with goal counts", () => {
    expect(buildAdminGoalCategorySummaries(kpis, goals)).toEqual([
      { id: 10, name: "Education", goalCount: 2 },
      { id: 20, name: "Fundraising", goalCount: 1 },
    ]);
  });

  it("filters goals by category, KPI name, and slug", () => {
    expect(filterAdminGoals(goals, { query: "video", categoryId: null }).map((g) => g.id)).toEqual([1]);
    expect(filterAdminGoals(goals, { query: "donor", categoryId: null }).map((g) => g.id)).toEqual([2]);
    expect(filterAdminGoals(goals, { query: "", categoryId: 10 }).map((g) => g.id)).toEqual([1, 3]);
  });

  it("counts enabled goals and splits KPI options for the selected year", () => {
    expect(countEnabledAdminGoals(goals)).toBe(2);
    expect(buildAdminGoalKpiOptions(kpis, goals, 2026)).toEqual({
      availableKpis: [kpis[2]],
      unavailableKpis: [kpis[0], kpis[1]],
    });
  });

  it("builds the rolling five-year target list from a supplied current year", () => {
    expect(buildAdminGoalYearOptions(2026)).toEqual([2025, 2026, 2027, 2028, 2029]);
  });

  it("formats goal deltas and target values for display", () => {
    expect(formatAdminGoalChangeLabel(goal(1, 1, "Video views", 10, "Education"))).toBe("+20%");
    expect(formatAdminGoalChangeLabel({ goal_type: "number", target_value: -3 })).toBe("-3");
    expect(formatAdminGoalTarget(1200.25)).toBe("1,200.3");
    expect(formatAdminGoalTarget(null)).toBe("—");
  });
});
