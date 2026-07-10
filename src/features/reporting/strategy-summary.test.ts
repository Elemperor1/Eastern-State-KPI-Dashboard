import { describe, expect, it } from "vitest";
import type {
  MeasurementResult,
  StrategicGoalReadModel,
} from "@/features/strategy";
import type { KPIWithCategory, MonthlyEntryWithMeta } from "@/lib/types";
import { buildStrategicDashboardSummary } from "./strategy-summary";

const kpis: KPIWithCategory[] = [
  legacyKpi(1, "completed", "Completed projects"),
  legacyKpi(2, "future", "Future projects"),
  legacyKpi(3, "undefined", "Undefined measure"),
];

const entries: MonthlyEntryWithMeta[] = [
  legacyEntry(1, 2026, 0, 5),
  legacyEntry(2, 2026, 1, 2),
  legacyEntry(2, 2026, 2, 3),
];

describe("strategic dashboard summary", () => {
  it("rolls configured KPI progress into exact goal and priority completion counts", () => {
    const goals = [
      goal({
        id: 10,
        slug: "complete-goal",
        name: "Complete goal",
        members: [member(1, target(5, 2029))],
      }),
      goal({
        id: 11,
        slug: "not-started-goal",
        name: "Not-started goal",
        members: [member(2, target(10, 2029), "active", "monthly")],
      }),
      goal({
        id: 12,
        slug: "undefined-goal",
        name: "Undefined goal",
        configuration_status: "needs_definition",
        unresolved_question: "Confirm the goal membership.",
        members: [member(3, null, "needs_definition")],
      }),
    ];

    const summary = buildStrategicDashboardSummary({
      goals,
      kpis,
      entries,
      selectedYear: 2026,
      throughMonth: 2,
    });

    expect(summary.organization).toMatchObject({
      completedGoalsCount: 1,
      totalEligibleGoalsCount: 2,
      completionPercentage: 50,
      excludedGoalsCount: 1,
    });
    expect(summary.organization.excludedGoalReasons[0]).toMatchObject({
      goalName: "Undefined goal",
      reasons: ["GOAL_NEEDS_DEFINITION"],
    });
    expect(summary.priorities[0]).toMatchObject({
      priorityName: "Priority One",
      completedGoalsCount: 1,
      totalEligibleGoalsCount: 2,
    });
    expect(summary.goals[1]?.kpis[0]).toMatchObject({
      currentValue: 5,
      fullPlanTarget: 10,
    });
  });

  it("keeps a configured target with no actual as eligible not-started progress", () => {
    const summary = buildStrategicDashboardSummary({
      goals: [goal({ members: [member(2, target(10, 2029))] })],
      kpis,
      entries: [],
      selectedYear: 2026,
    });

    expect(summary.organization.totalEligibleGoalsCount).toBe(1);
    expect(summary.organization.completedGoalsCount).toBe(0);
    expect(summary.goals[0]?.kpis[0]?.completionProgress.status).toBe("not_started");
  });

  it("distinguishes a zero target from a missing target", () => {
    const zero = buildStrategicDashboardSummary({
      goals: [goal({ members: [member(1, target(0, 2029))] })],
      kpis,
      entries: [legacyEntry(1, 2026, 0, 0)],
      selectedYear: 2026,
    });
    const missing = buildStrategicDashboardSummary({
      goals: [goal({ members: [member(1, null, "ready")] })],
      kpis,
      entries,
      selectedYear: 2026,
    });

    expect(zero.organization.completedGoalsCount).toBe(1);
    expect(missing.organization.totalEligibleGoalsCount).toBe(0);
    expect(missing.goals[0]?.result.exclusionReasons).toContain("needs_target");
  });

  it("prefers first-class observations to compatibility entries", () => {
    const summary = buildStrategicDashboardSummary({
      goals: [goal({ members: [member(1, target(10, 2029))] })],
      kpis,
      entries,
      selectedYear: 2026,
      actuals: [{
        kpiId: 1,
        year: 2026,
        periodType: "annual",
        periodIndex: 0,
        value: 8,
        calculation: scalarCalculation(8),
      }],
    });

    expect(summary.goals[0]?.kpis[0]?.currentValue).toBe(8);
    expect(summary.goals[0]?.kpis[0]?.fullPlanProgress.actualProgressPercentage).toBe(80);
  });

  it("keeps selected-year actual separate from cumulative full-plan actual", () => {
    const cumulativeMember = member(1, target(5, 2029));
    cumulativeMember.configuration!.measurement_type = "cumulative";
    const summary = buildStrategicDashboardSummary({
      goals: [goal({ members: [cumulativeMember] })],
      kpis,
      entries: [
        legacyEntry(1, 2025, 0, 1),
        legacyEntry(1, 2026, 0, 2),
      ],
      selectedYear: 2026,
    });

    expect(summary.goals[0]?.kpis[0]).toMatchObject({
      annualActual: 2,
      cumulativeActual: 3,
      annualProgress: { currentValue: 2 },
      fullPlanProgress: {
        currentValue: 3,
        actualProgressPercentage: 60,
      },
    });
  });

  it("separates annual completion from year-to-date pacing", () => {
    const pacedMember = member(2, target(30, 2029), "active", "monthly");
    pacedMember.targets.push(annualTarget(12, 2026));
    const summary = buildStrategicDashboardSummary({
      goals: [goal({ members: [pacedMember] })],
      kpis,
      entries: [],
      selectedYear: 2026,
      throughMonth: 6,
      actuals: [{
        kpiId: 2,
        year: 2026,
        periodType: "monthly",
        periodIndex: 6,
        value: 6,
        calculation: scalarCalculation(6),
      }],
    });

    expect(summary.goals[0]?.kpis[0]).toMatchObject({
      annualActual: 6,
      annualPacingTarget: 6,
      annualPacing: {
        status: "complete",
        actualProgressPercentage: 100,
      },
      annualProgress: {
        status: "in_progress",
        actualProgressPercentage: 50,
      },
      fullPlanProgress: {
        actualProgressPercentage: 20,
      },
    });
  });

  it("treats a ready description-only binary target as the completed state", () => {
    const binaryMember = member(1, null, "active");
    binaryMember.configuration!.measurement_type = "binary";
    binaryMember.targets = [
      {
        ...target(1, 2029),
        target_value: null,
        target_description: "Complete the board-approved adoption milestone.",
      },
    ];
    const summary = buildStrategicDashboardSummary({
      goals: [goal({ members: [binaryMember] })],
      kpis,
      entries: [],
      selectedYear: 2026,
      actuals: [{
        kpiId: 1,
        year: 2026,
        periodType: "annual",
        periodIndex: 0,
        value: 1,
        calculation: {
          ...scalarCalculation(1),
          measurementType: "binary",
          normalizedPercentage: 100,
        },
      }],
    });

    expect(summary.organization).toMatchObject({
      completedGoalsCount: 1,
      totalEligibleGoalsCount: 1,
    });
    expect(summary.goals[0]?.kpis[0]?.fullPlanTarget).toBe(1);
  });

  it("never lets a draft numeric target drive goal completion", () => {
    const draftTarget = { ...target(5, 2029), configuration_status: "draft" as const };
    const summary = buildStrategicDashboardSummary({
      goals: [goal({ members: [member(1, draftTarget)] })],
      kpis,
      entries: [legacyEntry(1, 2026, 0, 5)],
      selectedYear: 2026,
    });

    expect(summary.organization.totalEligibleGoalsCount).toBe(0);
    expect(summary.goals[0]?.kpis[0]).toMatchObject({
      fullPlanTarget: null,
      fullPlanProgress: { status: "target_not_finalized" },
    });
  });
});

function legacyKpi(id: number, slug: string, name: string): KPIWithCategory {
  return {
    id,
    category_id: 1,
    parent_id: null,
    slug,
    name,
    unit: "items",
    unit_type: "count",
    reporting_frequency: "annual",
    direction: "higher",
    description: null,
    sort_order: id,
    is_active: 1,
    created_at: "2026-01-01",
    category_name: "Priority One",
    category_slug: "priority-one",
  };
}

function legacyEntry(
  kpiId: number,
  year: number,
  month: number,
  value: number,
): MonthlyEntryWithMeta {
  const kpi = kpis.find((item) => item.id === kpiId) ?? legacyKpi(kpiId, "kpi", "KPI");
  return {
    id: kpiId * 100 + month,
    kpi_id: kpiId,
    year,
    month,
    value,
    notes: null,
    updated_by: null,
    updated_at: "2026-01-01",
    kpi_name: kpi.name,
    kpi_unit: kpi.unit,
    kpi_unit_type: kpi.unit_type,
    category_id: 1,
    category_name: "Priority One",
    category_slug: "priority-one",
  };
}

function goal(
  overrides: Partial<StrategicGoalReadModel> = {},
): StrategicGoalReadModel {
  return {
    id: 1,
    priority_id: 1,
    priority_slug: "priority-one",
    priority_name: "Priority One",
    slug: "goal-one",
    name: "Goal One",
    description: null,
    plan_start_year: 2025,
    plan_end_year: 2029,
    completion_rule: "all_required_kpis",
    threshold_count: null,
    threshold_percentage: null,
    manual_status: null,
    board_level_status: "not_started",
    configuration_status: "active",
    unresolved_question: null,
    owner: null,
    due_date: null,
    resolution_notes: null,
    source_reference: null,
    last_reviewed_date: null,
    sort_order: 1,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01",
    updated_by: null,
    updated_at: "2026-01-01",
    members: [],
    ...overrides,
  };
}

function member(
  kpiId: number,
  configuredTarget:
    | StrategicGoalReadModel["members"][number]["targets"][number]
    | null,
  configurationStatus: "active" | "ready" | "needs_definition" = "active",
  reportingFrequency: "annual" | "monthly" = "annual",
): StrategicGoalReadModel["members"][number] {
  const kpi = kpis.find((item) => item.id === kpiId) ?? legacyKpi(kpiId, "kpi", "KPI");
  return {
    id: kpiId,
    goal_id: 1,
    kpi_id: kpiId,
    role: "required",
    weight: 1,
    display_order: kpiId,
    effective_from_year: 2025,
    effective_to_year: null,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01",
    updated_by: null,
    updated_at: "2026-01-01",
    kpi: {
      id: kpi.id,
      slug: kpi.slug,
      name: kpi.name,
      unit: kpi.unit,
      category_id: kpi.category_id,
      category_slug: kpi.category_slug,
      category_name: kpi.category_name,
    },
    configuration: {
      id: kpiId,
      kpi_id: kpiId,
      effective_from_year: 2025,
      effective_to_year: null,
      measurement_type: "count",
      unit: "items",
      numerator_label: null,
      denominator_label: null,
      fixed_denominator: null,
      baseline_value: null,
      reporting_frequency: reportingFrequency,
      aggregation_method: "none",
      board_level_status: "not_started",
      calculation_precision: 1,
      configuration_status: configurationStatus,
      unresolved_question: null,
      owner: null,
      due_date: null,
      resolution_notes: null,
      source_reference: null,
      last_reviewed_date: null,
      allow_score_over_max: false,
      archived_at: null,
      created_by: null,
      created_at: "2026-01-01",
      updated_by: null,
      updated_at: "2026-01-01",
    },
    targets: configuredTarget ? [configuredTarget] : [],
    components: [],
  };
}

function target(value: number, targetYear: number) {
  return {
    id: 1,
    kpi_id: 1,
    component_id: null,
    target_scope: "full_plan" as const,
    reporting_year: null,
    target_year: targetYear,
    external_target_year: false,
    target_value: value,
    structured_target: null,
    target_description: `Reach ${value} by ${targetYear}.`,
    baseline_year: null,
    baseline_value: null,
    configuration_status: "active" as const,
    source_reference: null,
    last_reviewed_date: null,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01",
    updated_by: null,
    updated_at: "2026-01-01",
  };
}

function annualTarget(value: number, reportingYear: number) {
  return {
    ...target(value, reportingYear),
    id: 2,
    target_scope: "annual" as const,
    reporting_year: reportingYear,
  };
}

function scalarCalculation(value: number): MeasurementResult {
  return {
    state: "ok",
    measurementType: "count",
    value,
    normalizedPercentage: null,
    numerator: null,
    denominator: null,
    respondentCount: null,
    precision: 1,
    issues: [],
  };
}
