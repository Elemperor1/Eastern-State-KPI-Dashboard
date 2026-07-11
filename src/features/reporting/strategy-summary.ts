import type {
  ConfigurationStatus,
  GoalCompletionResult,
  GoalCompletionRule,
  MeasurementResult,
  ProgressResult,
  StrategicGoalReadModel,
  StrategyRollups,
} from "@/features/strategy";
import {
  calculateAnnualAndPlanProgress,
  calculateGoalCompletion,
  calculateStrategyRollups,
  resolveConfiguredTargetValue,
} from "@/features/strategy";
import { STRATEGIC_PLAN_START_YEAR } from "@/features/strategy";
import type { KPIWithCategory, MonthlyEntryWithMeta } from "@/lib/types";
import type { StrategicCalculatedActual } from "./strategy-actuals";

export type StrategicActualValue = StrategicCalculatedActual;

export interface StrategicKpiProgressSummary {
  kpiId: number;
  kpiSlug: string;
  kpiName: string;
  measurementType: string | null;
  configurationStatus: string;
  boardLevelStatus: string | null;
  currentValue: number | null;
  currentCalculation: MeasurementResult | null;
  annualActual: number | null;
  cumulativeActual: number | null;
  annualTarget: number | null;
  annualTargetDescription: string | null;
  annualPacingTarget: number | null;
  annualPacing: ProgressResult;
  annualProgress: ProgressResult;
  fullPlanTarget: number | null;
  fullPlanTargetYear: number | null;
  fullPlanTargetDescription: string | null;
  fullPlanProgress: ProgressResult;
  completionProgress: ProgressResult;
}

export interface StrategicGoalProgressSummary {
  goalId: string;
  goalName: string;
  priorityId: string;
  prioritySlug: string;
  priorityName: string;
  configurationStatus: string;
  result: GoalCompletionResult;
  kpis: StrategicKpiProgressSummary[];
}

export interface StrategicDashboardSummary {
  selectedYear: number;
  organization: Omit<StrategyRollups["organization"], "excludedGoalReasons"> & {
    excludedGoalReasons: Array<{
      goalId: string;
      goalName: string;
      reasons: string[];
    }>;
  };
  priorities: Array<
    Omit<StrategyRollups["priorities"][number], "excludedGoalReasons"> & {
      priorityName: string;
      excludedGoalReasons: Array<{
        goalId: string;
        goalName: string;
        reasons: string[];
      }>;
    }
  >;
  goals: StrategicGoalProgressSummary[];
}

export interface BuildStrategicDashboardSummaryInput {
  goals: StrategicGoalReadModel[];
  kpis: KPIWithCategory[];
  entries: MonthlyEntryWithMeta[];
  selectedYear: number;
  throughMonth?: number;
  /** First-class observations override legacy scalar entries when present. */
  actuals?: StrategicActualValue[];
}

/**
 * Build the board-facing strategic summary used by dashboard views and exports.
 *
 * Existing `monthly_entries` rows remain a compatibility source. First-class
 * observations win whenever they exist. Legacy annual rows use `month = 0`;
 * additive monthly values are summed while snapshot-style measures use the
 * latest reported value. This compatibility rule is intentionally centralized
 * here so UI and export code never invent their own formulas.
 */
export function buildStrategicDashboardSummary({
  goals,
  kpis,
  entries,
  selectedYear,
  throughMonth = 12,
  actuals = [],
}: BuildStrategicDashboardSummaryInput): StrategicDashboardSummary {
  const legacyById = new Map(kpis.map((kpi) => [kpi.id, kpi]));

  const goalSummaries = goals.map((goal): StrategicGoalProgressSummary => {
    const kpiSummaries = goal.members.map((member) => {
      const config = member.configuration;
      const measurementType = config?.measurement_type ?? null;
      const currentValue = resolveActualValue({
        kpiId: member.kpi_id,
        measurementType,
        reportingFrequency: config?.reporting_frequency ?? null,
        selectedYear,
        throughMonth,
        firstClassActuals: actuals,
        legacyEntries: entries,
      });
      const cumulativeActual = resolveCumulativeActual({
        kpiId: member.kpi_id,
        measurementType,
        reportingFrequency: config?.reporting_frequency ?? null,
        selectedYear,
        throughMonth,
        firstClassActuals: actuals,
        legacyEntries: entries,
      });
      const currentCalculation = resolveCurrentCalculation({
        kpiId: member.kpi_id,
        selectedYear,
        throughMonth,
        firstClassActuals: actuals,
      });
      const annualTarget = member.targets.find(
        (target) =>
          target.target_scope === "annual" &&
          target.reporting_year === selectedYear &&
          target.archived_at === null,
      ) ?? null;
      const fullPlanTarget = selectFullPlanTarget(member.targets, selectedYear);
      const legacy = legacyById.get(member.kpi_id);
      const direction = legacy?.direction === "lower" ? "lower" : "higher";
      const configurationStatus = config?.configuration_status ?? "needs_definition";
      const precision = config?.calculation_precision ?? 1;
      const annualTargetValue = resolveStrategicTargetValue(
        annualTarget,
        measurementType,
      );
      const fullPlanTargetValue = resolveStrategicTargetValue(
        fullPlanTarget,
        measurementType,
      );

      const annualAndPlanProgress = calculateAnnualAndPlanProgress({
        annualActual: currentValue,
        annualTarget: annualTargetValue,
        elapsedFraction: pacingElapsedFraction(
          config?.reporting_frequency ?? null,
          throughMonth,
        ),
        annualBaseline:
          annualTarget?.baseline_value ?? config?.baseline_value ?? null,
        cumulativeActual,
        fullPlanTarget: fullPlanTargetValue,
        fullPlanBaseline:
          fullPlanTarget?.baseline_value ?? config?.baseline_value ?? null,
        direction,
        precision,
        configurationStatus,
        annualConfigurationStatus: targetProgressConfigurationStatus(
          annualTarget,
          annualTargetValue,
          configurationStatus,
        ),
        fullPlanConfigurationStatus: targetProgressConfigurationStatus(
          fullPlanTarget,
          fullPlanTargetValue,
          configurationStatus,
        ),
      });
      const annualProgress = annualAndPlanProgress.annualCompletion;
      const fullPlanProgress = annualAndPlanProgress.fullPlanProgress;
      const completionProgress = fullPlanTarget
        ? fullPlanProgress
        : annualProgress;

      return {
        kpiId: member.kpi_id,
        kpiSlug: member.kpi.slug,
        kpiName: member.kpi.name,
        measurementType,
        configurationStatus,
        boardLevelStatus: config?.board_level_status ?? null,
        currentValue,
        currentCalculation,
        annualActual: currentValue,
        cumulativeActual,
        annualTarget: annualTargetValue,
        annualTargetDescription: annualTarget?.target_description ?? null,
        annualPacingTarget: annualAndPlanProgress.pacingTarget,
        annualPacing: annualAndPlanProgress.annualPacing,
        annualProgress,
        fullPlanTarget: fullPlanTargetValue,
        fullPlanTargetYear: fullPlanTarget?.target_year ?? null,
        fullPlanTargetDescription: fullPlanTarget?.target_description ?? null,
        fullPlanProgress,
        completionProgress,
      };
    });

    const result = isGoalConfigurationEligible(goal.configuration_status)
      ? calculateGoalCompletion({
          goalId: String(goal.id),
          rule: toGoalRule(goal),
          kpis: goal.members.map((member, index) => ({
            id: String(member.kpi_id),
            label: member.kpi.name,
            role: member.role,
            configurationStatus:
              member.configuration?.configuration_status ?? "needs_definition",
            progress: kpiSummaries[index]?.completionProgress ?? null,
            weight: member.weight,
          })),
        })
      : excludedGoalResult(goal);

    return {
      goalId: String(goal.id),
      goalName: goal.name,
      priorityId: String(goal.priority_id),
      prioritySlug: goal.priority_slug,
      priorityName: goal.priority_name,
      configurationStatus: goal.configuration_status,
      result,
      kpis: kpiSummaries,
    };
  });

  const rollups = calculateStrategyRollups(
    goalSummaries.map((goal) => ({
      goalId: goal.goalId,
      priorityId: goal.priorityId,
      priorityName: goal.priorityName,
      result: goal.result,
    })),
  );
  const goalNames = new Map(
    goalSummaries.map((goal) => [goal.goalId, goal.goalName]),
  );
  const withNames = (
    reasons: Array<{ goalId: string; reasons: string[] }>,
  ) => reasons.map((reason) => ({
    ...reason,
    goalName: goalNames.get(reason.goalId) ?? `Goal ${reason.goalId}`,
  }));

  return {
    selectedYear,
    organization: {
      ...rollups.organization,
      excludedGoalReasons: withNames(
        rollups.organization.excludedGoalReasons,
      ),
    },
    priorities: rollups.priorities.map((priority) => ({
      ...priority,
      priorityName: priority.priorityName ?? "Unnamed strategic priority",
      excludedGoalReasons: withNames(priority.excludedGoalReasons),
    })),
    goals: goalSummaries,
  };
}

function pacingElapsedFraction(
  reportingFrequency: string | null,
  throughMonth: number,
): number {
  if (reportingFrequency !== "monthly" && reportingFrequency !== "quarterly") {
    return 1;
  }
  return Math.min(12, Math.max(0, throughMonth)) / 12;
}

function isGoalConfigurationEligible(status: string): boolean {
  return status === "ready" || status === "active";
}

function toGoalRule(goal: StrategicGoalReadModel): GoalCompletionRule {
  switch (goal.completion_rule) {
    case "weighted_average":
      return {
        type: "weighted_average",
        ...(goal.threshold_percentage === null
          ? {}
          : { completionThresholdPercentage: goal.threshold_percentage }),
      };
    case "threshold_count":
      return {
        type: "threshold_count",
        ...(goal.threshold_count === null
          ? {}
          : { thresholdCount: goal.threshold_count }),
        ...(goal.threshold_percentage === null
          ? {}
          : { thresholdPercentage: goal.threshold_percentage }),
      };
    case "manual_status":
      return {
        type: "manual_status",
        complete:
          goal.manual_status === null
            ? null
            : goal.manual_status === "complete",
      };
    default:
      return { type: "all_required_kpis" };
  }
}

function excludedGoalResult(goal: StrategicGoalReadModel): GoalCompletionResult {
  const code = `GOAL_${goal.configuration_status.toUpperCase()}`;
  return {
    goalId: String(goal.id),
    rule: goal.completion_rule,
    state: "missing",
    eligible: false,
    complete: false,
    completionPercentage: null,
    completedKpisCount: 0,
    totalEligibleKpisCount: 0,
    excludedKpisCount: goal.members.length,
    excludedKpis: goal.members.map((member) => ({
      id: String(member.kpi_id),
      label: member.kpi.name,
      reason:
        goal.configuration_status === "needs_target"
          ? "needs_target"
          : goal.configuration_status === "archived"
            ? "archived"
            : goal.configuration_status === "draft"
              ? "draft"
              : "needs_definition",
    })),
    exclusionReasons: [code],
    issues: [{
      kind: "missing",
      code,
      message:
        goal.unresolved_question ??
        `Goal configuration is ${goal.configuration_status.replaceAll("_", " ")}.`,
      field: "configuration_status",
    }],
  };
}

function selectFullPlanTarget(
  targets: StrategicGoalReadModel["members"][number]["targets"],
  selectedYear: number,
) {
  const candidates = targets
    .filter(
      (target) => target.target_scope === "full_plan" && target.archived_at === null,
    )
    .sort((a, b) => a.target_year - b.target_year || a.id - b.id);
  return candidates.find((target) => target.target_year >= selectedYear)
    ?? candidates.at(-1)
    ?? null;
}

type StrategicTarget =
  StrategicGoalReadModel["members"][number]["targets"][number];

/** Resolve only documented structured forms; unknown structures stay unresolved. */
function resolveStrategicTargetValue(
  target: StrategicTarget | null,
  measurementType: string | null,
): number | null {
  if (target === null) return null;
  return resolveConfiguredTargetValue({
    measurementType:
      measurementType === null ? null : targetMeasurementType(measurementType),
    targetValue: target.target_value,
    structuredTarget: target.structured_target,
    targetDescription: target.target_description,
    configurationStatus: target.configuration_status,
  });
}

function targetMeasurementType(value: string) {
  return [
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
  ].includes(value)
    ? (value as import("@/features/strategy").MeasurementType)
    : null;
}

function targetProgressConfigurationStatus(
  target: StrategicTarget | null,
  resolvedValue: number | null,
  parentStatus: ConfigurationStatus,
): ConfigurationStatus {
  if (parentStatus !== "ready" && parentStatus !== "active") {
    return parentStatus;
  }
  if (target === null) return parentStatus;
  if (target.configuration_status === "needs_definition") {
    return "needs_definition";
  }
  if (
    target.configuration_status !== "ready" &&
    target.configuration_status !== "active"
  ) {
    return "needs_target";
  }
  return resolvedValue === null ? "needs_definition" : parentStatus;
}

function resolveActualValue({
  kpiId,
  measurementType,
  reportingFrequency,
  selectedYear,
  throughMonth,
  firstClassActuals,
  legacyEntries,
}: {
  kpiId: number;
  measurementType: string | null;
  reportingFrequency: string | null;
  selectedYear: number;
  throughMonth: number;
  firstClassActuals: StrategicActualValue[];
  legacyEntries: MonthlyEntryWithMeta[];
}): number | null {
  const direct = firstClassActuals.filter(
    (actual) => actual.kpiId === kpiId && actual.year === selectedYear,
  );
  if (direct.length > 0) {
    return combinePeriodValues(
      direct.map((actual) => ({
        periodType: actual.periodType,
        periodIndex: actual.periodIndex,
        value: actual.value,
      })),
      measurementType,
      reportingFrequency,
      throughMonth,
    );
  }

  const legacy = legacyEntries
    .filter((entry) => entry.kpi_id === kpiId && entry.year === selectedYear)
    .map((entry) => ({ periodIndex: entry.month, value: entry.value }));
  return combinePeriodValues(
    legacy,
    measurementType,
    reportingFrequency,
    throughMonth,
  );
}

function resolveCurrentCalculation({
  kpiId,
  selectedYear,
  throughMonth,
  firstClassActuals,
}: {
  kpiId: number;
  selectedYear: number;
  throughMonth: number;
  firstClassActuals: StrategicActualValue[];
}): MeasurementResult | null {
  return firstClassActuals
    .filter(
      (actual) =>
        actual.kpiId === kpiId &&
        actual.year === selectedYear &&
        periodIncluded(actual, throughMonth),
    )
    .sort((a, b) => periodSortKey(a) - periodSortKey(b))
    .at(-1)?.calculation ?? null;
}

function resolveCumulativeActual({
  kpiId,
  measurementType,
  reportingFrequency,
  selectedYear,
  throughMonth,
  firstClassActuals,
  legacyEntries,
}: {
  kpiId: number;
  measurementType: string | null;
  reportingFrequency: string | null;
  selectedYear: number;
  throughMonth: number;
  firstClassActuals: StrategicActualValue[];
  legacyEntries: MonthlyEntryWithMeta[];
}): number | null {
  if (reportingFrequency === "cumulative" || reportingFrequency === "one_time") {
    for (let year = selectedYear; year >= STRATEGIC_PLAN_START_YEAR; year -= 1) {
      const value = resolveActualValue({
        kpiId,
        measurementType,
        reportingFrequency,
        selectedYear: year,
        throughMonth: year === selectedYear ? throughMonth : 12,
        firstClassActuals,
        legacyEntries,
      });
      if (value !== null) return value;
    }
    return null;
  }

  if (measurementType === "cumulative" && reportingFrequency === "annual") {
    const values: number[] = [];
    for (let year = STRATEGIC_PLAN_START_YEAR; year <= selectedYear; year += 1) {
      const value = resolveActualValue({
        kpiId,
        measurementType,
        reportingFrequency,
        selectedYear: year,
        throughMonth: 12,
        firstClassActuals,
        legacyEntries,
      });
      if (value !== null) values.push(value);
    }
    return values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0);
  }

  return resolveActualValue({
    kpiId,
    measurementType,
    reportingFrequency,
    selectedYear,
    throughMonth,
    firstClassActuals,
    legacyEntries,
  });
}

function combinePeriodValues(
  rows: Array<{
    periodType?: StrategicActualValue["periodType"];
    periodIndex: number;
    value: number | null | undefined;
  }>,
  measurementType: string | null,
  reportingFrequency: string | null,
  throughMonth: number,
): number | null {
  const finite = rows
    .filter(
      (row) =>
        Number.isFinite(row.value) &&
        periodIncluded(row, throughMonth),
    )
    .map((row) => ({ periodIndex: row.periodIndex, value: Number(row.value) }));
  if (finite.length === 0) return null;

  const annual = finite.filter((row) => row.periodIndex === 0);
  if (annual.length > 0) return annual.at(-1)?.value ?? null;

  const additive = new Set(["count", "cumulative", "currency"]);
  if (
    additive.has(measurementType ?? "") &&
    (reportingFrequency === "monthly" || reportingFrequency === "quarterly")
  ) {
    return finite.reduce((sum, row) => sum + row.value, 0);
  }

  finite.sort((a, b) => a.periodIndex - b.periodIndex);
  return finite.at(-1)?.value ?? null;
}

function periodIncluded(
  period: {
    periodType?: StrategicActualValue["periodType"];
    periodIndex: number;
  },
  throughMonth: number,
): boolean {
  if (
    period.periodIndex === 0 ||
    period.periodType === "annual" ||
    period.periodType === "cumulative" ||
    period.periodType === "one_time"
  ) {
    return true;
  }
  if (period.periodType === "quarterly") {
    return period.periodIndex <= Math.ceil(Math.max(0, throughMonth) / 3);
  }
  return period.periodIndex <= throughMonth;
}

function periodSortKey(period: StrategicActualValue): number {
  const rank = {
    monthly: 1,
    quarterly: 2,
    annual: 3,
    cumulative: 4,
    one_time: 5,
  }[period.periodType];
  return rank * 100 + period.periodIndex;
}
