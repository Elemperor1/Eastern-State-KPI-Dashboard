import { describe, expect, it } from "vitest";
import {
  calculateAnnualAndPlanProgress,
  calculateGoalCompletion,
  calculateMeasurement,
  calculateProgress,
  calculateStrategyRollups,
  isMeasurementType,
  resolveConfiguredTargetValue,
  rollupGoalCompletions,
  roundFinite,
  type GoalCompletionResult,
  type ProgressResult,
} from "./calculations";

function progress(currentValue: number, targetValue = 100): ProgressResult {
  return calculateProgress({ currentValue, targetValue, precision: 1 });
}

describe("strategy calculation kernel", () => {
  describe("measurement type validation and finite rounding", () => {
    it("recognizes every supported measurement type and rejects unknown runtime input", () => {
      for (const type of [
        "binary",
        "milestone",
        "count",
        "percentage",
        "average",
        "cumulative",
        "year_over_year",
        "distribution",
        "currency",
        "ratio",
        "multi_component",
      ]) {
        expect(isMeasurementType(type)).toBe(true);
      }
      expect(isMeasurementType("manual_percentage")).toBe(false);
      expect(
        calculateMeasurement({ measurementType: "manual_percentage" }),
      ).toMatchObject({
        state: "invalid",
        measurementType: null,
        issues: [{ code: "UNSUPPORTED_MEASUREMENT_TYPE" }],
      });
    });

    it("resolves only active numeric or documented structured targets", () => {
      expect(
        resolveConfiguredTargetValue({
          measurementType: "count",
          targetValue: 0,
          configurationStatus: "active",
        }),
      ).toBe(0);
      expect(
        resolveConfiguredTargetValue({
          measurementType: "count",
          targetValue: 5,
          configurationStatus: "draft",
        }),
      ).toBeNull();
      expect(
        resolveConfiguredTargetValue({
          measurementType: "count",
          structuredTarget: { value: 5 },
          configurationStatus: "ready",
        }),
      ).toBe(5);
      expect(
        resolveConfiguredTargetValue({
          measurementType: "binary",
          targetDescription: "Adopt the plan",
          configurationStatus: "active",
        }),
      ).toBe(1);
      expect(
        resolveConfiguredTargetValue({
          measurementType: "count",
          structuredTarget: { unsupported: true },
          configurationStatus: "active",
        }),
      ).toBeNull();
    });

    it("rounds in one finite-safe helper without leaking NaN or Infinity", () => {
      expect(roundFinite(1.005, 2)).toBe(1.01);
      expect(roundFinite(-0.0001, 2)).toBe(0);
      expect(roundFinite(Number.NaN, 2)).toBeNull();
      expect(roundFinite(Number.POSITIVE_INFINITY, 2)).toBeNull();
      expect(roundFinite(10, 11)).toBeNull();
    });
  });

  describe("atomic measurements", () => {
    it("calculates binary completion and preserves false as a real zero", () => {
      expect(calculateMeasurement({ measurementType: "binary", completed: true })).toMatchObject({
        state: "ok",
        value: 1,
        normalizedPercentage: 100,
      });
      expect(calculateMeasurement({ measurementType: "binary", completed: false })).toMatchObject({
        state: "ok",
        value: 0,
        normalizedPercentage: 0,
      });
      expect(calculateMeasurement({ measurementType: "binary" })).toMatchObject({
        state: "missing",
        issues: [{ code: "MISSING_BOOLEAN" }],
      });
    });

    it("supports milestone booleans and completed/total counts", () => {
      expect(calculateMeasurement({ measurementType: "milestone", completed: true })).toMatchObject({
        state: "ok",
        value: 1,
        normalizedPercentage: 100,
      });
      expect(calculateMeasurement({
        measurementType: "milestone",
        completedMilestones: 2,
        totalMilestones: 5,
      })).toMatchObject({
        state: "ok",
        value: 2,
        numerator: 2,
        denominator: 5,
        normalizedPercentage: 40,
      });
      expect(calculateMeasurement({
        measurementType: "milestone",
        completedMilestones: 6,
        totalMilestones: 5,
      })).toMatchObject({
        state: "invalid",
        issues: [{ code: "COMPLETED_EXCEEDS_TOTAL" }],
      });
    });

    it("preserves count, cumulative, and currency values including zero and cents", () => {
      expect(calculateMeasurement({ measurementType: "count", value: 0 })).toMatchObject({
        state: "ok",
        value: 0,
      });
      expect(calculateMeasurement({ measurementType: "cumulative", value: 17 })).toMatchObject({
        state: "ok",
        value: 17,
      });
      expect(calculateMeasurement({
        measurementType: "currency",
        value: 1234.567,
        precision: 2,
      })).toMatchObject({ state: "ok", value: 1234.57 });
      expect(calculateMeasurement({ measurementType: "count", value: Number.NaN })).toMatchObject({
        state: "invalid",
        issues: [{ code: "NON_FINITE_VALUE" }],
      });
    });

    it("derives percentage and fixed-denominator results from raw inputs", () => {
      expect(calculateMeasurement({
        measurementType: "percentage",
        numerator: 1,
        denominator: 3,
        precision: 1,
      })).toMatchObject({
        state: "ok",
        value: 33.3,
        normalizedPercentage: 33.3,
      });
      expect(calculateMeasurement({
        measurementType: "percentage",
        numerator: 27,
        fixedDenominator: 50,
      })).toMatchObject({ state: "ok", value: 54, denominator: 50 });
      expect(calculateMeasurement({
        measurementType: "percentage",
        numerator: 2,
        denominator: 0,
      })).toMatchObject({ state: "invalid", issues: [{ code: "ZERO_DENOMINATOR" }] });
      expect(calculateMeasurement({
        measurementType: "percentage",
        numerator: 2,
        denominator: 4,
        fixedDenominator: 5,
      })).toMatchObject({ state: "invalid", issues: [{ code: "DENOMINATOR_CONFLICT" }] });
    });

    it("calculates ratios with an explicit scale", () => {
      expect(calculateMeasurement({
        measurementType: "ratio",
        numerator: 2,
        denominator: 5,
      })).toMatchObject({ state: "ok", value: 0.4, normalizedPercentage: null });
      expect(calculateMeasurement({
        measurementType: "ratio",
        numerator: 2,
        fixedDenominator: 5,
        scale: 100,
      })).toMatchObject({ state: "ok", value: 40, normalizedPercentage: 40 });
    });

    it("normalizes total-score averages using raw respondent inputs", () => {
      expect(calculateMeasurement({
        measurementType: "average",
        method: "total_score",
        respondentCount: 10,
        totalScore: 40,
        maxScorePerRespondent: 5,
      })).toMatchObject({
        state: "ok",
        averageMethod: "total_score",
        value: 80,
        respondentCount: 10,
        numerator: 40,
        denominator: 50,
      });
    });

    it("distinguishes normalized average scores from percent-positive responses", () => {
      expect(calculateMeasurement({
        measurementType: "average",
        method: "average_score",
        averageScore: 4.2,
        maxScaleValue: 5,
      })).toMatchObject({
        state: "ok",
        averageMethod: "average_score",
        value: 84,
      });
      expect(calculateMeasurement({
        measurementType: "average",
        method: "percent_positive",
        positiveResponseCount: 34,
        totalResponseCount: 40,
      })).toMatchObject({
        state: "ok",
        averageMethod: "percent_positive",
        value: 85,
        respondentCount: 40,
      });
      expect(calculateMeasurement({
        measurementType: "average",
        method: "total_score",
        totalScore: 51,
        totalPossibleScore: 50,
      })).toMatchObject({ state: "invalid", issues: [{ code: "SCORE_EXCEEDS_MAXIMUM" }] });
    });

    it("calculates year-over-year change and rejects a zero prior denominator", () => {
      expect(calculateMeasurement({
        measurementType: "year_over_year",
        currentValue: 120,
        previousPeriodValue: 100,
      })).toMatchObject({ state: "ok", value: 20, numerator: 20, denominator: 100 });
      expect(calculateMeasurement({
        measurementType: "year_over_year",
        currentValue: 80,
        previousPeriodValue: 100,
      })).toMatchObject({ state: "ok", value: -20 });
      expect(calculateMeasurement({
        measurementType: "year_over_year",
        currentValue: 1,
        previousPeriodValue: 0,
      })).toMatchObject({ state: "invalid", issues: [{ code: "ZERO_PREVIOUS_PERIOD" }] });
    });
  });

  describe("distribution measurements", () => {
    it("returns ordered labels, counts, percentages, and respondent denominator", () => {
      const result = calculateMeasurement({
        measurementType: "distribution",
        respondentTotal: 10,
        categories: [
          { id: "a", label: "Group A", count: 4 },
          { id: "b", label: "Unknown / declined", count: 6 },
        ],
      });
      expect(result).toMatchObject({
        state: "ok",
        respondentCount: 10,
        denominator: 10,
        distribution: {
          categoryTotal: 10,
          unallocatedCount: 0,
          categories: [
            { id: "a", label: "Group A", count: 4, percentage: 40 },
            { id: "b", label: "Unknown / declined", count: 6, percentage: 60 },
          ],
        },
      });
    });

    it("validates exclusive totals while allowing explicitly non-exclusive categories", () => {
      expect(calculateMeasurement({
        measurementType: "distribution",
        respondentTotal: 10,
        categories: [{ id: "a", label: "A", count: 8 }],
      })).toMatchObject({ state: "invalid", issues: [{ code: "CATEGORY_TOTAL_MISMATCH" }] });

      expect(calculateMeasurement({
        measurementType: "distribution",
        respondentTotal: 10,
        allowNonExclusive: true,
        categories: [
          { id: "a", label: "A", count: 8 },
          { id: "b", label: "B", count: 7 },
        ],
      })).toMatchObject({
        state: "ok",
        distribution: { categoryTotal: 15, allowNonExclusive: true },
      });
    });

    it("derives a non-white respondent percentage only from explicit exclusive band markers", () => {
      const result = calculateMeasurement({
        measurementType: "distribution",
        respondentTotal: 20,
        categories: [
          { id: "white", label: "White", count: 12, derivedGroup: "white" },
          { id: "black", label: "Black", count: 5, derivedGroup: "non_white" },
          { id: "asian", label: "Asian", count: 3, derivedGroup: "non_white" },
        ],
      });
      expect(result.distribution).toMatchObject({
        derivedNonWhitePercentage: 40,
        categories: [
          { id: "white", derivedGroup: "white" },
          { id: "black", derivedGroup: "non_white" },
          { id: "asian", derivedGroup: "non_white" },
        ],
      });

      const overlapping = calculateMeasurement({
        measurementType: "distribution",
        respondentTotal: 20,
        allowNonExclusive: true,
        categories: [
          { id: "a", label: "A", count: 12, derivedGroup: "non_white" },
          { id: "b", label: "B", count: 10, derivedGroup: "non_white" },
        ],
      });
      expect(overlapping.distribution?.derivedNonWhitePercentage).toBeNull();
    });
  });

  describe("target progress", () => {
    it("distinguishes a missing target from a valid zero target", () => {
      expect(calculateProgress({ currentValue: 0 })).toMatchObject({
        state: "missing",
        status: "target_not_finalized",
      });
      expect(calculateProgress({ currentValue: 0, targetValue: 0 })).toMatchObject({
        state: "ok",
        status: "complete",
        actualProgressPercentage: 100,
      });
      expect(calculateProgress({ currentValue: 1, targetValue: 0 })).toMatchObject({
        state: "ok",
        status: "exceeded",
        actualProgressPercentage: 100,
        displayProgressPercentage: 100,
      });
    });

    it("preserves uncapped over-performance while capping display fill", () => {
      expect(calculateProgress({ currentValue: 6, targetValue: 5, precision: 1 })).toMatchObject({
        state: "ok",
        status: "exceeded",
        actualProgressPercentage: 120,
        displayProgressPercentage: 100,
        isComplete: true,
        isExceeded: true,
      });
    });

    it("returns intentional not-started, in-progress, complete, and configuration states", () => {
      expect(progress(0)).toMatchObject({ status: "not_started", displayProgressPercentage: 0 });
      expect(progress(25)).toMatchObject({ status: "in_progress", displayProgressPercentage: 25 });
      expect(progress(100)).toMatchObject({ status: "complete", displayProgressPercentage: 100 });
      expect(calculateProgress({
        currentValue: 25,
        targetValue: 100,
        configurationStatus: "needs_definition",
      })).toMatchObject({ state: "missing", status: "needs_definition" });
      expect(calculateProgress({
        currentValue: 25,
        targetValue: 100,
        configurationStatus: "needs_target",
      })).toMatchObject({ state: "missing", status: "target_not_finalized" });
    });

    it("supports baseline-aware lower-is-better progress", () => {
      expect(calculateProgress({
        currentValue: 15,
        targetValue: 10,
        baselineValue: 20,
        direction: "lower",
      })).toMatchObject({
        state: "ok",
        status: "in_progress",
        actualProgressPercentage: 50,
      });
      expect(calculateProgress({
        currentValue: 9,
        targetValue: 10,
        baselineValue: 20,
        direction: "lower",
      })).toMatchObject({ status: "exceeded", actualProgressPercentage: 110 });
    });
  });

  describe("annual pacing and full-plan progress", () => {
    it("separates annual pacing, annual completion, and full-plan completion", () => {
      const result = calculateAnnualAndPlanProgress({
        annualActual: 1,
        annualTarget: 1,
        elapsedFraction: 1,
        cumulativeActual: 1,
        fullPlanTarget: 3,
        precision: 1,
      });
      expect(result.state).toBe("ok");
      expect(result.annualPacing).toMatchObject({ status: "complete", actualProgressPercentage: 100 });
      expect(result.annualCompletion).toMatchObject({ status: "complete", actualProgressPercentage: 100 });
      expect(result.fullPlanProgress).toMatchObject({ status: "in_progress", actualProgressPercentage: 33.3 });
    });

    it("prorates the annual pacing target without changing the full-year target", () => {
      const result = calculateAnnualAndPlanProgress({
        annualActual: 30,
        annualTarget: 120,
        elapsedFraction: 0.25,
        cumulativeActual: 30,
        fullPlanTarget: 300,
      });
      expect(result.pacingTarget).toBe(30);
      expect(result.annualPacing.status).toBe("complete");
      expect(result.annualCompletion.actualProgressPercentage).toBe(25);
      expect(result.fullPlanProgress.actualProgressPercentage).toBe(10);
    });
  });

  describe("multi-component aggregation", () => {
    const countComponent = (id: string, value: number, weight?: number) => ({
      id,
      label: id,
      unit: "people",
      weight,
      input: { measurementType: "count" as const, value },
    });

    it("supports an intentionally absent parent aggregate", () => {
      expect(calculateMeasurement({
        measurementType: "multi_component",
        aggregationMethod: "none",
        components: [countComponent("enrolled", 20), countComponent("graduated", 10)],
      })).toMatchObject({
        state: "ok",
        value: null,
        aggregationMethod: "none",
        components: [{ result: { value: 20 } }, { result: { value: 10 } }],
      });
    });

    it("calculates average, weighted-average, and sum for compatible units", () => {
      expect(calculateMeasurement({
        measurementType: "multi_component",
        aggregationMethod: "average",
        components: [countComponent("a", 10), countComponent("b", 20)],
      })).toMatchObject({ state: "ok", value: 15 });
      expect(calculateMeasurement({
        measurementType: "multi_component",
        aggregationMethod: "weighted_average",
        components: [countComponent("a", 10, 1), countComponent("b", 20, 3)],
      })).toMatchObject({ state: "ok", value: 17.5 });
      expect(calculateMeasurement({
        measurementType: "multi_component",
        aggregationMethod: "sum",
        components: [countComponent("a", 10), countComponent("b", 20)],
      })).toMatchObject({ state: "ok", value: 30 });
    });

    it("calculates a shared-denominator ratio from explicit numerator and denominator components", () => {
      expect(calculateMeasurement({
        measurementType: "multi_component",
        aggregationMethod: "ratio",
        precision: 1,
        components: [
          {
            id: "city-support",
            label: "City government support",
            unit: "USD",
            aggregationRole: "numerator",
            input: { measurementType: "currency", value: 200 },
          },
          {
            id: "state-support",
            label: "State government support",
            unit: "USD",
            aggregationRole: "numerator",
            input: { measurementType: "currency", value: 100 },
          },
          {
            id: "contributed-revenue",
            label: "Contributed revenue",
            unit: "USD",
            aggregationRole: "denominator",
            input: { measurementType: "currency", value: 1_200 },
          },
        ],
      })).toMatchObject({
        state: "ok",
        value: 25,
        normalizedPercentage: 25,
        numerator: 300,
        denominator: 1_200,
        aggregationMethod: "ratio",
      });
    });

    it("rejects misleading aggregation across incompatible units", () => {
      expect(calculateMeasurement({
        measurementType: "multi_component",
        aggregationMethod: "sum",
        components: [
          countComponent("people", 10),
          {
            id: "revenue",
            label: "Revenue",
            unit: "USD",
            input: { measurementType: "currency", value: 1000 },
          },
        ],
      })).toMatchObject({
        state: "invalid",
        issues: [{ code: "INCOMPATIBLE_COMPONENT_UNITS" }],
      });
    });

    it("supports all-complete across unlike units when every component has a target", () => {
      expect(calculateMeasurement({
        measurementType: "multi_component",
        aggregationMethod: "all_complete",
        components: [
          { ...countComponent("participants", 10), targetValue: 10 },
          {
            id: "revenue",
            label: "Revenue",
            unit: "USD",
            targetValue: 500,
            input: { measurementType: "currency", value: 600 },
          },
        ],
      })).toMatchObject({ state: "ok", value: 1, normalizedPercentage: 100 });

      expect(calculateMeasurement({
        measurementType: "multi_component",
        aggregationMethod: "all_complete",
        components: [{ ...countComponent("participants", 5), targetValue: 10 }],
      })).toMatchObject({ state: "ok", value: 0, normalizedPercentage: 0 });
    });
  });

  describe("goal completion rules", () => {
    it("requires all eligible required KPIs while excluding informational and unresolved KPIs", () => {
      const result = calculateGoalCompletion({
        goalId: "goal-1",
        rule: { type: "all_required_kpis" },
        kpis: [
          { id: "required-a", progress: 100 },
          { id: "required-b", progress: 100 },
          { id: "info", role: "informational", progress: 0 },
          { id: "undefined", configurationStatus: "needs_definition" },
          { id: "untargeted", configurationStatus: "needs_target" },
        ],
      });
      expect(result).toMatchObject({
        state: "ok",
        eligible: true,
        complete: true,
        completedKpisCount: 2,
        totalEligibleKpisCount: 2,
        excludedKpisCount: 3,
      });
      expect(result.excludedKpis.map((item) => item.reason)).toEqual([
        "informational",
        "needs_definition",
        "needs_target",
      ]);
    });

    it("calculates weighted-average completion with an explicit threshold", () => {
      expect(calculateGoalCompletion({
        goalId: "goal-weighted",
        rule: { type: "weighted_average", completionThresholdPercentage: 60 },
        kpis: [
          { id: "a", progress: 100, weight: 1 },
          { id: "b", progress: 50, weight: 3 },
        ],
      })).toMatchObject({
        state: "ok",
        eligible: true,
        complete: true,
        completionPercentage: 62.5,
      });
    });

    it("supports threshold-count rules by absolute count or eligible percentage", () => {
      const kpis = [
        { id: "a", progress: 100 },
        { id: "b", progress: 100 },
        { id: "c", progress: 50 },
      ];
      expect(calculateGoalCompletion({
        goalId: "count",
        rule: { type: "threshold_count", thresholdCount: 2 },
        kpis,
      })).toMatchObject({ complete: true, completionPercentage: 66.67 });
      expect(calculateGoalCompletion({
        goalId: "percent",
        rule: { type: "threshold_count", thresholdPercentage: 75 },
        kpis,
      })).toMatchObject({ complete: false, completionPercentage: 66.67 });
    });

    it("supports manual status without requiring eligible KPIs", () => {
      expect(calculateGoalCompletion({
        goalId: "manual",
        rule: { type: "manual_status", complete: true },
        kpis: [],
      })).toMatchObject({
        state: "ok",
        eligible: true,
        complete: true,
        completionPercentage: 100,
      });
      expect(calculateGoalCompletion({
        goalId: "manual-unset",
        rule: { type: "manual_status" },
        kpis: [],
      })).toMatchObject({
        state: "missing",
        eligible: false,
        issues: [{ code: "MANUAL_STATUS_REQUIRED" }],
      });
    });

    it("excludes a goal when every required KPI is unresolved", () => {
      expect(calculateGoalCompletion({
        goalId: "excluded",
        rule: { type: "all_required_kpis" },
        kpis: [
          { id: "a", configurationStatus: "needs_definition" },
          { id: "b", configurationStatus: "needs_target" },
        ],
      })).toMatchObject({
        state: "missing",
        eligible: false,
        totalEligibleKpisCount: 0,
        exclusionReasons: ["NO_ELIGIBLE_KPIS", "needs_definition", "needs_target"],
      });
    });

    it("keeps a configured KPI with no actual in the denominator as not started", () => {
      const notStarted = calculateProgress({
        currentValue: null,
        targetValue: 10,
        configurationStatus: "active",
      });
      expect(calculateGoalCompletion({
        goalId: "configured-no-actual",
        rule: { type: "all_required_kpis" },
        kpis: [{
          id: "configured",
          configurationStatus: "active",
          progress: notStarted,
        }],
      })).toMatchObject({
        state: "ok",
        eligible: true,
        complete: false,
        completionPercentage: 0,
        totalEligibleKpisCount: 1,
        excludedKpisCount: 0,
      });
    });
  });

  describe("priority and organization rollups", () => {
    function result(goalId: string, complete: boolean): GoalCompletionResult {
      return calculateGoalCompletion({
        goalId,
        rule: { type: "manual_status", complete },
        kpis: [],
      });
    }

    it("returns completed, eligible, percentage, excluded count, and reasons", () => {
      const excluded = calculateGoalCompletion({
        goalId: "excluded",
        rule: { type: "all_required_kpis" },
        kpis: [{ id: "undefined", configurationStatus: "needs_definition" }],
      });
      const summary = rollupGoalCompletions([
        { goalId: "complete", result: result("complete", true) },
        { goalId: "incomplete", result: result("incomplete", false) },
        { goalId: "excluded", result: excluded },
      ]);
      expect(summary).toEqual({
        completedGoalsCount: 1,
        totalEligibleGoalsCount: 2,
        completionPercentage: 50,
        excludedGoalsCount: 1,
        excludedGoalReasons: [{
          goalId: "excluded",
          reasons: ["NO_ELIGIBLE_KPIS", "needs_definition"],
        }],
      });
    });

    it("builds consistent priority and organization summaries", () => {
      const excluded = calculateGoalCompletion({
        goalId: "p2-excluded",
        rule: { type: "manual_status" },
        kpis: [],
      });
      const rollups = calculateStrategyRollups([
        {
          goalId: "p1-complete",
          priorityId: "p1",
          priorityName: "Visitor Experience",
          result: result("p1-complete", true),
        },
        {
          goalId: "p1-incomplete",
          priorityId: "p1",
          priorityName: "Visitor Experience",
          result: result("p1-incomplete", false),
        },
        {
          goalId: "p2-complete",
          priorityId: "p2",
          priorityName: "Preservation",
          result: result("p2-complete", true),
        },
        {
          goalId: "p2-excluded",
          priorityId: "p2",
          priorityName: "Preservation",
          result: excluded,
        },
      ]);

      expect(rollups.organization).toMatchObject({
        completedGoalsCount: 2,
        totalEligibleGoalsCount: 3,
        completionPercentage: 66.67,
        excludedGoalsCount: 1,
      });
      expect(rollups.priorities).toEqual([
        expect.objectContaining({
          priorityId: "p1",
          completedGoalsCount: 1,
          totalEligibleGoalsCount: 2,
          completionPercentage: 50,
          excludedGoalsCount: 0,
        }),
        expect.objectContaining({
          priorityId: "p2",
          completedGoalsCount: 1,
          totalEligibleGoalsCount: 1,
          completionPercentage: 100,
          excludedGoalsCount: 1,
        }),
      ]);
    });
  });
});
