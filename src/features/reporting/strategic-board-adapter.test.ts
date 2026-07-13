import { describe, expect, it } from "vitest";
import type { StrategicGoalReadModel } from "@/features/strategy";
import type {
  StrategyComponentEntryRecord,
  StrategyObservationRecord,
} from "@/features/strategy/server";
import type { StrategicDashboardSummary } from "./strategy-summary";
import {
  calculateStrategyMultiComponent,
  calculateStrategyObservation,
} from "./strategy-actuals";
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

  it("preserves a genuinely missing actual as not reported", () => {
    const summary = summaryFixture();
    const kpiSummary = summary.goals[0]!.kpis[0]!;
    kpiSummary.currentValue = null;
    kpiSummary.currentCalculation = null;

    const report = buildStrategicBoardReportFromSummary({
      summary,
      goals: [goalFixture()],
    });

    expect(report.priorities[0]?.goals[0]?.kpis[0]?.result).toMatchObject({
      state: "missing",
      value: null,
      displayValue: "Not reported",
    });
  });

  it("renders a direct ratio with a percent configuration as a percent result", () => {
    const summary = summaryFixture();
    const goal = goalFixture();
    const kpiSummary = summary.goals[0]!.kpis[0]!;
    const {
      component_id: _componentId,
      component_label: _componentLabel,
      ...baseObservation
    } = componentEntry();
    void _componentId;
    void _componentLabel;
    kpiSummary.measurementType = "ratio";
    kpiSummary.currentValue = 60;
    kpiSummary.currentCalculation = calculateStrategyObservation(
      {
        ...baseObservation,
        measurement_type: "ratio",
        scalar_value: null,
        numerator: 30,
        denominator: 50,
      },
      { measurementType: "ratio", precision: 1, unit: "%" },
    );
    goal.members[0]!.configuration!.measurement_type = "ratio";
    goal.members[0]!.configuration!.unit = "%";
    goal.members[0]!.configuration!.fixed_denominator = 50;

    const report = buildStrategicBoardReportFromSummary({ summary, goals: [goal] });

    expect(report.priorities[0]?.goals[0]?.kpis[0]).toMatchObject({
      measurementType: "ratio",
      unit: "%",
      result: {
        value: 60,
        displayValue: "60%",
        numerator: 30,
        denominator: 50,
      },
    });
  });

  it("describes all three persisted average formulas truthfully", () => {
    const {
      component_id: _componentId,
      component_label: _componentLabel,
      ...baseObservation
    } = componentEntry();
    void _componentId;
    void _componentLabel;
    const cases: Array<{
      raw: Partial<StrategyObservationRecord>;
      expectedFormula: string;
    }> = [
      {
        raw: {
          average_method: "total_score",
          respondent_count: 10,
          total_score: 40,
          total_possible_score: 50,
        },
        expectedFormula:
          "Total score divided by total possible score, multiplied by 100.",
      },
      {
        raw: {
          average_method: "average_score",
          average_score: 4.2,
          max_score_per_respondent: 5,
        },
        expectedFormula:
          "Average score divided by the configured maximum score, multiplied by 100.",
      },
      {
        raw: {
          average_method: "percent_positive",
          positive_response_count: 34,
          total_response_count: 40,
        },
        expectedFormula:
          "Positive responses divided by total responses, multiplied by 100.",
      },
    ];

    for (const { raw, expectedFormula } of cases) {
      const summary = summaryFixture();
      const goal = goalFixture();
      const calculation = calculateStrategyObservation(
        {
          ...baseObservation,
          measurement_type: "average",
          ...raw,
        },
        { measurementType: "average", precision: 1 },
      );
      const kpiSummary = summary.goals[0]!.kpis[0]!;
      kpiSummary.measurementType = "average";
      kpiSummary.currentValue = calculation.value;
      kpiSummary.currentCalculation = calculation;
      goal.members[0]!.configuration!.measurement_type = "average";
      goal.members[0]!.configuration!.unit = "% normalized";

      const report = buildStrategicBoardReportFromSummary({
        summary,
        goals: [goal],
      });

      expect(
        report.priorities[0]?.goals[0]?.kpis[0]?.result.formulaExplanation,
      ).toBe(expectedFormula);
    }
  });

  it.each([
    [false, 0, "Not complete"],
    [true, 1, "Complete"],
  ] as const)(
    "renders a %s binary observation as semantic display text",
    (completed, value, displayValue) => {
      const summary = summaryFixture();
      const goal = goalFixture();
      const kpiSummary = summary.goals[0]!.kpis[0]!;
      const {
        component_id: _componentId,
        component_label: _componentLabel,
        ...baseObservation
      } = componentEntry();
      void _componentId;
      void _componentLabel;
      const calculation = calculateStrategyObservation(
        {
          ...baseObservation,
          measurement_type: "binary",
          scalar_value: null,
          boolean_value: completed,
        },
        { measurementType: "binary", precision: 0 },
      );
      kpiSummary.measurementType = "binary";
      kpiSummary.currentCalculation = calculation;
      kpiSummary.currentValue = value;
      goal.members[0]!.configuration!.measurement_type = "binary";
      goal.members[0]!.configuration!.unit = "Yes/No";

      const report = buildStrategicBoardReportFromSummary({
        summary,
        goals: [goal],
      });

      expect(
        report.priorities[0]?.goals[0]?.kpis[0]?.result.displayValue,
      ).toBe(displayValue);
    },
  );

  it("renders a positive year-over-year result as a signed percentage", () => {
    const summary = summaryFixture();
    const goal = goalFixture();
    const kpiSummary = summary.goals[0]!.kpis[0]!;
    const {
      component_id: _componentId,
      component_label: _componentLabel,
      ...baseObservation
    } = componentEntry();
    void _componentId;
    void _componentLabel;
    const calculation = calculateStrategyObservation(
      {
        ...baseObservation,
        measurement_type: "year_over_year",
        scalar_value: 60,
      },
      { measurementType: "year_over_year", precision: 1 },
      50,
    );
    kpiSummary.measurementType = "year_over_year";
    kpiSummary.currentCalculation = calculation;
    kpiSummary.currentValue = calculation.value;
    goal.members[0]!.configuration!.measurement_type = "year_over_year";
    // This canonical KPI inherits a legacy count unit. The configured
    // measurement contract still reports percentage change.
    goal.members[0]!.configuration!.unit = "partnerships";

    const report = buildStrategicBoardReportFromSummary({
      summary,
      goals: [goal],
    });

    expect(report.priorities[0]?.goals[0]?.kpis[0]).toMatchObject({
      measurementType: "year_over_year",
      unit: "%",
      result: {
        value: 20,
        displayValue: "+20%",
        formulaExplanation:
          "Current value minus previous value, divided by the absolute previous value.",
      },
    });
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

    expect(kpi?.result).toMatchObject({
      state: "ok",
      displayValue: "10 respondents",
      respondentCount: 10,
    });
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

  it("describes the same past Full-Plan Target used by a KPI Component calculation", () => {
    const summary = summaryFixture();
    const goal = goalFixture();
    const kpiSummary = summary.goals[0]!.kpis[0]!;
    kpiSummary.measurementType = "multi_component";
    goal.members[0]!.configuration!.measurement_type = "multi_component";
    goal.members[0]!.configuration!.aggregation_method = "sum";
    goal.members[0]!.components = [{
      id: 41,
      kpi_id: 20,
      configuration_id: 30,
      slug: "completed-upgrades",
      label: "Completed upgrades",
      measurement_type: "count",
      unit: "upgrades",
      numerator_label: null,
      denominator_label: null,
      fixed_denominator: null,
      baseline_value: null,
      previous_period_value: null,
      aggregation_role: "value",
      weight: 1,
      display_order: 1,
      configuration_status: "active",
      unresolved_question: null,
      archived_at: null,
      created_by: null,
      created_at: "2026-01-01",
      updated_by: null,
      updated_at: "2026-01-01",
      targets: [{
        id: 51,
        kpi_id: null,
        component_id: 41,
        target_scope: "full_plan",
        reporting_year: null,
        target_year: 2025,
        external_target_year: false,
        target_value: 5,
        structured_target: null,
        target_description: "Complete five upgrades by 2025.",
        baseline_year: null,
        baseline_value: null,
        configuration_status: "active",
        source_reference: null,
        last_reviewed_date: null,
        archived_at: null,
        created_by: null,
        created_at: "2025-01-01",
        updated_by: null,
        updated_at: "2025-01-01",
      }],
    }];
    kpiSummary.currentCalculation = calculateStrategyMultiComponent({
      configuration: goal.members[0]!.configuration!,
      components: [{
        definition: goal.members[0]!.components[0]!,
        record: componentEntry(),
      }],
    });

    const report = buildStrategicBoardReportFromSummary({ summary, goals: [goal] });

    expect(kpiSummary.currentCalculation.components?.[0]?.progress).toMatchObject({
      targetValue: 5,
      actualProgressPercentage: 100,
    });
    expect(report.priorities[0]?.goals[0]?.kpis[0]?.components[0]?.progress).toMatchObject({
      targetValue: 5,
      targetYear: 2025,
      targetDescription: "Complete five upgrades by 2025.",
    });
  });

  it("presents a component-only KPI and each component from calculated semantics", () => {
    const summary = summaryFixture();
    const goal = goalFixture();
    const kpiSummary = summary.goals[0]!.kpis[0]!;
    const binaryComponent = componentDefinition({
      id: 41,
      slug: "plan-adopted",
      label: "Plan adopted",
      measurement_type: "binary",
      unit: "Yes/No",
    });
    const yearOverYearComponent = componentDefinition({
      id: 42,
      slug: "partnership-growth",
      label: "Partnership growth",
      measurement_type: "year_over_year",
      unit: "partnerships",
      display_order: 2,
    });
    kpiSummary.measurementType = "multi_component";
    kpiSummary.currentValue = null;
    goal.members[0]!.configuration!.measurement_type = "multi_component";
    goal.members[0]!.configuration!.aggregation_method = "none";
    goal.members[0]!.configuration!.unit = "combined result";
    goal.members[0]!.components = [binaryComponent, yearOverYearComponent];
    kpiSummary.currentCalculation = calculateStrategyMultiComponent({
      configuration: goal.members[0]!.configuration!,
      components: [
        {
          definition: binaryComponent,
          record: componentEntry({
            id: 61,
            component_id: binaryComponent.id,
            component_label: binaryComponent.label,
            measurement_type: "binary",
            scalar_value: null,
            boolean_value: true,
          }),
        },
        {
          definition: yearOverYearComponent,
          record: componentEntry({
            id: 62,
            component_id: yearOverYearComponent.id,
            component_label: yearOverYearComponent.label,
            measurement_type: "year_over_year",
            scalar_value: 60,
          }),
          previousPeriodValue: 50,
        },
      ],
    });

    const report = buildStrategicBoardReportFromSummary({
      summary,
      goals: [goal],
    });
    const kpi = report.priorities[0]?.goals[0]?.kpis[0];

    expect(kpi?.result).toMatchObject({
      state: "ok",
      value: null,
      displayValue: "2 components",
    });
    expect(kpi?.components.map((component) => component.result.displayValue))
      .toEqual(["Complete", "+20%"]);
    expect(kpi?.components.map((component) => component.unit))
      .toEqual(["Yes/No", "%"]);
  });

  it("derives revenue composition from first-class currency configuration, not a canonical slug", () => {
    const summary = summaryFixture();
    const goal = goalFixture();
    const kpiSummary = summary.goals[0]!.kpis[0]!;
    const admissions = componentDefinition({
      id: 41,
      slug: "admissions-income",
      label: "Admissions income",
      measurement_type: "currency",
      unit: "USD",
    });
    const memberships = componentDefinition({
      id: 42,
      slug: "membership-income",
      label: "Membership income",
      measurement_type: "currency",
      unit: "USD",
      display_order: 2,
    });
    kpiSummary.kpiSlug = "community-income-composition";
    kpiSummary.kpiName = "Community income composition";
    kpiSummary.measurementType = "multi_component";
    goal.members[0]!.kpi.slug = "community-income-composition";
    goal.members[0]!.kpi.name = "Community income composition";
    goal.members[0]!.configuration!.measurement_type = "multi_component";
    goal.members[0]!.configuration!.aggregation_method = "sum";
    goal.members[0]!.configuration!.unit = "USD";
    goal.members[0]!.configuration!.calculation_precision = 2;
    goal.members[0]!.components = [admissions, memberships];
    kpiSummary.currentCalculation = calculateStrategyMultiComponent({
      configuration: goal.members[0]!.configuration!,
      components: [
        {
          definition: admissions,
          record: componentEntry({
            id: 61,
            component_id: admissions.id,
            component_label: admissions.label,
            measurement_type: "currency",
            scalar_value: 600,
          }),
        },
        {
          definition: memberships,
          record: componentEntry({
            id: 62,
            component_id: memberships.id,
            component_label: memberships.label,
            measurement_type: "currency",
            scalar_value: 400,
          }),
        },
      ],
    });
    kpiSummary.currentValue = kpiSummary.currentCalculation.value;

    const report = buildStrategicBoardReportFromSummary({
      summary,
      goals: [goal],
    });

    expect(report.priorities[0]?.goals[0]?.kpis[0]?.revenueBreakdown).toEqual({
      totalRevenue: 1_000,
      streams: [
        {
          id: "41",
          label: "Admissions income",
          value: 600,
          sharePercentage: 60,
        },
        {
          id: "42",
          label: "Membership income",
          value: 400,
          sharePercentage: 40,
        },
      ],
    });
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

function componentEntry(
  overrides: Partial<StrategyComponentEntryRecord> = {},
): StrategyComponentEntryRecord {
  return {
    id: 61,
    kpi_id: 20,
    component_id: 41,
    component_label: "Participants graduating",
    configuration_id: 30,
    measurement_type: "count",
    reporting_frequency: "cumulative",
    year: 2026,
    period_type: "cumulative",
    period_index: 0,
    scalar_value: 5,
    numerator: null,
    denominator: null,
    respondent_count: null,
    average_method: null,
    total_score: null,
    average_score: null,
    max_score_per_respondent: null,
    total_possible_score: null,
    positive_response_count: null,
    total_response_count: null,
    boolean_value: null,
    milestone_value: null,
    notes: null,
    source_reference: null,
    updated_by: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

function componentDefinition(
  overrides: Partial<
    StrategicGoalReadModel["members"][number]["components"][number]
  > = {},
): StrategicGoalReadModel["members"][number]["components"][number] {
  return {
    id: 41,
    kpi_id: 20,
    configuration_id: 30,
    slug: "completed-upgrades",
    label: "Completed upgrades",
    measurement_type: "count",
    unit: "upgrades",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    baseline_value: null,
    previous_period_value: null,
    aggregation_role: "value",
    weight: 1,
    display_order: 1,
    configuration_status: "active",
    unresolved_question: null,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01",
    updated_by: null,
    updated_at: "2026-01-01",
    targets: [],
    ...overrides,
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
