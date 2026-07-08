import { describe, expect, it } from "vitest";
import type { KpiGoalWithMeta } from "@/lib/types";
import { selectReportingGoal } from "./goal-selection";

function goal(
  id: number,
  kpiId: number,
  targetYear: number,
  enabled = true,
): KpiGoalWithMeta {
  return {
    id,
    kpi_id: kpiId,
    target_year: targetYear,
    goal_type: "number",
    target_value: 1,
    enabled,
    notes: null,
    created_by: null,
    created_at: "2026-07-08T00:00:00.000Z",
    updated_by: null,
    updated_at: "2026-07-08T00:00:00.000Z",
    kpi_name: "Strategic Goal — Measure",
    kpi_slug: "measure",
    kpi_unit: "count",
    kpi_unit_type: "count",
    category_id: 1,
    category_name: "Priority",
    category_slug: "priority",
    direction: "higher",
    reporting_frequency: "annual",
    ytd_value: null,
    ytd_target: null,
    ytd_progress_pct: null,
    full_year_value: null,
    full_year_target: null,
    full_year_progress_pct: null,
  };
}

describe("reporting goal selection", () => {
  it("prefers the selected year, then the nearest enabled upcoming target", () => {
    const goals = [
      goal(1, 10, 2029),
      goal(2, 10, 2027),
      goal(3, 10, 2026),
      goal(4, 10, 2025),
      goal(5, 20, 2026),
    ];

    expect(selectReportingGoal(goals, 10, 2026)?.id).toBe(3);
    expect(selectReportingGoal(goals, 10, 2027)?.id).toBe(2);
    expect(selectReportingGoal(goals, 10, 2028)?.id).toBe(1);
  });

  it("ignores disabled, past, and other-KPI goals", () => {
    const goals = [
      goal(1, 10, 2025),
      goal(2, 10, 2027, false),
      goal(3, 20, 2027),
    ];

    expect(selectReportingGoal(goals, 10, 2026)).toBeNull();
  });
});
