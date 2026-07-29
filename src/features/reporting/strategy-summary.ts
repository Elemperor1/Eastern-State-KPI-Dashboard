import {
  calculateAnnualAndPlanProgress,
  calculateProgress,
  calculateStrategicGoalCompletion,
  calculateStrategyRollups,
  resolveEffectiveTargetPolicy,
  roundFinite,
  type GoalCompletionResult,
  type MeasurementType,
  type MeasurementResult,
  type ProgressResult,
  type StrategicGoalReadModel,
  type StrategyRollups,
} from "@/features/strategy";
import type { KPIWithCategory } from "@/lib/types";
import type { StrategicCalculatedActual } from "./strategy-actuals";

type StrategicActualValue = StrategicCalculatedActual;

export interface StrategicKpiProgressSummary {
  kpiId: number;
  kpiSlug: string;
  kpiName: string;
  measurementType: string | null;
  configurationStatus: string;
  boardLevelStatus: string | null;
  /**
   * NOV-C5 disclosure: true when this measure holds values recorded while
   * it was archived, so a restore cannot quietly resurface hidden data.
   */
  restoredWithHiddenData: boolean;
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

interface StrategicGoalProgressSummary {
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
  planStartYear?: number;
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
  selectedYear: number;
  /** Persisted active-plan boundary. Tests may derive it from goal fixtures. */
  planStartYear?: number;
  throughMonth?: number;
  actuals?: StrategicActualValue[];
  /**
   * Measures with values recorded inside an archived interval; surfaced as
   * the restored-with-hidden-data marker on their KPI summaries (NOV-C5).
   */
  hiddenValueKpiIds?: ReadonlySet<number>;
}

/**
 * Build the board-facing strategic summary used by dashboard views and exports.
 *
 * Strategic observations are the only live reporting source. Legacy rows stay
 * available through Activity and archive tooling, never through this summary.
 */
export function buildStrategicDashboardSummary({
  goals,
  kpis,
  selectedYear,
  planStartYear,
  throughMonth = 12,
  actuals = [],
  hiddenValueKpiIds,
}: BuildStrategicDashboardSummaryInput): StrategicDashboardSummary {
  const effectivePlanStartYear = planStartYear ?? Math.min(
    selectedYear,
    ...goals.map((goal) => goal.plan_start_year),
  );
  const legacyById = new Map(kpis.map((kpi) => [kpi.id, kpi]));

  const goalSummaries = goals.map((goal): StrategicGoalProgressSummary => {
    const kpiSummaries = goal.members.map((member) => {
      const config = member.configuration;
      const measurementType = config?.measurement_type ?? null;
      const precision = config?.calculation_precision ?? 1;
      const currentActual = resolveActual({
        kpiId: member.kpi_id,
        measurementType,
        reportingFrequency: config?.reporting_frequency ?? null,
        selectedYear,
        throughMonth,
        firstClassActuals: actuals,
      });
      const currentValue = currentActual.value;
      const cumulativeActual = resolveCumulativeActual({
        kpiId: member.kpi_id,
        measurementType,
        reportingFrequency: config?.reporting_frequency ?? null,
        selectedYear,
        planStartYear: effectivePlanStartYear,
        throughMonth,
        firstClassActuals: actuals,
      });
      const currentCalculation = currentActual.calculation;
      const targetPolicy = resolveEffectiveTargetPolicy({
        targets: member.targets,
        reportingYear: selectedYear,
        measurementType,
        parentConfigurationStatus:
          config?.configuration_status ?? "needs_definition",
      });
      const annualTarget = targetPolicy.annual.target;
      const fullPlanTarget = targetPolicy.fullPlan.target;
      const legacy = legacyById.get(member.kpi_id);
      const direction = legacy?.direction === "lower" ? "lower" : "higher";
      const configurationStatus = config?.configuration_status ?? "needs_definition";
      const annualTargetValue = targetPolicy.annual.value;
      const fullPlanTargetValue = targetPolicy.fullPlan.value;

      const annualAndPlanProgress = calculateAnnualAndPlanProgress({
        annualActual: currentActual.invalidAggregate
          ? Number.NaN
          : currentValue,
        annualTarget: annualTargetValue,
        elapsedFraction: pacingElapsedFraction(
          config?.reporting_frequency ?? null,
          throughMonth,
        ),
        annualBaseline:
          annualTarget?.baseline_value ?? config?.baseline_value ?? null,
        cumulativeActual: cumulativeActual.invalidAggregate
          ? Number.NaN
          : cumulativeActual.value,
        fullPlanTarget: fullPlanTargetValue,
        fullPlanBaseline:
          fullPlanTarget?.baseline_value ?? config?.baseline_value ?? null,
        direction,
        precision,
        configurationStatus,
        annualConfigurationStatus:
          targetPolicy.annual.calculationConfigurationStatus,
        fullPlanConfigurationStatus:
          targetPolicy.fullPlan.calculationConfigurationStatus,
      });
      const annualProgress = annualAndPlanProgress.annualCompletion;
      const fullPlanProgress = annualAndPlanProgress.fullPlanProgress;
      const componentCompletionProgress = targetPolicy.effective.target === null
        ? resolveComponentTargetCompletionProgress({
            member,
            currentCalculation,
            selectedYear,
            precision,
            direction,
          })
        : null;
      const completionProgress = componentCompletionProgress ??
        (targetPolicy.effective.kind === "annual"
          ? annualProgress
          : fullPlanProgress);

      return {
        kpiId: member.kpi_id,
        kpiSlug: member.kpi.slug,
        kpiName: member.kpi.name,
        measurementType,
        configurationStatus,
        boardLevelStatus: config?.board_level_status ?? null,
        restoredWithHiddenData: hiddenValueKpiIds?.has(member.kpi_id) ?? false,
        currentValue,
        currentCalculation,
        annualActual: currentValue,
        cumulativeActual: cumulativeActual.value,
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

    const result = calculateStrategicGoalCompletion({
      goal,
      kpis: [
        ...goal.members.map((member, index) => ({
          id: String(member.kpi_id),
          label: member.kpi.name,
          role: member.role,
          configurationStatus:
            member.configuration?.configuration_status ?? "needs_definition",
          progress: kpiSummaries[index]?.completionProgress ?? null,
          weight: member.weight,
        })),
        ...(goal.archived_members ?? [])
          .filter(
            (archivedMember) =>
              !goal.members.some(
                (member) => member.kpi_id === archivedMember.kpi_id,
              ),
          )
          .map((member) => ({
            id: String(member.kpi_id),
            label: member.kpi_name,
            role: "required" as const,
            configurationStatus: "archived" as const,
            progress: null,
            weight: 0,
          })),
      ],
    });

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
  /** Implements the with names operation. */
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

/** Implements the pacing elapsed fraction operation. */
function pacingElapsedFraction(
  reportingFrequency: string | null,
  throughMonth: number,
): number {
  if (reportingFrequency !== "monthly" && reportingFrequency !== "quarterly") {
    return 1;
  }
  return Math.min(12, Math.max(0, throughMonth)) / 12;
}

/** Retrieves component target completion progress. */
function resolveComponentTargetCompletionProgress({
  member,
  currentCalculation,
  selectedYear,
  precision,
  direction,
}: {
  member: StrategicGoalReadModel["members"][number];
  currentCalculation: MeasurementResult | null;
  selectedYear: number;
  precision: number;
  direction: "higher" | "lower";
}): ProgressResult | null {
  const configuration = member.configuration;
  if (
    configuration?.measurement_type !== "multi_component" ||
    member.components.length === 0
  ) {
    return null;
  }

  const componentTargets = member.components.map((component) =>
    resolveEffectiveTargetPolicy({
      targets: component.targets,
      reportingYear: selectedYear,
      measurementType: component.measurement_type,
      parentConfigurationStatus: component.configuration_status,
    }).effective
  );
  const everyComponentTargetReady = componentTargets.every(
    (decision) =>
      decision.target !== null &&
      decision.value !== null &&
      (decision.calculationConfigurationStatus === "ready" ||
        decision.calculationConfigurationStatus === "active"),
  );
  if (!everyComponentTargetReady) return null;

  if (
    currentCalculation?.state === "invalid" ||
    (currentCalculation !== null &&
      (currentCalculation.measurementType !== "multi_component" ||
        currentCalculation.aggregationMethod !== configuration.aggregation_method))
  ) {
    return needsDefinitionProgress(precision);
  }

  if (configuration.aggregation_method === "all_complete") {
    return calculateProgress({
      currentValue:
        currentCalculation?.state === "ok" ? currentCalculation.value : null,
      targetValue: 1,
      precision,
      configurationStatus: configuration.configuration_status,
    });
  }

  if (configuration.aggregation_method === "sum") {
    if (!componentsHaveCompatibleUnits(member.components)) {
      return needsDefinitionProgress(precision);
    }
    const targetValue = roundFinite(
      componentTargets.reduce(
        (sum, decision) => sum + (decision.value as number),
        0,
      ),
      precision,
    );
    if (targetValue === null) return null;
    return calculateProgress({
      currentValue:
        currentCalculation?.state === "ok" ? currentCalculation.value : null,
      targetValue,
      direction,
      precision,
      configurationStatus: configuration.configuration_status,
    });
  }

  if (
    configuration.aggregation_method === "average" ||
    configuration.aggregation_method === "weighted_average"
  ) {
    if (!componentsHaveCompatibleUnits(member.components)) {
      return needsDefinitionProgress(precision);
    }
    if (currentCalculation === null) {
      return calculateProgress({
        currentValue: null,
        targetValue: 100,
        precision,
        configurationStatus: configuration.configuration_status,
      });
    }

    const calculatedById = new Map(
      (currentCalculation.components ?? []).map((component) => [
        component.id,
        component,
      ]),
    );
    const progressValues: Array<{ percentage: number; weight: number }> = [];
    for (const component of member.components) {
      const calculated = calculatedById.get(String(component.id));
      const progress = calculated?.progress;
      const percentage = progress?.actualProgressPercentage;
      if (
        progress === null ||
        progress === undefined ||
        progress.state === "invalid" ||
        progress.status === "needs_definition" ||
        progress.status === "target_not_finalized"
      ) {
        return needsDefinitionProgress(precision);
      }
      const normalizedPercentage = Number.isFinite(percentage)
        ? (percentage as number)
        : progress.state === "missing" && progress.status === "not_started"
          ? 0
          : null;
      if (normalizedPercentage === null) {
        return needsDefinitionProgress(precision);
      }
      if (!Number.isFinite(component.weight) || component.weight <= 0) {
        return needsDefinitionProgress(precision);
      }
      progressValues.push({
        percentage: normalizedPercentage,
        weight: component.weight,
      });
    }

    const totalWeight = configuration.aggregation_method === "weighted_average"
      ? progressValues.reduce((sum, component) => sum + component.weight, 0)
      : progressValues.length;
    const currentValue = roundFinite(
      progressValues.reduce(
        (sum, component) =>
          sum + component.percentage *
            (configuration.aggregation_method === "weighted_average"
              ? component.weight
              : 1),
        0,
      ) / totalWeight,
      precision,
    );
    if (currentValue === null) return needsDefinitionProgress(precision);
    return calculateProgress({
      currentValue,
      targetValue: 100,
      precision,
      configurationStatus: configuration.configuration_status,
    });
  }

  return null;
}

/** Implements the components have compatible units operation. */
function componentsHaveCompatibleUnits(
  components: StrategicGoalReadModel["members"][number]["components"],
): boolean {
  const units = new Set(
    components.map((component) => component.unit?.trim() || null),
  );
  return units.size === 1 && !units.has(null);
}

/** Determines whether needs definition progress. */
function needsDefinitionProgress(precision: number): ProgressResult {
  return calculateProgress({
    currentValue: null,
    targetValue: 1,
    precision,
    configurationStatus: "needs_definition",
  });
}

interface ResolvedActual {
  value: number | null;
  calculation: MeasurementResult | null;
  invalidAggregate: boolean;
}

/** Retrieves actual. */
function resolveActual({
  kpiId,
  measurementType,
  reportingFrequency,
  selectedYear,
  throughMonth,
  firstClassActuals,
}: {
  kpiId: number;
  measurementType: MeasurementType | null;
  reportingFrequency: string | null;
  selectedYear: number;
  throughMonth: number;
  firstClassActuals: StrategicActualValue[];
}): ResolvedActual {
  const direct = firstClassActuals.filter(
    (actual) => actual.kpiId === kpiId && actual.year === selectedYear,
  );
  const combined = combinePeriodValues(
    direct.map((actual) => ({
      periodType: actual.periodType,
      periodIndex: actual.periodIndex,
      value: actual.value,
    })),
    measurementType,
    reportingFrequency,
    throughMonth,
  );
  const latestCalculation = direct
    .filter((actual) => periodIncluded(actual, throughMonth))
    .sort((a, b) => periodSortKey(a) - periodSortKey(b))
    .at(-1)?.calculation ?? null;
  return {
    value: combined.value,
    calculation: combined.invalid
      ? invalidAggregateCalculation(measurementType, latestCalculation)
      : latestCalculation,
    invalidAggregate: combined.invalid,
  };
}

/** Builds an explicit invalid result for an overflowing period aggregate. */
function invalidAggregateCalculation(
  measurementType: MeasurementType | null,
  latest: MeasurementResult | null,
): MeasurementResult {
  return {
    ...(latest ?? {
      measurementType,
      value: null,
      normalizedPercentage: null,
      numerator: null,
      denominator: null,
      respondentCount: null,
      precision: 2,
    }),
    state: "invalid",
    measurementType,
    value: null,
    normalizedPercentage: null,
    issues: [
      ...(latest?.issues ?? []),
      {
        kind: "invalid",
        code: "NON_FINITE_RESULT",
        message: "Year-to-date aggregation produced a non-finite result.",
      },
    ],
  };
}

/** Retrieves cumulative actual. */
function resolveCumulativeActual({
  kpiId,
  measurementType,
  reportingFrequency,
  selectedYear,
  planStartYear,
  throughMonth,
  firstClassActuals,
}: {
  kpiId: number;
  measurementType: MeasurementType | null;
  reportingFrequency: string | null;
  selectedYear: number;
  planStartYear: number;
  throughMonth: number;
  firstClassActuals: StrategicActualValue[];
}): { value: number | null; invalidAggregate: boolean } {
  if (reportingFrequency === "cumulative" || reportingFrequency === "one_time") {
    for (let year = selectedYear; year >= planStartYear; year -= 1) {
      const actual = resolveActual({
        kpiId,
        measurementType,
        reportingFrequency,
        selectedYear: year,
        throughMonth: year === selectedYear ? throughMonth : 12,
        firstClassActuals,
      });
      if (actual.invalidAggregate) {
        return { value: null, invalidAggregate: true };
      }
      if (actual.value !== null) {
        return { value: actual.value, invalidAggregate: false };
      }
    }
    return { value: null, invalidAggregate: false };
  }

  if (measurementType === "cumulative" && reportingFrequency === "annual") {
    const values: number[] = [];
    for (let year = planStartYear; year <= selectedYear; year += 1) {
      const actual = resolveActual({
        kpiId,
        measurementType,
        reportingFrequency,
        selectedYear: year,
        throughMonth: 12,
        firstClassActuals,
      });
      if (actual.invalidAggregate) {
        return { value: null, invalidAggregate: true };
      }
      if (actual.value !== null) values.push(actual.value);
    }
    if (values.length === 0) {
      return { value: null, invalidAggregate: false };
    }
    const value = values.reduce((sum, item) => sum + item, 0);
    return Number.isFinite(value)
      ? { value, invalidAggregate: false }
      : { value: null, invalidAggregate: true };
  }

  const actual = resolveActual({
    kpiId,
    measurementType,
    reportingFrequency,
    selectedYear,
    throughMonth,
    firstClassActuals,
  });
  return {
    value: actual.value,
    invalidAggregate: actual.invalidAggregate,
  };
}

/** Implements the combine period values operation. */
function combinePeriodValues(
  rows: Array<{
    periodType?: StrategicActualValue["periodType"];
    periodIndex: number;
    value: number | null | undefined;
  }>,
  measurementType: MeasurementType | null,
  reportingFrequency: string | null,
  throughMonth: number,
): { value: number | null; invalid: boolean } {
  const finite = rows
    .filter(
      (row) =>
        Number.isFinite(row.value) &&
        periodIncluded(row, throughMonth),
    )
    .map((row) => ({ periodIndex: row.periodIndex, value: Number(row.value) }));
  if (finite.length === 0) return { value: null, invalid: false };

  const annual = finite.filter((row) => row.periodIndex === 0);
  if (annual.length > 0) {
    return { value: annual.at(-1)?.value ?? null, invalid: false };
  }

  if (isAdditiveReportingCombination(measurementType, reportingFrequency)) {
    const value = finite.reduce((sum, row) => sum + row.value, 0);
    return Number.isFinite(value)
      ? { value, invalid: false }
      : { value: null, invalid: true };
  }

  finite.sort((a, b) => a.periodIndex - b.periodIndex);
  return { value: finite.at(-1)?.value ?? null, invalid: false };
}

/**
 * True when included period values combine ADDITIVELY into the year-to-date
 * aggregate (count/cumulative/currency at monthly or quarterly frequency).
 * This is the single authority for the summary layer's YTD sum and for the
 * Board adapter's headline Result, which must agree for those combinations
 * (F-07: latest-period Result beside a YTD progress column diverged).
 */
export function isAdditiveReportingCombination(
  measurementType: string | null,
  reportingFrequency: string | null,
): boolean {
  const additive = new Set(["count", "cumulative", "currency"]);
  return (
    additive.has(measurementType ?? "") &&
    (reportingFrequency === "monthly" || reportingFrequency === "quarterly")
  );
}

/** Implements the period included operation. */
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

/** Implements the period sort key operation. */
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
