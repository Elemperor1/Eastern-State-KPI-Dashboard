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
  resolveConfiguredTargetValue,
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
                const componentTarget = selectComponentTarget(
                  component.targets,
                  summary.selectedYear,
                );
                const componentTargetValue = componentTarget
                  ? resolveConfiguredTargetValue({
                      measurementType: component.measurement_type,
                      targetValue: componentTarget.target_value,
                      structuredTarget: componentTarget.structured_target,
                      targetDescription: componentTarget.target_description,
                      configurationStatus:
                        componentTarget.configuration_status,
                    })
                  : null;
                const calculated = calculatedComponents.get(String(component.id));
                return {
                  id: String(component.id),
                  label: component.label,
                  measurementType: boardMeasurementType(
                    component.measurement_type,
                  ),
                  unit: component.unit,
                  result: {
                    state: calculated?.result.state ?? "missing" as const,
                    value: calculated?.result.value ?? null,
                    displayValue: formatValue(
                      calculated?.result.value ?? null,
                      component.unit,
                    ),
                    numerator: calculated?.result.numerator ?? null,
                    denominator: calculated?.result.denominator ?? null,
                    respondentCount:
                      calculated?.result.respondentCount ?? null,
                    formulaExplanation: formulaExplanation(
                      component.measurement_type,
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
                        status: componentTargetStatus(
                          componentTarget.configuration_status,
                          componentTargetValue,
                        ),
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

              return {
                id: String(kpiSummary.kpiId),
                name: kpiSummary.kpiName,
                measurementType: boardMeasurementType(
                  kpiSummary.measurementType,
                ),
                reportingFrequency: boardReportingFrequency(
                  config?.reporting_frequency,
                ),
                unit: config?.unit ?? member?.kpi.unit ?? null,
                result: {
                  state:
                    kpiSummary.currentCalculation?.state ??
                    (kpiSummary.currentValue === null ? "missing" : "ok"),
                  value: kpiSummary.currentValue,
                  displayValue: formatValue(
                    kpiSummary.currentValue,
                    config?.unit ?? member?.kpi.unit ?? null,
                  ),
                  numerator:
                    kpiSummary.currentCalculation?.numerator ?? null,
                  denominator:
                    kpiSummary.currentCalculation?.denominator ?? null,
                  respondentCount:
                    kpiSummary.currentCalculation?.respondentCount ?? null,
                  formulaExplanation: formulaExplanation(
                    kpiSummary.measurementType,
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
                  kpiSummary.kpiSlug === "revenue-by-stream"
                    ? {
                        totalRevenue:
                          kpiSummary.currentCalculation?.value ?? null,
                        streams: components.map((component) => ({
                          id: component.id,
                          label: component.label,
                          value: component.result.value,
                          sharePercentage: revenueShare(
                            component.result.value,
                            kpiSummary.currentCalculation?.value ?? null,
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

function selectComponentTarget(
  targets: StrategicGoalReadModel["members"][number]["components"][number]["targets"],
  year: number,
) {
  const annual = targets.find(
    (target) =>
      target.target_scope === "annual" && target.reporting_year === year,
  );
  if (annual) return annual;
  return [...targets]
    .filter((target) => target.target_scope === "full_plan")
    .sort((a, b) => a.target_year - b.target_year)
    .find((target) => target.target_year >= year) ?? null;
}

function componentTargetStatus(
  status: StrategicGoalReadModel["members"][number]["components"][number]["targets"][number]["configuration_status"],
  value: number | null,
): BoardProgressStatus {
  if (status === "needs_definition") return "needs_definition";
  if (status !== "ready" && status !== "active") {
    return "target_not_finalized";
  }
  return value === null ? "needs_definition" : "not_started";
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

function formatValue(value: number | null, unit: string | null): string {
  if (value === null || !Number.isFinite(value)) return "Not reported";
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
  if (unit === "%") return `${formatted}%`;
  if (unit === "USD" || unit === "$" || unit?.toLowerCase() === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }
  return unit ? `${formatted} ${unit}` : formatted;
}

function formulaExplanation(measurementType: unknown): string {
  switch (measurementType) {
    case "binary":
      return "Completion is recorded as yes or no.";
    case "milestone":
      return "Completed milestones divided by required milestones.";
    case "percentage":
      return "Numerator divided by denominator, multiplied by 100.";
    case "average":
      return "Raw score inputs are normalized against the configured maximum.";
    case "year_over_year":
      return "Current value minus previous value, divided by the absolute previous value.";
    case "ratio":
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
