import { describe, expect, it } from "vitest";
import type { StrategicGoalReadModel } from "@/features/strategy";
import type { StrategicDashboardSummary } from "./strategy-summary";
import { buildStrategicBoardReportFromSummary } from "./strategic-board-adapter";

describe("strategic board adapter", () => {
  it("adapts the shared calculation summary without recalculating progress", () => {
    const report = buildStrategicBoardReportFromSummary({
      summary: summaryFixture(),
      goals: [goalFixture()],
    });

    expect(report.organizationGoalCompletion.countLabel).toBe(
      "1 of 1 goals completed",
    );
    const kpi = report.priorities[0]?.goals[0]?.kpis[0];
    expect(kpi).toMatchObject({
      name: "Visitor upgrades",
      result: { value: 6, displayValue: "6 upgrades" },
      fullPlanProgress: {
        actualProgressPercentage: 120,
        displayProgressPercentage: 100,
        targetDisplayText: "Complete five upgrades by 2029.",
      },
    });
  });

  it("preserves unresolved questions and missing targets as reportable gaps", () => {
    const summary = summaryFixture();
    const goal = goalFixture();
    summary.goals[0]!.kpis[0]!.configurationStatus = "needs_target";
    summary.goals[0]!.kpis[0]!.fullPlanTarget = null;
    summary.goals[0]!.kpis[0]!.fullPlanTargetDescription = null;
    goal.members[0]!.configuration!.configuration_status = "needs_target";
    goal.members[0]!.configuration!.unresolved_question = "Finalize the target.";

    const report = buildStrategicBoardReportFromSummary({ summary, goals: [goal] });
    const kpi = report.priorities[0]?.goals[0]?.kpis[0];
    expect(kpi?.configurationStatus).toBe("needs_target");
    expect(kpi?.unresolvedReasons).toContain("Finalize the target.");
    expect(kpi?.fullPlanProgress?.targetDisplayText).toBe("Target not finalized");
  });

  it("exports annual completion and year-to-date pacing as separate facts", () => {
    const summary = summaryFixture();
    const kpiSummary = summary.goals[0]!.kpis[0]!;
    kpiSummary.annualTarget = 12;
    kpiSummary.annualTargetDescription = "Deliver twelve upgrades in 2026.";
    kpiSummary.annualPacingTarget = 6;
    kpiSummary.annualPacing = {
      ...kpiSummary.annualPacing,
      state: "ok",
      status: "complete",
      currentValue: 6,
      targetValue: 6,
      actualProgressPercentage: 100,
      displayProgressPercentage: 100,
      isComplete: true,
    };
    kpiSummary.annualProgress = {
      ...kpiSummary.fullPlanProgress,
      status: "in_progress",
      targetValue: 12,
      actualProgressPercentage: 50,
      displayProgressPercentage: 50,
      isComplete: false,
      isExceeded: false,
    };

    const report = buildStrategicBoardReportFromSummary({
      summary,
      goals: [goalFixture()],
    });

    expect(report.priorities[0]?.goals[0]?.kpis[0]?.annualProgress).toMatchObject({
      targetValue: 12,
      actualProgressPercentage: 50,
      pacingTarget: 6,
      pacingStatus: "on_track",
    });
  });

  it("carries first-class distribution calculations into detail and export models", () => {
    const summary = summaryFixture();
    const goal = goalFixture();
    const kpiSummary = summary.goals[0]!.kpis[0]!;
    kpiSummary.measurementType = "distribution";
    kpiSummary.currentValue = null;
    kpiSummary.currentCalculation = {
      state: "ok",
      measurementType: "distribution",
      value: null,
      normalizedPercentage: null,
      numerator: null,
      denominator: 10,
      respondentCount: 10,
      precision: 1,
      issues: [],
      distribution: {
        respondentTotal: 10,
        categoryTotal: 10,
        unallocatedCount: 0,
        allowNonExclusive: false,
        derivedNonWhitePercentage: 40,
        categories: [
          { id: "1", label: "White", count: 6, percentage: 60, derivedGroup: "white" },
          { id: "2", label: "People of color", count: 4, percentage: 40, derivedGroup: "non_white" },
        ],
      },
    };
    goal.members[0]!.configuration!.measurement_type = "distribution";

    const report = buildStrategicBoardReportFromSummary({ summary, goals: [goal] });
    const kpi = report.priorities[0]?.goals[0]?.kpis[0];

    expect(kpi?.result).toMatchObject({ state: "ok", respondentCount: 10 });
    expect(kpi?.demographics).toMatchObject({
      respondentTotal: 10,
      mutuallyExclusive: true,
      derivedNonWhitePercentage: 40,
    });
    expect(kpi?.demographics?.bands).toEqual([
      expect.objectContaining({ label: "White", percentage: 60, derivedGroup: "white" }),
      expect.objectContaining({ label: "People of color", percentage: 40, derivedGroup: "non_white" }),
    ]);
  });
});

function summaryFixture(): StrategicDashboardSummary {
  const progress = {
    state: "ok" as const,
    status: "exceeded" as const,
    currentValue: 6,
    targetValue: 5,
    baselineValue: null,
    actualProgressPercentage: 120,
    displayProgressPercentage: 100,
    isComplete: true,
    isExceeded: true,
    issues: [],
  };
  return {
    selectedYear: 2026,
    organization: {
      completedGoalsCount: 1,
      totalEligibleGoalsCount: 1,
      completionPercentage: 100,
      excludedGoalsCount: 0,
      excludedGoalReasons: [],
    },
    priorities: [{
      priorityId: "1",
      priorityName: "Visitor Experience",
      completedGoalsCount: 1,
      totalEligibleGoalsCount: 1,
      completionPercentage: 100,
      excludedGoalsCount: 0,
      excludedGoalReasons: [],
    }],
    goals: [{
      goalId: "10",
      goalName: "Improve amenities",
      priorityId: "1",
      prioritySlug: "visitor-experience",
      priorityName: "Visitor Experience",
      configurationStatus: "active",
      result: {
        goalId: "10",
        rule: "all_required_kpis",
        state: "ok",
        eligible: true,
        complete: true,
        completionPercentage: 100,
        completedKpisCount: 1,
        totalEligibleKpisCount: 1,
        excludedKpisCount: 0,
        excludedKpis: [],
        exclusionReasons: [],
        issues: [],
      },
      kpis: [{
        kpiId: 20,
        kpiSlug: "visitor-upgrades",
        kpiName: "Visitor upgrades",
        measurementType: "cumulative",
        configurationStatus: "active",
        boardLevelStatus: "exceeded",
        currentValue: 6,
        currentCalculation: null,
        annualActual: 6,
        cumulativeActual: 6,
        annualTarget: null,
        annualTargetDescription: null,
        annualPacingTarget: null,
        annualPacing: {
          ...progress,
          state: "missing",
          status: "target_not_finalized",
          targetValue: null,
          actualProgressPercentage: null,
          displayProgressPercentage: null,
          isComplete: false,
          isExceeded: false,
        },
        annualProgress: {
          ...progress,
          state: "missing",
          status: "target_not_finalized",
          targetValue: null,
          actualProgressPercentage: null,
          displayProgressPercentage: null,
          isComplete: false,
          isExceeded: false,
        },
        fullPlanTarget: 5,
        fullPlanTargetYear: 2029,
        fullPlanTargetDescription: "Complete five upgrades by 2029.",
        fullPlanProgress: progress,
        completionProgress: progress,
      }],
    }],
  };
}

function goalFixture(): StrategicGoalReadModel {
  return {
    id: 10,
    priority_id: 1,
    priority_slug: "visitor-experience",
    priority_name: "Visitor Experience",
    slug: "improve-amenities",
    name: "Improve amenities",
    description: null,
    plan_start_year: 2025,
    plan_end_year: 2029,
    completion_rule: "all_required_kpis",
    threshold_count: null,
    threshold_percentage: null,
    manual_status: null,
    board_level_status: "complete",
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
    members: [{
      id: 1,
      goal_id: 10,
      kpi_id: 20,
      role: "required",
      weight: 1,
      display_order: 1,
      effective_from_year: 2025,
      effective_to_year: null,
      archived_at: null,
      created_by: null,
      created_at: "2026-01-01",
      updated_by: null,
      updated_at: "2026-01-01",
      kpi: {
        id: 20,
        slug: "visitor-upgrades",
        name: "Visitor upgrades",
        unit: "upgrades",
        category_id: 1,
        category_slug: "visitor-experience",
        category_name: "Visitor Experience",
      },
      configuration: {
        id: 30,
        kpi_id: 20,
        effective_from_year: 2025,
        effective_to_year: null,
        measurement_type: "cumulative",
        unit: "upgrades",
        numerator_label: null,
        denominator_label: null,
        fixed_denominator: null,
        baseline_value: null,
        reporting_frequency: "cumulative",
        aggregation_method: "none",
        board_level_status: "exceeded",
        calculation_precision: 1,
        configuration_status: "active",
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
      targets: [],
      components: [],
    }],
  };
}
