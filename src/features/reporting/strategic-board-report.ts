import { escapeCell as escapeCsvCell } from "@/lib/csv";

/**
 * Serializable board-report contract.
 *
 * This module deliberately accepts already-calculated KPI and progress results.
 * It sanitizes them once for every consumer; CSV export then flattens only the
 * resulting view model and contains no business formulas of its own.
 */

export type BoardMeasurementType =
  | "binary"
  | "milestone"
  | "count"
  | "percentage"
  | "average"
  | "cumulative"
  | "year_over_year"
  | "distribution"
  | "currency"
  | "ratio"
  | "multi_component";

export type BoardReportingFrequency =
  | "monthly"
  | "quarterly"
  | "annual"
  | "cumulative"
  | "one_time"
  | "flexible";

type BoardStatus =
  | "not_reported"
  | "not_started"
  | "on_track"
  | "at_risk"
  | "off_track"
  | "complete"
  | "exceeded"
  | "not_applicable";

export type BoardConfigurationStatus =
  | "draft"
  | "needs_definition"
  | "needs_target"
  | "ready"
  | "active"
  | "archived";

type BoardCalculationState = "ok" | "missing" | "invalid";
export type BoardProgressStatus =
  | "not_reported"
  | "not_started"
  | "in_progress"
  | "on_track"
  | "at_risk"
  | "off_track"
  | "complete"
  | "exceeded"
  | "target_not_finalized"
  | "needs_definition"
  | "not_applicable";

interface GoalCompletionSummaryInput {
  completedGoalsCount?: number | null;
  totalEligibleGoalsCount?: number | null;
  completionPercentage?: number | null;
  excludedGoalsCount?: number | null;
  excludedGoalReasons?: Array<string | null | undefined> | null;
}

interface CalculatedResultInput {
  state?: BoardCalculationState | null;
  value?: number | null;
  displayValue?: string | null;
  numerator?: number | null;
  denominator?: number | null;
  respondentCount?: number | null;
  formulaExplanation?: string | null;
}

export interface TargetProgressInput {
  actualValue?: number | null;
  targetValue?: number | null;
  actualProgressPercentage?: number | null;
  status?: BoardProgressStatus | null;
  pacingTarget?: number | null;
  pacingStatus?: BoardProgressStatus | null;
  targetYear?: number | null;
  targetDescription?: string | null;
}

interface BoardComponentInput {
  id: string;
  label: string;
  measurementType: BoardMeasurementType;
  unit?: string | null;
  result: CalculatedResultInput;
  progress?: TargetProgressInput | null;
  configurationStatus?: BoardConfigurationStatus | null;
  unresolvedReasons?: Array<string | null | undefined> | null;
}

interface DemographicBandInput {
  id: string;
  label: string;
  count?: number | null;
  percentage?: number | null;
  isUnknown?: boolean | null;
  isDeclined?: boolean | null;
  derivedGroup?: "white" | "non_white" | null;
}

interface DemographicDistributionInput {
  respondentTotal?: number | null;
  mutuallyExclusive?: boolean | null;
  populationCaveat?: string | null;
  bands?: DemographicBandInput[] | null;
  derivedNonWhitePercentage?: number | null;
}

interface RevenueStreamInput {
  id: string;
  label: string;
  value?: number | null;
  sharePercentage?: number | null;
}

interface RevenueBreakdownInput {
  totalRevenue?: number | null;
  streams?: RevenueStreamInput[] | null;
}

export interface StrategicBoardKpiInput {
  id: string;
  name: string;
  measurementType: BoardMeasurementType;
  reportingFrequency: BoardReportingFrequency;
  unit?: string | null;
  result: CalculatedResultInput;
  annualProgress?: TargetProgressInput | null;
  fullPlanProgress?: TargetProgressInput | null;
  boardStatus?: BoardStatus | null;
  configurationStatus?: BoardConfigurationStatus | null;
  components?: BoardComponentInput[] | null;
  demographics?: DemographicDistributionInput | null;
  revenueBreakdown?: RevenueBreakdownInput | null;
  unresolvedReasons?: Array<string | null | undefined> | null;
}

interface StrategicBoardGoalInput {
  id: string;
  name: string;
  completionStatus?: BoardProgressStatus | null;
  actualCompletionPercentage?: number | null;
  completedKpisCount?: number | null;
  totalEligibleKpisCount?: number | null;
  excludedKpisCount?: number | null;
  excludedReasons?: Array<string | null | undefined> | null;
  kpis?: StrategicBoardKpiInput[] | null;
}

interface StrategicBoardPriorityInput {
  id: string;
  name: string;
  goalCompletion?: GoalCompletionSummaryInput | null;
  goals?: StrategicBoardGoalInput[] | null;
}

export interface StrategicBoardReportInput {
  organizationName?: string | null;
  selectedYear?: number | null;
  reportingPeriod?: string | null;
  organizationGoalCompletion?: GoalCompletionSummaryInput | null;
  priorities?: StrategicBoardPriorityInput[] | null;
}

export interface GoalCompletionSummaryViewModel {
  completedGoalsCount: number;
  totalEligibleGoalsCount: number;
  completionPercentage: number | null;
  excludedGoalsCount: number;
  excludedGoalReasons: string[];
  countLabel: string;
}

interface CalculatedResultViewModel {
  state: BoardCalculationState;
  value: number | null;
  displayValue: string;
  numerator: number | null;
  denominator: number | null;
  respondentCount: number | null;
  formulaExplanation: string | null;
}

export interface TargetProgressViewModel {
  actualValue: number | null;
  targetValue: number | null;
  hasTarget: boolean;
  actualProgressPercentage: number | null;
  displayProgressPercentage: number | null;
  isExceeded: boolean;
  status: BoardProgressStatus;
  pacingTarget: number | null;
  pacingStatus: BoardProgressStatus | null;
  targetYear: number | null;
  targetDescription: string | null;
  targetDisplayText: string;
}

export interface BoardComponentViewModel {
  id: string;
  label: string;
  measurementType: BoardMeasurementType | "unknown";
  unit: string | null;
  result: CalculatedResultViewModel;
  progress: TargetProgressViewModel | null;
  configurationStatus: BoardConfigurationStatus;
  unresolvedReasons: string[];
}

interface DemographicBandViewModel {
  id: string;
  label: string;
  count: number | null;
  percentage: number | null;
  isUnknown: boolean;
  isDeclined: boolean;
  derivedGroup: "white" | "non_white" | null;
}

export interface DemographicDistributionViewModel {
  respondentTotal: number | null;
  mutuallyExclusive: boolean;
  populationCaveat: string | null;
  bands: DemographicBandViewModel[];
  derivedNonWhitePercentage: number | null;
}

interface RevenueStreamViewModel {
  id: string;
  label: string;
  value: number | null;
  sharePercentage: number | null;
}

export interface RevenueBreakdownViewModel {
  totalRevenue: number | null;
  streams: RevenueStreamViewModel[];
}

export interface StrategicBoardKpiViewModel {
  id: string;
  name: string;
  measurementType: BoardMeasurementType | "unknown";
  reportingFrequency: BoardReportingFrequency | "unknown";
  unit: string | null;
  result: CalculatedResultViewModel;
  annualProgress: TargetProgressViewModel | null;
  fullPlanProgress: TargetProgressViewModel | null;
  boardStatus: BoardStatus;
  configurationStatus: BoardConfigurationStatus;
  components: BoardComponentViewModel[];
  demographics: DemographicDistributionViewModel | null;
  revenueBreakdown: RevenueBreakdownViewModel | null;
  unresolvedReasons: string[];
}

export interface StrategicBoardGoalViewModel {
  id: string;
  name: string;
  completionStatus: BoardProgressStatus;
  actualCompletionPercentage: number | null;
  displayCompletionPercentage: number | null;
  completedKpisCount: number;
  totalEligibleKpisCount: number;
  excludedKpisCount: number;
  excludedReasons: string[];
  kpis: StrategicBoardKpiViewModel[];
}

export interface StrategicBoardPriorityViewModel {
  id: string;
  name: string;
  goalCompletion: GoalCompletionSummaryViewModel;
  goals: StrategicBoardGoalViewModel[];
}

export interface StrategicBoardReportViewModel {
  organizationName: string;
  selectedYear: number | null;
  reportingPeriod: string;
  organizationGoalCompletion: GoalCompletionSummaryViewModel;
  priorities: StrategicBoardPriorityViewModel[];
  unresolvedReasons: string[];
}

const MEASUREMENT_TYPES = new Set<BoardMeasurementType>([
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
]);
const BOARD_STATUSES = new Set<BoardStatus>([
  "not_reported",
  "not_started",
  "on_track",
  "at_risk",
  "off_track",
  "complete",
  "exceeded",
  "not_applicable",
]);
const REPORTING_FREQUENCIES = new Set<BoardReportingFrequency>([
  "monthly",
  "quarterly",
  "annual",
  "cumulative",
  "one_time",
  "flexible",
]);
const CONFIGURATION_STATUSES = new Set<BoardConfigurationStatus>([
  "draft",
  "needs_definition",
  "needs_target",
  "ready",
  "active",
  "archived",
]);
const CALCULATION_STATES = new Set<BoardCalculationState>([
  "ok",
  "missing",
  "invalid",
]);
const PROGRESS_STATUSES = new Set<BoardProgressStatus>([
  "not_reported",
  "not_started",
  "in_progress",
  "on_track",
  "at_risk",
  "off_track",
  "complete",
  "exceeded",
  "target_not_finalized",
  "needs_definition",
  "not_applicable",
]);

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Object.is(value, -0) ? 0 : value;
}

function nonNegativeInteger(value: unknown): number {
  const finite = finiteNumber(value);
  return finite === null ? 0 : Math.max(0, Math.round(finite));
}

function nonNegativeIntegerOrNull(value: unknown): number | null {
  const finite = finiteNumber(value);
  return finite === null ? null : Math.max(0, Math.round(finite));
}

function percentage(value: unknown, capDisplay = true): number | null {
  const finite = finiteNumber(value);
  if (finite === null) return null;
  return capDisplay ? Math.max(0, Math.min(100, finite)) : finite;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function requiredText(value: unknown, fallback: string): string {
  return optionalText(value) ?? fallback;
}

function year(value: unknown): number | null {
  const finite = finiteNumber(value);
  if (finite === null || !Number.isInteger(finite) || finite < 1900 || finite > 2100) {
    return null;
  }
  return finite;
}

function cleanReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const reason = optionalText(item);
    if (reason !== null && !seen.has(reason)) {
      result.push(reason);
      seen.add(reason);
    }
  }
  return result;
}

function measurementType(value: unknown): BoardMeasurementType | "unknown" {
  return MEASUREMENT_TYPES.has(value as BoardMeasurementType)
    ? (value as BoardMeasurementType)
    : "unknown";
}

function reportingFrequency(value: unknown): BoardReportingFrequency | "unknown" {
  return REPORTING_FREQUENCIES.has(value as BoardReportingFrequency)
    ? (value as BoardReportingFrequency)
    : "unknown";
}

function boardStatus(value: unknown): BoardStatus {
  return BOARD_STATUSES.has(value as BoardStatus)
    ? (value as BoardStatus)
    : "not_reported";
}

function configurationStatus(value: unknown): BoardConfigurationStatus {
  return CONFIGURATION_STATUSES.has(value as BoardConfigurationStatus)
    ? (value as BoardConfigurationStatus)
    : "draft";
}

function calculationState(value: unknown): BoardCalculationState {
  return CALCULATION_STATES.has(value as BoardCalculationState)
    ? (value as BoardCalculationState)
    : "missing";
}

function progressStatus(value: unknown): BoardProgressStatus {
  return PROGRESS_STATUSES.has(value as BoardProgressStatus)
    ? (value as BoardProgressStatus)
    : "not_reported";
}

function sanitizeGoalSummary(
  input: GoalCompletionSummaryInput | null | undefined,
): GoalCompletionSummaryViewModel {
  const completedGoalsCount = nonNegativeInteger(input?.completedGoalsCount);
  const totalEligibleGoalsCount = nonNegativeInteger(input?.totalEligibleGoalsCount);
  return {
    completedGoalsCount,
    totalEligibleGoalsCount,
    completionPercentage: percentage(input?.completionPercentage),
    excludedGoalsCount: nonNegativeInteger(input?.excludedGoalsCount),
    excludedGoalReasons: cleanReasons(input?.excludedGoalReasons),
    countLabel: `${completedGoalsCount} of ${totalEligibleGoalsCount} goals completed`,
  };
}

function sanitizeResult(input: CalculatedResultInput | null | undefined): CalculatedResultViewModel {
  const value = finiteNumber(input?.value);
  return {
    state: calculationState(input?.state),
    value,
    displayValue:
      optionalText(input?.displayValue) ??
      (value === null ? "Not reported" : String(value)),
    numerator: finiteNumber(input?.numerator),
    denominator: finiteNumber(input?.denominator),
    respondentCount:
      input?.respondentCount === null || input?.respondentCount === undefined
        ? null
        : nonNegativeIntegerOrNull(input.respondentCount),
    formulaExplanation: optionalText(input?.formulaExplanation),
  };
}

function sanitizeProgress(
  input: TargetProgressInput | null | undefined,
  configStatus: BoardConfigurationStatus,
): TargetProgressViewModel | null {
  if (input === null || input === undefined) return null;
  const targetValue = finiteNumber(input.targetValue);
  const hasTarget = targetValue !== null;
  const actualProgressPercentage = hasTarget
    ? percentage(input.actualProgressPercentage, false)
    : null;
  const targetDescription = optionalText(input.targetDescription);
  const isExceeded = actualProgressPercentage !== null && actualProgressPercentage > 100;
  let status = progressStatus(input.status);
  if (!hasTarget) {
    status =
      configStatus === "needs_definition"
        ? "needs_definition"
        : "target_not_finalized";
  } else if (isExceeded) {
    status = "exceeded";
  }
  return {
    actualValue: finiteNumber(input.actualValue),
    targetValue,
    hasTarget,
    actualProgressPercentage,
    displayProgressPercentage: percentage(actualProgressPercentage),
    isExceeded,
    status,
    pacingTarget: finiteNumber(input.pacingTarget),
    pacingStatus:
      input.pacingStatus === null || input.pacingStatus === undefined
        ? null
        : progressStatus(input.pacingStatus),
    targetYear: year(input.targetYear),
    targetDescription,
    targetDisplayText:
      targetDescription ??
      (hasTarget ? "Target description not provided" : "Target not finalized"),
  };
}

function sanitizeComponents(value: unknown): BoardComponentViewModel[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate, index) => {
    const component = (candidate ?? {}) as Partial<BoardComponentInput>;
    const config = configurationStatus(component.configurationStatus);
    return {
      id: requiredText(component.id, `component-${index + 1}`),
      label: requiredText(component.label, `Component ${index + 1}`),
      measurementType: measurementType(component.measurementType),
      unit: optionalText(component.unit),
      result: sanitizeResult(component.result),
      progress: sanitizeProgress(component.progress, config),
      configurationStatus: config,
      unresolvedReasons: cleanReasons(component.unresolvedReasons),
    };
  });
}

function sanitizeDemographics(value: unknown): DemographicDistributionViewModel | null {
  if (value === null || value === undefined || typeof value !== "object") return null;
  const input = value as Partial<DemographicDistributionInput>;
  const bands = Array.isArray(input.bands)
    ? input.bands.map((candidate, index) => {
        const band = (candidate ?? {}) as Partial<DemographicBandInput>;
        return {
          id: requiredText(band.id, `band-${index + 1}`),
          label: requiredText(band.label, `Band ${index + 1}`),
          count:
            band.count === null || band.count === undefined
              ? null
              : nonNegativeIntegerOrNull(band.count),
          percentage: percentage(band.percentage),
          isUnknown: band.isUnknown === true,
          isDeclined: band.isDeclined === true,
          derivedGroup:
            band.derivedGroup === "white" || band.derivedGroup === "non_white"
              ? band.derivedGroup
              : null,
        };
      })
    : [];
  return {
    respondentTotal:
      input.respondentTotal === null || input.respondentTotal === undefined
        ? null
        : nonNegativeIntegerOrNull(input.respondentTotal),
    mutuallyExclusive: input.mutuallyExclusive !== false,
    populationCaveat: optionalText(input.populationCaveat),
    bands,
    derivedNonWhitePercentage:
      input.mutuallyExclusive === false
        ? null
        : percentage(input.derivedNonWhitePercentage),
  };
}

function sanitizeRevenue(value: unknown): RevenueBreakdownViewModel | null {
  if (value === null || value === undefined || typeof value !== "object") return null;
  const input = value as Partial<RevenueBreakdownInput>;
  return {
    totalRevenue: finiteNumber(input.totalRevenue),
    streams: Array.isArray(input.streams)
      ? input.streams.map((candidate, index) => {
          const stream = (candidate ?? {}) as Partial<RevenueStreamInput>;
          return {
            id: requiredText(stream.id, `revenue-${index + 1}`),
            label: requiredText(stream.label, `Revenue stream ${index + 1}`),
            value: finiteNumber(stream.value),
            sharePercentage: percentage(stream.sharePercentage),
          };
        })
      : [],
  };
}

function sanitizeKpis(value: unknown): StrategicBoardKpiViewModel[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate, index) => {
    const input = (candidate ?? {}) as Partial<StrategicBoardKpiInput>;
    const config = configurationStatus(input.configurationStatus);
    return {
      id: requiredText(input.id, `kpi-${index + 1}`),
      name: requiredText(input.name, `Measure ${index + 1}`),
      measurementType: measurementType(input.measurementType),
      reportingFrequency: reportingFrequency(input.reportingFrequency),
      unit: optionalText(input.unit),
      result: sanitizeResult(input.result),
      annualProgress: sanitizeProgress(input.annualProgress, config),
      fullPlanProgress: sanitizeProgress(input.fullPlanProgress, config),
      boardStatus: boardStatus(input.boardStatus),
      configurationStatus: config,
      components: sanitizeComponents(input.components),
      demographics: sanitizeDemographics(input.demographics),
      revenueBreakdown: sanitizeRevenue(input.revenueBreakdown),
      unresolvedReasons: cleanReasons(input.unresolvedReasons),
    };
  });
}

function sanitizeGoals(value: unknown): StrategicBoardGoalViewModel[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate, index) => {
    const input = (candidate ?? {}) as Partial<StrategicBoardGoalInput>;
    const actualCompletionPercentage = percentage(
      input.actualCompletionPercentage,
      false,
    );
    return {
      id: requiredText(input.id, `goal-${index + 1}`),
      name: requiredText(input.name, `Goal ${index + 1}`),
      completionStatus: progressStatus(input.completionStatus),
      actualCompletionPercentage,
      displayCompletionPercentage: percentage(actualCompletionPercentage),
      completedKpisCount: nonNegativeInteger(input.completedKpisCount),
      totalEligibleKpisCount: nonNegativeInteger(input.totalEligibleKpisCount),
      excludedKpisCount: nonNegativeInteger(input.excludedKpisCount),
      excludedReasons: cleanReasons(input.excludedReasons),
      kpis: sanitizeKpis(input.kpis),
    };
  });
}

function sanitizePriorities(value: unknown): StrategicBoardPriorityViewModel[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate, index) => {
    const input = (candidate ?? {}) as Partial<StrategicBoardPriorityInput>;
    return {
      id: requiredText(input.id, `priority-${index + 1}`),
      name: requiredText(input.name, `Priority ${index + 1}`),
      goalCompletion: sanitizeGoalSummary(input.goalCompletion),
      goals: sanitizeGoals(input.goals),
    };
  });
}

/** Build the sole UI/export source of truth for a board-facing report. */
export function buildStrategicBoardReport(
  input: StrategicBoardReportInput,
): StrategicBoardReportViewModel {
  const priorities = sanitizePriorities(input?.priorities);
  const unresolvedReasons = new Set<string>();
  const addReasons = (reasons: string[]) => reasons.forEach((reason) => unresolvedReasons.add(reason));
  const organizationGoalCompletion = sanitizeGoalSummary(
    input?.organizationGoalCompletion,
  );
  addReasons(organizationGoalCompletion.excludedGoalReasons);
  for (const priority of priorities) {
    addReasons(priority.goalCompletion.excludedGoalReasons);
    for (const goal of priority.goals) {
      addReasons(goal.excludedReasons);
      for (const kpi of goal.kpis) {
        addReasons(kpi.unresolvedReasons);
        for (const component of kpi.components) addReasons(component.unresolvedReasons);
      }
    }
  }
  return {
    organizationName: requiredText(input?.organizationName, "Eastern State"),
    selectedYear: year(input?.selectedYear),
    reportingPeriod: requiredText(input?.reportingPeriod, "Full year"),
    organizationGoalCompletion,
    priorities,
    unresolvedReasons: Array.from(unresolvedReasons),
  };
}

export const STRATEGIC_BOARD_CSV_COLUMNS = [
  "Selected Year",
  "Reporting Period",
  "Organization",
  "Organization Completed Goals",
  "Organization Included Goals",
  "Organization Completion Percentage",
  "Organization Goals Not Counted",
  "Organization Reasons",
  "Priority",
  "Priority Completed Goals",
  "Priority Included Goals",
  "Priority Completion Percentage",
  "Priority Goals Not Counted",
  "Priority Reasons",
  "Goal",
  "Goal Status",
  "Goal Actual Completion Percentage",
  "Goal Display Completion Percentage",
  "Goal Completed Measures",
  "Goal Included Measures",
  "Goal Measures Not Counted",
  "Goal Reasons",
  "Measure ID",
  "Measure",
  "Measurement Type",
  "Reporting Frequency",
  "Unit",
  "Result State",
  "Calculated Result",
  "Calculated Numeric Value",
  "Amount Measured",
  "Total Amount",
  "Respondent Count",
  "How Calculated",
  "Annual Actual",
  "Annual Target",
  "Annual Has Target",
  "Annual Actual Progress Percentage",
  "Annual Display Progress Percentage",
  "Annual Progress Status",
  "Annual Pacing Target",
  "Annual Pacing Status",
  "Annual Target Year",
  "Annual Target Description",
  "Annual Target Display Text",
  "Full Plan Actual",
  "Full Plan Target",
  "Full Plan Has Target",
  "Full Plan Actual Progress Percentage",
  "Full Plan Display Progress Percentage",
  "Full Plan Progress Status",
  "Full Plan Target Year",
  "Full Plan Target Description",
  "Full Plan Target Display Text",
  "Board Status",
  "Setup Status",
  "Measure Needs Attention",
  "Detail Type",
  "Detail Name",
  "Detail Measurement Type",
  "Detail Result",
  "Detail Numeric Value",
  "Detail Count",
  "Detail Percentage",
  "Detail Target",
  "Detail Actual Progress Percentage",
  "Detail Display Progress Percentage",
  "Detail Setup Status",
  "Detail Needs Attention",
  "Demographic Respondent Total",
  "Derived Non-White Percentage",
  "Demographic Population Caveat",
  "Revenue Total",
  "Revenue Stream Value",
  "Revenue Stream Share Percentage",
] as const;

type StrategicBoardCsvColumn = (typeof STRATEGIC_BOARD_CSV_COLUMNS)[number];
type StrategicBoardCsvValue = string | number | boolean | null;
export type StrategicBoardCsvRow = Record<
  StrategicBoardCsvColumn,
  StrategicBoardCsvValue
>;

type DetailRow =
  | { kind: "kpi" }
  | { kind: "component"; component: BoardComponentViewModel }
  | {
      kind: "demographic_band";
      band: DemographicBandViewModel;
      demographics: DemographicDistributionViewModel;
    }
  | {
      kind: "revenue_stream";
      stream: RevenueStreamViewModel;
      revenue: RevenueBreakdownViewModel;
    };

function progressValue(
  progress: TargetProgressViewModel | null,
  key: keyof TargetProgressViewModel,
): StrategicBoardCsvValue {
  if (progress === null) return null;
  const value = progress[key];
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
    ? value
    : null;
}

function detailsForKpi(kpi: StrategicBoardKpiViewModel): DetailRow[] {
  const details: DetailRow[] = [];
  for (const component of kpi.components) {
    details.push({ kind: "component", component });
  }
  if (kpi.demographics !== null) {
    for (const band of kpi.demographics.bands) {
      details.push({ kind: "demographic_band", band, demographics: kpi.demographics });
    }
  }
  if (kpi.revenueBreakdown !== null) {
    for (const stream of kpi.revenueBreakdown.streams) {
      details.push({ kind: "revenue_stream", stream, revenue: kpi.revenueBreakdown });
    }
  }
  return details.length > 0 ? details : [{ kind: "kpi" }];
}

/** Flatten the sanitized view model. This function performs no KPI formulas. */
export function buildStrategicBoardCsvRows(
  report: StrategicBoardReportViewModel,
): StrategicBoardCsvRow[] {
  const rows: StrategicBoardCsvRow[] = [];
  for (const priority of report.priorities) {
    for (const goal of priority.goals) {
      for (const kpi of goal.kpis) {
        for (const detail of detailsForKpi(kpi)) {
          const component = detail.kind === "component" ? detail.component : null;
          const band = detail.kind === "demographic_band" ? detail.band : null;
          const demographics =
            detail.kind === "demographic_band" ? detail.demographics : null;
          const stream = detail.kind === "revenue_stream" ? detail.stream : null;
          const revenue = detail.kind === "revenue_stream" ? detail.revenue : null;
          rows.push({
            "Selected Year": report.selectedYear,
            "Reporting Period": report.reportingPeriod,
            Organization: report.organizationName,
            "Organization Completed Goals":
              report.organizationGoalCompletion.completedGoalsCount,
            "Organization Included Goals":
              report.organizationGoalCompletion.totalEligibleGoalsCount,
            "Organization Completion Percentage":
              report.organizationGoalCompletion.completionPercentage,
            "Organization Goals Not Counted":
              report.organizationGoalCompletion.excludedGoalsCount,
            "Organization Reasons":
              report.organizationGoalCompletion.excludedGoalReasons.join("; "),
            Priority: priority.name,
            "Priority Completed Goals": priority.goalCompletion.completedGoalsCount,
            "Priority Included Goals": priority.goalCompletion.totalEligibleGoalsCount,
            "Priority Completion Percentage": priority.goalCompletion.completionPercentage,
            "Priority Goals Not Counted": priority.goalCompletion.excludedGoalsCount,
            "Priority Reasons":
              priority.goalCompletion.excludedGoalReasons.join("; "),
            Goal: goal.name,
            "Goal Status": goal.completionStatus,
            "Goal Actual Completion Percentage": goal.actualCompletionPercentage,
            "Goal Display Completion Percentage": goal.displayCompletionPercentage,
            "Goal Completed Measures": goal.completedKpisCount,
            "Goal Included Measures": goal.totalEligibleKpisCount,
            "Goal Measures Not Counted": goal.excludedKpisCount,
            "Goal Reasons": goal.excludedReasons.join("; "),
            "Measure ID": kpi.id,
            Measure: kpi.name,
            "Measurement Type": kpi.measurementType,
            "Reporting Frequency": kpi.reportingFrequency,
            Unit: kpi.unit,
            "Result State": kpi.result.state,
            "Calculated Result": kpi.result.displayValue,
            "Calculated Numeric Value": kpi.result.value,
            "Amount Measured": kpi.result.numerator,
            "Total Amount": kpi.result.denominator,
            "Respondent Count": kpi.result.respondentCount,
            "How Calculated": kpi.result.formulaExplanation,
            "Annual Actual": progressValue(kpi.annualProgress, "actualValue"),
            "Annual Target": progressValue(kpi.annualProgress, "targetValue"),
            "Annual Has Target": progressValue(kpi.annualProgress, "hasTarget"),
            "Annual Actual Progress Percentage": progressValue(
              kpi.annualProgress,
              "actualProgressPercentage",
            ),
            "Annual Display Progress Percentage": progressValue(
              kpi.annualProgress,
              "displayProgressPercentage",
            ),
            "Annual Progress Status": progressValue(kpi.annualProgress, "status"),
            "Annual Pacing Target": progressValue(
              kpi.annualProgress,
              "pacingTarget",
            ),
            "Annual Pacing Status": progressValue(
              kpi.annualProgress,
              "pacingStatus",
            ),
            "Annual Target Year": progressValue(kpi.annualProgress, "targetYear"),
            "Annual Target Description": progressValue(
              kpi.annualProgress,
              "targetDescription",
            ),
            "Annual Target Display Text": progressValue(
              kpi.annualProgress,
              "targetDisplayText",
            ),
            "Full Plan Actual": progressValue(kpi.fullPlanProgress, "actualValue"),
            "Full Plan Target": progressValue(kpi.fullPlanProgress, "targetValue"),
            "Full Plan Has Target": progressValue(kpi.fullPlanProgress, "hasTarget"),
            "Full Plan Actual Progress Percentage": progressValue(
              kpi.fullPlanProgress,
              "actualProgressPercentage",
            ),
            "Full Plan Display Progress Percentage": progressValue(
              kpi.fullPlanProgress,
              "displayProgressPercentage",
            ),
            "Full Plan Progress Status": progressValue(kpi.fullPlanProgress, "status"),
            "Full Plan Target Year": progressValue(kpi.fullPlanProgress, "targetYear"),
            "Full Plan Target Description": progressValue(
              kpi.fullPlanProgress,
              "targetDescription",
            ),
            "Full Plan Target Display Text": progressValue(
              kpi.fullPlanProgress,
              "targetDisplayText",
            ),
            "Board Status": kpi.boardStatus,
            "Setup Status": kpi.configurationStatus,
            "Measure Needs Attention": kpi.unresolvedReasons.join("; "),
            "Detail Type": detail.kind,
            "Detail Name": component?.label ?? band?.label ?? stream?.label ?? kpi.name,
            "Detail Measurement Type": component?.measurementType ?? null,
            "Detail Result": component?.result.displayValue ?? null,
            "Detail Numeric Value": component?.result.value ?? null,
            "Detail Count": band?.count ?? null,
            "Detail Percentage": band?.percentage ?? null,
            "Detail Target": component?.progress?.targetValue ?? null,
            "Detail Actual Progress Percentage":
              component?.progress?.actualProgressPercentage ?? null,
            "Detail Display Progress Percentage":
              component?.progress?.displayProgressPercentage ?? null,
            "Detail Setup Status": component?.configurationStatus ?? null,
            "Detail Needs Attention": component?.unresolvedReasons.join("; ") ?? "",
            "Demographic Respondent Total": demographics?.respondentTotal ?? null,
            "Derived Non-White Percentage": demographics?.derivedNonWhitePercentage ?? null,
            "Demographic Population Caveat": demographics?.populationCaveat ?? null,
            "Revenue Total": revenue?.totalRevenue ?? null,
            "Revenue Stream Value": stream?.value ?? null,
            "Revenue Stream Share Percentage": stream?.sharePercentage ?? null,
          });
        }
      }
    }
  }
  return rows;
}

export interface StrategicBoardCsvExport {
  columns: readonly StrategicBoardCsvColumn[];
  rows: StrategicBoardCsvRow[];
  filename: string;
}

export function buildStrategicBoardCsvExport(
  report: StrategicBoardReportViewModel,
): StrategicBoardCsvExport {
  return {
    columns: STRATEGIC_BOARD_CSV_COLUMNS,
    rows: buildStrategicBoardCsvRows(report),
    filename: `eastern-state-strategic-board-${report.selectedYear ?? "unselected"}.csv`,
  };
}

/** Serialize the same sanitized board rows used by the client download. */
export function buildStrategicBoardCsvText(
  report: StrategicBoardReportViewModel,
): { filename: string; csv: string } {
  const output = buildStrategicBoardCsvExport(report);
  const header = output.columns.map(escapeCsvCell).join(",");
  const rows = output.rows.map((row) =>
    output.columns.map((column) => escapeCsvCell(row[column])).join(","),
  );
  return { filename: output.filename, csv: [header, ...rows].join("\r\n") };
}
