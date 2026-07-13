import type {
  BoardConfigurationStatus,
  BoardMeasurementType,
  BoardProgressStatus,
  BoardReportingFrequency,
  StrategicBoardReportViewModel,
  TargetProgressInput,
} from "./strategic-board-report";
import { buildStrategicBoardReport } from "./strategic-board-report";
import {
  calculateMeasurement,
  resolveEffectiveTargetPolicy,
  type AverageMethod,
  type MeasurementResult,
  type StrategicGoalReadModel,
} from "@/features/strategy";
import type {
  StrategicDashboardSummary,
  StrategicKpiProgressSummary,
} from "./strategy-summary";

export function buildStrategicBoardReportFromSummary({
  summary,
  goals,
}: {
  summary: StrategicDashboardSummary;
  goals: StrategicGoalReadModel[];
}): StrategicBoardReportViewModel {
  const goalsById = new Map(goals.map((goal) => [String(goal.id), goal]));
  const goalSummariesByPriority = new Map<string, typeof summary.goals>();
  for (const goal of summary.goals) {
    const existing = goalSummariesByPriority.get(goal.priorityId) ?? [];
    existing.push(goal);
    goalSummariesByPriority.set(goal.priorityId, existing);
  }

  return buildStrategicBoardReport({
    organizationName: "Eastern State Penitentiary Historic Site",
    selectedYear: summary.selectedYear,
    organizationGoalCompletion: {
      ...summary.organization,
      excludedGoalReasons: summary.organization.excludedGoalReasons.map(
        (reason) => `${reason.goalName}: ${reason.reasons.join("; ")}`,
      ),
    },
    priorities: summary.priorities.map((priority) => ({
      id: priority.priorityId,
      name: priority.priorityName,
      goalCompletion: {
        ...priority,
        excludedGoalReasons: priority.excludedGoalReasons.map(
          (reason) => `${reason.goalName}: ${reason.reasons.join("; ")}`,
        ),
      },
      goals: (goalSummariesByPriority.get(priority.priorityId) ?? []).map(
        (goalSummary) => {
          const goal = goalsById.get(goalSummary.goalId);
          return {
            id: goalSummary.goalId,
            name: goalSummary.goalName,
            completionStatus: goalCompletionStatus(goalSummary.result),
            actualCompletionPercentage:
              goalSummary.result.completionPercentage,
            completedKpisCount: goalSummary.result.completedKpisCount,
            totalEligibleKpisCount:
              goalSummary.result.totalEligibleKpisCount,
            excludedKpisCount: goalSummary.result.excludedKpisCount,
            excludedReasons: [
              ...(goal?.unresolved_question ? [goal.unresolved_question] : []),
              ...goalSummary.result.exclusionReasons,
            ],
            kpis: goalSummary.kpis.map((kpiSummary) => {
              const member = goal?.members.find(
                (candidate) => candidate.kpi_id === kpiSummary.kpiId,
              );
              const config = member?.configuration;
              const configurationStatus = boardConfigurationStatus(
                kpiSummary.configurationStatus,
              );
              const calculatedComponents = new Map(
                (kpiSummary.currentCalculation?.components ?? []).map(
                  (component) => [component.id, component],
                ),
              );
              const components = member?.components.map((component) => {
                const componentTargetPolicy = resolveEffectiveTargetPolicy({
                  targets: component.targets,
                  reportingYear: summary.selectedYear,
                  measurementType: component.measurement_type,
                  parentConfigurationStatus: component.configuration_status,
                });
                const componentTarget = componentTargetPolicy.effective.target;
                const componentTargetValue = componentTargetPolicy.effective.value;
                const calculated = calculatedComponents.get(String(component.id));
                const componentMeasurementType = boardMeasurementType(
                  component.measurement_type,
                );
                const componentUnit = boardResultUnit(
                  componentMeasurementType,
                  component.unit,
                  null,
                );
                const componentResult = calculated?.result;
                const componentState = componentResult?.state ?? "missing";
                return {
                  id: String(component.id),
                  label: component.label,
                  measurementType: componentMeasurementType,
                  unit: componentUnit,
                  result: {
                    state: componentState,
                    value: componentResult?.value ?? null,
                    displayValue: presentBoardResult({
                      measurementType: componentMeasurementType,
                      state: componentState,
                      value: componentResult?.value ?? null,
                      unit: componentUnit,
                      precision: componentResult?.precision ??
                        config?.calculation_precision ?? 1,
                      respondentCount: componentResult?.respondentCount ?? null,
                      distributionRespondentTotal:
                        componentResult?.distribution?.respondentTotal ?? null,
                      aggregationMethod:
                        componentResult?.aggregationMethod ?? null,
                      componentStates:
                        componentResult?.components?.map(
                          (entry) => entry.result.state,
                        ) ?? [],
                    }),
                    numerator: componentResult?.numerator ?? null,
                    denominator: componentResult?.denominator ?? null,
                    respondentCount:
                      componentResult?.respondentCount ?? null,
                    formulaExplanation: formulaExplanation(
                      component.measurement_type,
                      calculated?.result.averageMethod,
                      calculated?.result.calculationProvenance,
                    ),
                  },
                  progress: calculated?.progress
                    ? {
                        actualValue: calculated.progress.currentValue,
                        targetValue: calculated.progress.targetValue,
                        actualProgressPercentage:
                          calculated.progress.actualProgressPercentage,
                        status: calculated.progress.status,
                        targetYear: componentTarget?.target_year ?? null,
                        targetDescription:
                          componentTarget?.target_description ?? null,
                      }
                    : componentTarget
                    ? {
                        actualValue: null,
                        targetValue: componentTargetValue,
                        actualProgressPercentage: null,
                        status: componentTargetPolicy.effective.progressStatus,
                        targetYear: componentTarget.target_year,
                        targetDescription:
                          componentTarget.target_description,
                      }
                    : null,
                  configurationStatus: boardConfigurationStatus(
                    component.configuration_status,
                  ),
                  unresolvedReasons: component.unresolved_question
                    ? [component.unresolved_question]
                    : [],
                };
              }) ?? [];
              const unresolvedReasons = [
                ...(config?.unresolved_question
                  ? [config.unresolved_question]
                  : []),
                ...(kpiSummary.currentCalculation?.issues.map(
                  (issue) => issue.message,
                ) ?? []),
                ...kpiSummary.completionProgress.issues
                  .filter((issue) => issue.code !== "MISSING_ACTUAL")
                  .map((issue) => issue.message),
              ];
              const measurementType = boardMeasurementType(
                kpiSummary.measurementType,
              );
              const calculation = kpiSummary.currentCalculation;
              const resultState = calculation?.state ??
                (kpiSummary.currentValue === null ? "missing" : "ok");
              const resultValue = calculation
                ? calculation.value
                : kpiSummary.currentValue;
              const unit = boardResultUnit(
                measurementType,
                config?.unit ?? null,
                member?.kpi.unit ?? null,
              );

              return {
                id: String(kpiSummary.kpiId),
                name: kpiSummary.kpiName,
                measurementType,
                reportingFrequency: boardReportingFrequency(
                  config?.reporting_frequency,
                ),
                unit,
                result: {
                  state: resultState,
                  value: resultValue,
                  displayValue: presentBoardResult({
                    measurementType,
                    state: resultState,
                    value: resultValue,
                    unit,
                    precision: calculation?.precision ??
                      config?.calculation_precision ?? 1,
                    respondentCount: calculation?.respondentCount ?? null,
                    distributionRespondentTotal:
                      calculation?.distribution?.respondentTotal ?? null,
                    aggregationMethod:
                      calculation?.aggregationMethod ??
                      config?.aggregation_method ?? null,
                    componentStates:
                      calculation?.components?.map(
                        (component) => component.result.state,
                      ) ?? [],
                  }),
                  numerator:
                    calculation?.numerator ?? null,
                  denominator:
                    calculation?.denominator ?? null,
                  respondentCount:
                    calculation?.respondentCount ?? null,
                  formulaExplanation: formulaExplanation(
                    kpiSummary.measurementType,
                    kpiSummary.currentCalculation?.averageMethod,
                    kpiSummary.currentCalculation?.calculationProvenance,
                  ),
                },
                annualProgress: progressInput(
                  kpiSummary,
                  "annual",
                  summary.selectedYear,
                ),
                fullPlanProgress: progressInput(
                  kpiSummary,
                  "full_plan",
                  summary.selectedYear,
                ),
                boardStatus: config?.board_level_status ?? "not_reported",
                configurationStatus,
                components,
                demographics:
                  kpiSummary.measurementType === "distribution"
                    ? {
                        respondentTotal:
                          kpiSummary.currentCalculation?.distribution
                            ?.respondentTotal ?? null,
                        mutuallyExclusive:
                          !(kpiSummary.currentCalculation?.distribution
                            ?.allowNonExclusive ?? false),
                        populationCaveat:
                          "Survey respondents are not assumed to represent every visitor.",
                        bands:
                          kpiSummary.currentCalculation?.distribution
                            ?.categories.map((category) => ({
                              id: category.id,
                              label: category.label,
                              count: category.count,
                              percentage: category.percentage,
                              isUnknown: false,
                              isDeclined: false,
                              derivedGroup: category.derivedGroup,
                            })) ?? [],
                        derivedNonWhitePercentage:
                          kpiSummary.currentCalculation?.distribution
                            ?.derivedNonWhitePercentage ?? null,
                      }
                    : null,
                revenueBreakdown:
                  isCurrencyComposition({
                    measurementType,
                    configuration: config ?? null,
                    components: member?.components ?? [],
                  })
                    ? {
                        totalRevenue:
                          calculation?.value ?? null,
                        streams: components.map((component) => ({
                          id: component.id,
                          label: component.label,
                          value: component.result.value,
                          sharePercentage: revenueShare(
                            component.result.value,
                            calculation?.value ?? null,
                            calculation?.precision ??
                              config?.calculation_precision ?? 1,
                          ),
                        })),
                      }
                    : null,
                unresolvedReasons,
              };
            }),
          };
        },
      ),
    })),
  });
}

function isCurrencyComposition({
  measurementType,
  configuration,
  components,
}: {
  measurementType: BoardMeasurementType;
  configuration: StrategicGoalReadModel["members"][number]["configuration"];
  components: StrategicGoalReadModel["members"][number]["components"];
}): boolean {
  if (
    measurementType !== "multi_component" ||
    configuration?.measurement_type !== "multi_component" ||
    configuration.aggregation_method !== "sum" ||
    currencyCode(configuration.unit) === null ||
    components.length === 0
  ) {
    return false;
  }

  const parentCurrency = currencyCode(configuration.unit);
  return components.every(
    (component) =>
      component.measurement_type === "currency" &&
      currencyCode(component.unit) === parentCurrency,
  );
}

function currencyCode(unit: string | null): "USD" | null {
  const normalized = unit?.trim().toLowerCase();
  return normalized === "usd" || normalized === "$" || normalized === "currency"
    ? "USD"
    : null;
}

function revenueShare(
  value: number | null,
  total: number | null,
  precision: number,
): number | null {
  return calculateMeasurement({
    measurementType: "ratio",
    numerator: value,
    denominator: total,
    scale: 100,
    precision,
  }).value;
}

function goalCompletionStatus(
  result: StrategicDashboardSummary["goals"][number]["result"],
): BoardProgressStatus {
  if (!result.eligible || result.state !== "ok") return "needs_definition";
  if (result.complete) return "complete";
  return (result.completionPercentage ?? 0) > 0 ? "in_progress" : "not_started";
}

function progressInput(
  kpi: StrategicKpiProgressSummary,
  scope: "annual" | "full_plan",
  selectedYear: number,
): TargetProgressInput | null {
  const progress = scope === "annual" ? kpi.annualProgress : kpi.fullPlanProgress;
  const targetValue = scope === "annual" ? kpi.annualTarget : kpi.fullPlanTarget;
  const targetDescription = scope === "annual"
    ? kpi.annualTargetDescription
    : kpi.fullPlanTargetDescription;
  const targetYear = scope === "annual"
    ? selectedYear
    : kpi.fullPlanTargetYear;
  if (
    targetValue === null &&
    targetDescription === null &&
    (progress.status === "target_not_finalized" ||
      kpi.configurationStatus === "needs_target")
  ) {
    return {
      actualValue: kpi.currentValue,
      targetValue: null,
      actualProgressPercentage: null,
      status: "target_not_finalized",
      targetYear,
      targetDescription: null,
    };
  }
  if (targetValue === null && targetDescription === null) return null;
  return {
    actualValue: progress.currentValue,
    targetValue: progress.targetValue,
    actualProgressPercentage: progress.actualProgressPercentage,
    status: progress.status,
    pacingTarget: scope === "annual" ? kpi.annualPacingTarget : null,
    pacingStatus:
      scope === "annual" ? annualPacingStatus(kpi.annualPacing) : null,
    targetYear,
    targetDescription,
  };
}

function annualPacingStatus(
  progress: StrategicKpiProgressSummary["annualPacing"],
): BoardProgressStatus {
  if (progress.status === "complete" || progress.status === "exceeded") {
    return "on_track";
  }
  if (progress.status === "in_progress") return "off_track";
  if (progress.status === "not_started") {
    return progress.currentValue === null ? "not_reported" : "off_track";
  }
  return progress.status;
}

function boardMeasurementType(value: unknown): BoardMeasurementType {
  const supported: BoardMeasurementType[] = [
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
  ];
  return supported.includes(value as BoardMeasurementType)
    ? (value as BoardMeasurementType)
    : "count";
}

function boardReportingFrequency(value: unknown): BoardReportingFrequency {
  const supported: BoardReportingFrequency[] = [
    "monthly",
    "quarterly",
    "annual",
    "cumulative",
    "one_time",
    "flexible",
  ];
  return supported.includes(value as BoardReportingFrequency)
    ? (value as BoardReportingFrequency)
    : "annual";
}

function boardConfigurationStatus(value: unknown): BoardConfigurationStatus {
  const supported: BoardConfigurationStatus[] = [
    "draft",
    "needs_definition",
    "needs_target",
    "ready",
    "active",
    "archived",
  ];
  return supported.includes(value as BoardConfigurationStatus)
    ? (value as BoardConfigurationStatus)
    : "draft";
}

type BoardResultState = "ok" | "missing" | "invalid";

function presentBoardResult({
  measurementType,
  state,
  value,
  unit,
  precision,
  respondentCount,
  distributionRespondentTotal,
  aggregationMethod,
  componentStates,
}: {
  measurementType: BoardMeasurementType;
  state: BoardResultState;
  value: number | null;
  unit: string | null;
  precision: number;
  respondentCount: number | null;
  distributionRespondentTotal: number | null;
  aggregationMethod: string | null;
  componentStates: BoardResultState[];
}): string {
  if (state === "missing") return "Not reported";
  if (state === "invalid") return "Needs review";
  if (measurementType === "distribution") {
    const total = respondentCount ?? distributionRespondentTotal;
    return total === null
      ? "Distribution reported"
      : `${formatNumber(total, 0)} ${total === 1 ? "respondent" : "respondents"}`;
  }
  if (measurementType === "binary") {
    if (value === 1) return "Complete";
    if (value === 0) return "Not complete";
    return "Needs review";
  }
  if (measurementType === "year_over_year") {
    if (value === null || !Number.isFinite(value)) return "Not reported";
    return `${value > 0 ? "+" : ""}${formatNumber(value, precision)}%`;
  }
  if (
    measurementType === "multi_component" &&
    aggregationMethod === "none"
  ) {
    const reportedCount = componentStates.filter((entry) => entry === "ok").length;
    return `${reportedCount} ${reportedCount === 1 ? "component" : "components"}`;
  }
  return formatScalarValue(value, unit, precision);
}

function boardResultUnit(
  measurementType: BoardMeasurementType,
  configuredUnit: string | null,
  legacyUnit: string | null,
): string | null {
  if (measurementType === "year_over_year") return "%";
  if (measurementType === "distribution") return "respondents";
  if (measurementType === "ratio") return configuredUnit;
  return configuredUnit ?? legacyUnit;
}

function formatScalarValue(
  value: number | null,
  unit: string | null,
  precision: number,
): string {
  if (value === null || !Number.isFinite(value)) return "Not reported";
  const formatted = formatNumber(value, precision);
  if (unit === "%") return `${formatted}%`;
  if (unit === "USD" || unit === "$" || unit?.toLowerCase() === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: normalizedPrecision(precision),
    }).format(value);
  }
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatNumber(value: number, precision: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: normalizedPrecision(precision),
  }).format(value);
}

function normalizedPrecision(precision: number): number {
  return Number.isInteger(precision) && precision >= 0 && precision <= 20
    ? precision
    : 2;
}

function formulaExplanation(
  measurementType: unknown,
  averageMethod?: AverageMethod,
  calculationProvenance?: MeasurementResult["calculationProvenance"],
): string {
  switch (measurementType) {
    case "binary":
      return "Completion is recorded as yes or no.";
    case "milestone":
      return "Completed milestones divided by required milestones.";
    case "percentage":
      if (calculationProvenance === "legacy_direct_value") {
        return "Retained direct legacy percentage; raw numerator and denominator are unavailable, so this result was not recalculated.";
      }
      return "Numerator divided by denominator, multiplied by 100.";
    case "average":
      if (calculationProvenance === "legacy_direct_value") {
        return "Retained direct legacy normalized value; raw score inputs and formula method are unavailable, so this result was not recalculated.";
      }
      if (averageMethod === "total_score") {
        return "Total score divided by total possible score, multiplied by 100.";
      }
      if (averageMethod === "average_score") {
        return "Average score divided by the configured maximum score, multiplied by 100.";
      }
      if (averageMethod === "percent_positive") {
        return "Positive responses divided by total responses, multiplied by 100.";
      }
      return "Raw average inputs are normalized using the persisted formula.";
    case "year_over_year":
      if (calculationProvenance === "legacy_direct_percentage") {
        return "Retained direct legacy percentage; underlying current and prior raw values are unavailable, so this result was not recalculated.";
      }
      return "Current value minus previous value, divided by the absolute previous value.";
    case "ratio":
      if (calculationProvenance === "legacy_direct_value") {
        return "Retained direct legacy ratio; raw numerator and denominator are unavailable, so this result was not recalculated.";
      }
      return "Numerator divided by the configured denominator.";
    case "distribution":
      return "Each category count divided by the respondent total.";
    case "multi_component":
      return "Components calculate independently; any parent result uses the configured aggregation method.";
    case "cumulative":
    case "count":
    case "currency":
      return "Reported values are aggregated according to the configured reporting frequency.";
    default:
      return "Calculated by the shared strategic measurement service.";
  }
}
