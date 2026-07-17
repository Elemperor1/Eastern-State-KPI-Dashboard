/**
 * Pure strategic-plan calculation kernel.
 *
 * This module deliberately has no framework, persistence, or presentation
 * dependencies. Callers supply raw inputs and receive explicit ok, missing, or
 * invalid results. Percentages are represented on a 0-100 scale.
 */
import {
  MEASUREMENT_TYPES,
  type AggregationMethod,
  type AverageInputMethod,
  type ConfigurationStatus as DomainConfigurationStatus,
  type ComponentAggregationRole,
  type DistributionDerivedGroup,
  type GoalCompletionRule as DomainGoalCompletionRule,
  type MeasurementType,
  type ProgressState,
} from "./types";

export type { MeasurementType };
type CalculationState = "ok" | "missing" | "invalid";
type ProgressDirection = "higher" | "lower";
type ProgressStatus = ProgressState;
type ConfigurationStatus = DomainConfigurationStatus;
export type AverageMethod = AverageInputMethod;
type MultiComponentAggregation = AggregationMethod;
type GoalCompletionRuleType = DomainGoalCompletionRule;

interface CalculationIssue {
  kind: "missing" | "invalid";
  code: string;
  message: string;
  field?: string;
}

interface BaseMeasurementInput {
  measurementType: MeasurementType;
  precision?: number;
}

interface BinaryMeasurementInput extends BaseMeasurementInput {
  measurementType: "binary";
  completed?: boolean | null;
}

interface MilestoneMeasurementInput extends BaseMeasurementInput {
  measurementType: "milestone";
  completed?: boolean | null;
  completedMilestones?: number | null;
  totalMilestones?: number | null;
}

interface ScalarMeasurementInput extends BaseMeasurementInput {
  measurementType: "count" | "cumulative" | "currency";
  value?: number | null;
}

interface PercentageMeasurementInput extends BaseMeasurementInput {
  measurementType: "percentage";
  numerator?: number | null;
  denominator?: number | null;
  fixedDenominator?: number | null;
}

interface AverageMeasurementInput extends BaseMeasurementInput {
  measurementType: "average";
  method: AverageMethod;
  respondentCount?: number | null;
  totalScore?: number | null;
  totalPossibleScore?: number | null;
  maxScorePerRespondent?: number | null;
  averageScore?: number | null;
  maxScaleValue?: number | null;
  positiveResponseCount?: number | null;
  totalResponseCount?: number | null;
  allowOverMaximum?: boolean;
}

interface YearOverYearMeasurementInput extends BaseMeasurementInput {
  measurementType: "year_over_year";
  currentValue?: number | null;
  previousPeriodValue?: number | null;
}

interface DistributionCategoryInput {
  id: string;
  label: string;
  count?: number | null;
  derivedGroup?: DistributionDerivedGroup | null;
}

interface DistributionMeasurementInput extends BaseMeasurementInput {
  measurementType: "distribution";
  respondentTotal?: number | null;
  categories: DistributionCategoryInput[];
  allowNonExclusive?: boolean;
}

interface RatioMeasurementInput extends BaseMeasurementInput {
  measurementType: "ratio";
  numerator?: number | null;
  denominator?: number | null;
  fixedDenominator?: number | null;
  /** Multiplier applied to numerator / denominator. Defaults to 1. */
  scale?: number;
}

export type AtomicMeasurementInput =
  | BinaryMeasurementInput
  | MilestoneMeasurementInput
  | ScalarMeasurementInput
  | PercentageMeasurementInput
  | AverageMeasurementInput
  | YearOverYearMeasurementInput
  | DistributionMeasurementInput
  | RatioMeasurementInput;

interface MultiComponentInput {
  id: string;
  label: string;
  input: AtomicMeasurementInput;
  unit?: string;
  aggregationRole?: ComponentAggregationRole;
  weight?: number;
  required?: boolean;
  targetValue?: number | null;
  baselineValue?: number | null;
  direction?: ProgressDirection;
  configurationStatus?: ConfigurationStatus;
}

interface MultiComponentMeasurementInput extends BaseMeasurementInput {
  measurementType: "multi_component";
  aggregationMethod: MultiComponentAggregation;
  components: MultiComponentInput[];
}

export type MeasurementInput = AtomicMeasurementInput | MultiComponentMeasurementInput;

interface DistributionCategoryResult {
  id: string;
  label: string;
  count: number;
  percentage: number;
  derivedGroup: DistributionDerivedGroup | null;
}

interface DistributionResult {
  respondentTotal: number;
  categoryTotal: number;
  unallocatedCount: number;
  allowNonExclusive: boolean;
  categories: DistributionCategoryResult[];
  derivedNonWhitePercentage: number | null;
}

interface MultiComponentResult {
  id: string;
  label: string;
  unit: string;
  aggregationRole: ComponentAggregationRole;
  weight: number;
  required: boolean;
  result: MeasurementResult;
  progress: ProgressResult | null;
}

export interface MeasurementResult {
  state: CalculationState;
  measurementType: MeasurementType | null;
  /** Raw-input formula used for normalized average measurements. */
  averageMethod?: AverageMethod;
  /** Explicit compatibility provenance when a value was retained, not recalculated. */
  calculationProvenance?:
    | "legacy_direct_percentage"
    | "legacy_direct_value";
  value: number | null;
  normalizedPercentage: number | null;
  numerator: number | null;
  denominator: number | null;
  respondentCount: number | null;
  precision: number;
  issues: CalculationIssue[];
  distribution?: DistributionResult;
  components?: MultiComponentResult[];
  aggregationMethod?: MultiComponentAggregation;
}

export interface ProgressInput {
  currentValue?: number | null;
  targetValue?: number | null;
  baselineValue?: number | null;
  direction?: ProgressDirection;
  precision?: number;
  configurationStatus?: ConfigurationStatus;
}

export interface ConfiguredTargetValueInput {
  measurementType?: MeasurementType | null;
  targetValue?: number | null;
  structuredTarget?: Record<string, unknown> | null;
  targetDescription?: string | null;
  configurationStatus?: ConfigurationStatus;
}

export interface ProgressResult {
  state: CalculationState;
  status: ProgressStatus;
  currentValue: number | null;
  targetValue: number | null;
  baselineValue: number | null;
  actualProgressPercentage: number | null;
  displayProgressPercentage: number | null;
  isComplete: boolean;
  isExceeded: boolean;
  issues: CalculationIssue[];
}

/**
 * Resolve only documented calculable target forms. Draft or unresolved target
 * records never influence progress, while a numeric zero remains a real value.
 */
export function resolveConfiguredTargetValue(
  input: ConfiguredTargetValueInput,
): number | null {
  if (
    input.configurationStatus !== undefined &&
    input.configurationStatus !== "ready" &&
    input.configurationStatus !== "active"
  ) {
    return null;
  }
  if (
    input.targetValue !== null &&
    input.targetValue !== undefined &&
    Number.isFinite(input.targetValue)
  ) {
    return input.targetValue;
  }
  const structuredValue = input.structuredTarget?.value;
  if (typeof structuredValue === "number" && Number.isFinite(structuredValue)) {
    return structuredValue;
  }
  if (input.measurementType === "binary") {
    const completed = input.structuredTarget?.completed;
    if (typeof completed === "boolean") return completed ? 1 : 0;
    if (input.targetDescription !== null && input.targetDescription !== undefined) {
      return 1;
    }
  }
  return null;
}

export interface AnnualAndPlanProgressInput {
  annualActual?: number | null;
  annualTarget?: number | null;
  annualTargetToDate?: number | null;
  elapsedFraction?: number;
  annualBaseline?: number | null;
  cumulativeActual?: number | null;
  fullPlanTarget?: number | null;
  fullPlanBaseline?: number | null;
  direction?: ProgressDirection;
  precision?: number;
  configurationStatus?: ConfigurationStatus;
  /** Optional target-scope status when annual and full-plan targets differ. */
  annualConfigurationStatus?: ConfigurationStatus;
  /** Optional target-scope status when annual and full-plan targets differ. */
  fullPlanConfigurationStatus?: ConfigurationStatus;
}

export interface AnnualAndPlanProgressResult {
  state: CalculationState;
  pacingTarget: number | null;
  annualPacing: ProgressResult;
  annualCompletion: ProgressResult;
  fullPlanProgress: ProgressResult;
  issues: CalculationIssue[];
}

export interface GoalKpiInput {
  id: string;
  label?: string;
  role?: "required" | "informational";
  configurationStatus?: ConfigurationStatus;
  progress?: ProgressResult | number | null;
  weight?: number;
}

export type GoalCompletionRule =
  | { type: "all_required_kpis" }
  | { type: "weighted_average"; completionThresholdPercentage?: number }
  | {
      type: "threshold_count";
      thresholdCount?: number;
      thresholdPercentage?: number;
    }
  | { type: "manual_status"; complete?: boolean | null };

export type GoalKpiExclusionReason =
  | "informational"
  | "draft"
  | "archived"
  | "needs_definition"
  | "needs_target"
  | "missing_progress"
  | "invalid_progress";

interface ExcludedGoalKpi {
  id: string;
  label?: string;
  reason: GoalKpiExclusionReason;
}

export interface GoalCompletionInput {
  goalId: string;
  rule: GoalCompletionRule;
  kpis: GoalKpiInput[];
  precision?: number;
}

export interface GoalCompletionResult {
  goalId: string;
  rule: GoalCompletionRuleType;
  state: CalculationState;
  eligible: boolean;
  complete: boolean;
  completionPercentage: number | null;
  completedKpisCount: number;
  totalEligibleKpisCount: number;
  excludedKpisCount: number;
  excludedKpis: ExcludedGoalKpi[];
  exclusionReasons: string[];
  issues: CalculationIssue[];
}

export interface GoalRollupInput {
  goalId: string;
  priorityId: string;
  priorityName?: string;
  result: GoalCompletionResult;
}

interface ExcludedGoalReason {
  goalId: string;
  reasons: string[];
}

export interface GoalRollupSummary {
  completedGoalsCount: number;
  totalEligibleGoalsCount: number;
  completionPercentage: number | null;
  excludedGoalsCount: number;
  excludedGoalReasons: ExcludedGoalReason[];
}

interface PriorityGoalRollup extends GoalRollupSummary {
  priorityId: string;
  priorityName?: string;
}

export interface StrategyRollups {
  priorities: PriorityGoalRollup[];
  organization: GoalRollupSummary;
}

const DEFAULT_PRECISION = 2;
const MAX_PRECISION = 10;

export function isMeasurementType(value: unknown): value is MeasurementType {
  return typeof value === "string" && (MEASUREMENT_TYPES as readonly string[]).includes(value);
}

/** Return a rounded finite number, or null for unsafe input/precision. */
export function roundFinite(
  value: number,
  precision: number = DEFAULT_PRECISION,
): number | null {
  if (!Number.isFinite(value) || !isValidPrecision(precision)) return null;
  const factor = 10 ** precision;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function calculateMeasurement(
  input: MeasurementInput | Record<string, unknown>,
): MeasurementResult {
  const measurementType = input.measurementType;
  if (!isMeasurementType(measurementType)) {
    return result({
      state: "invalid",
      measurementType: null,
      issues: [invalid("UNSUPPORTED_MEASUREMENT_TYPE", "Measurement type is not supported.", "measurementType")],
    });
  }

  const precisionResult = resolvePrecision(input.precision);
  if (precisionResult.issue) {
    return result({
      state: "invalid",
      measurementType,
      precision: DEFAULT_PRECISION,
      issues: [precisionResult.issue],
    });
  }
  const precision = precisionResult.precision;

  switch (measurementType) {
    case "binary":
      return calculateBinary(input as unknown as BinaryMeasurementInput, precision);
    case "milestone":
      return calculateMilestone(input as unknown as MilestoneMeasurementInput, precision);
    case "count":
    case "cumulative":
    case "currency":
      return calculateScalar(input as unknown as ScalarMeasurementInput, precision);
    case "percentage":
      return calculatePercentage(input as unknown as PercentageMeasurementInput, precision);
    case "average":
      return calculateAverage(input as unknown as AverageMeasurementInput, precision);
    case "year_over_year":
      return calculateYearOverYear(input as unknown as YearOverYearMeasurementInput, precision);
    case "distribution":
      return calculateDistribution(input as unknown as DistributionMeasurementInput, precision);
    case "ratio":
      return calculateRatio(input as unknown as RatioMeasurementInput, precision);
    case "multi_component":
      return calculateMultiComponent(input as unknown as MultiComponentMeasurementInput, precision);
  }
}

export function calculateProgress(input: ProgressInput): ProgressResult {
  const precisionResult = resolvePrecision(input.precision);
  if (precisionResult.issue) {
    return progressResult({
      state: "invalid",
      status: "needs_definition",
      currentValue: finiteOrNull(input.currentValue),
      targetValue: finiteOrNull(input.targetValue),
      baselineValue: finiteOrNull(input.baselineValue),
      issues: [precisionResult.issue],
    });
  }
  const precision = precisionResult.precision;

  if (input.configurationStatus === "needs_definition") {
    return progressResult({
      state: "missing",
      status: "needs_definition",
      currentValue: finiteOrNull(input.currentValue),
      targetValue: finiteOrNull(input.targetValue),
      baselineValue: finiteOrNull(input.baselineValue),
      issues: [missing("NEEDS_DEFINITION", "The measurement definition is unresolved.", "configurationStatus")],
    });
  }
  if (input.configurationStatus === "needs_target") {
    return progressResult({
      state: "missing",
      status: "target_not_finalized",
      currentValue: finiteOrNull(input.currentValue),
      targetValue: finiteOrNull(input.targetValue),
      baselineValue: finiteOrNull(input.baselineValue),
      issues: [missing("TARGET_NOT_FINALIZED", "The target is not finalized.", "configurationStatus")],
    });
  }

  const currentCheck = readFinite(input.currentValue, "currentValue");
  const targetCheck = readFinite(input.targetValue, "targetValue");
  const baselineCheck = readOptionalFinite(input.baselineValue, "baselineValue");
  const checks = [currentCheck, targetCheck, baselineCheck];
  const invalidIssue = checks.find((check) => check.issue?.kind === "invalid")?.issue;
  if (invalidIssue) {
    return progressResult({
      state: "invalid",
      status: "needs_definition",
      currentValue: currentCheck.value,
      targetValue: targetCheck.value,
      baselineValue: baselineCheck.value,
      issues: [invalidIssue],
    });
  }
  if (targetCheck.issue) {
    return progressResult({
      state: "missing",
      status: "target_not_finalized",
      currentValue: currentCheck.value,
      targetValue: null,
      baselineValue: baselineCheck.value,
      issues: [missing("TARGET_NOT_FINALIZED", "A target value is required.", "targetValue")],
    });
  }
  if (currentCheck.issue) {
    return progressResult({
      state: "missing",
      status: "not_started",
      currentValue: null,
      targetValue: targetCheck.value,
      baselineValue: baselineCheck.value,
      issues: [missing("MISSING_ACTUAL", "A current value is required.", "currentValue")],
    });
  }

  const current = currentCheck.value as number;
  const target = targetCheck.value as number;
  const baseline = baselineCheck.value;
  const direction = input.direction ?? "higher";
  let rawProgress: number;

  if (direction === "lower") {
    if (baseline === null) {
      return progressResult({
        state: "invalid",
        status: "needs_definition",
        currentValue: current,
        targetValue: target,
        baselineValue: null,
        issues: [invalid("BASELINE_REQUIRED", "Lower-is-better progress requires a baseline.", "baselineValue")],
      });
    }
    const range = baseline - target;
    if (range < 0) {
      return progressResult({
        state: "invalid",
        status: "needs_definition",
        currentValue: current,
        targetValue: target,
        baselineValue: baseline,
        issues: [invalid("INVALID_TARGET_RANGE", "A lower-is-better target must not exceed its baseline.", "targetValue")],
      });
    }
    rawProgress = range === 0
      ? current <= target ? 100 : 0
      : ((baseline - current) / range) * 100;
  } else if (baseline !== null) {
    const range = target - baseline;
    if (range < 0) {
      return progressResult({
        state: "invalid",
        status: "needs_definition",
        currentValue: current,
        targetValue: target,
        baselineValue: baseline,
        issues: [invalid("INVALID_TARGET_RANGE", "A higher-is-better target must not be below its baseline.", "targetValue")],
      });
    }
    rawProgress = range === 0
      ? current >= target ? 100 : 0
      : ((current - baseline) / range) * 100;
  } else if (target === 0) {
    rawProgress = current >= target ? 100 : 0;
  } else if (target < 0) {
    return progressResult({
      state: "invalid",
      status: "needs_definition",
      currentValue: current,
      targetValue: target,
      baselineValue: null,
      issues: [invalid("INVALID_TARGET_RANGE", "A negative target requires an explicit baseline.", "targetValue")],
    });
  } else {
    rawProgress = (current / target) * 100;
  }

  const actualProgressPercentage = roundFinite(rawProgress, precision);
  if (actualProgressPercentage === null) {
    return progressResult({
      state: "invalid",
      status: "needs_definition",
      currentValue: current,
      targetValue: target,
      baselineValue: baseline,
      issues: [invalid("NON_FINITE_RESULT", "Progress produced a non-finite result.")],
    });
  }

  const isComplete = direction === "lower" ? current <= target : current >= target;
  const isExceeded = direction === "lower" ? current < target : current > target;
  const displayProgressPercentage = roundFinite(
    Math.max(0, Math.min(100, actualProgressPercentage)),
    precision,
  );
  const status: ProgressStatus = isExceeded
    ? "exceeded"
    : isComplete
      ? "complete"
      : actualProgressPercentage <= 0
        ? "not_started"
        : "in_progress";

  return progressResult({
    state: "ok",
    status,
    currentValue: current,
    targetValue: target,
    baselineValue: baseline,
    actualProgressPercentage,
    displayProgressPercentage,
    isComplete,
    isExceeded,
  });
}

export function calculateAnnualAndPlanProgress(
  input: AnnualAndPlanProgressInput,
): AnnualAndPlanProgressResult {
  const precisionResult = resolvePrecision(input.precision);
  if (precisionResult.issue) {
    const invalidProgress = calculateProgress({
      currentValue: Number.NaN,
      targetValue: Number.NaN,
      precision: input.precision,
    });
    return {
      state: "invalid",
      pacingTarget: null,
      annualPacing: invalidProgress,
      annualCompletion: invalidProgress,
      fullPlanProgress: invalidProgress,
      issues: [precisionResult.issue],
    };
  }
  const precision = precisionResult.precision;
  const elapsedFraction = input.elapsedFraction ?? 1;
  if (!Number.isFinite(elapsedFraction) || elapsedFraction < 0 || elapsedFraction > 1) {
    const issue = invalid("INVALID_ELAPSED_FRACTION", "Elapsed fraction must be between 0 and 1.", "elapsedFraction");
    const invalidProgress = progressResult({
      state: "invalid",
      status: "needs_definition",
      issues: [issue],
    });
    return {
      state: "invalid",
      pacingTarget: null,
      annualPacing: invalidProgress,
      annualCompletion: invalidProgress,
      fullPlanProgress: invalidProgress,
      issues: [issue],
    };
  }

  const annualTargetCheck = readOptionalFinite(input.annualTarget, "annualTarget");
  const targetToDateCheck = readOptionalFinite(input.annualTargetToDate, "annualTargetToDate");
  let pacingTarget: number | null = null;
  if (targetToDateCheck.issue?.kind === "invalid" || annualTargetCheck.issue?.kind === "invalid") {
    const issue = targetToDateCheck.issue ?? annualTargetCheck.issue as CalculationIssue;
    const invalidProgress = progressResult({
      state: "invalid",
      status: "needs_definition",
      issues: [issue],
    });
    return {
      state: "invalid",
      pacingTarget: null,
      annualPacing: invalidProgress,
      annualCompletion: invalidProgress,
      fullPlanProgress: invalidProgress,
      issues: [issue],
    };
  }
  if (targetToDateCheck.value !== null) {
    pacingTarget = targetToDateCheck.value;
  } else if (annualTargetCheck.value !== null) {
    pacingTarget = roundFinite(annualTargetCheck.value * elapsedFraction, precision);
  }

  const shared = {
    direction: input.direction,
    precision,
  };
  const annualPacing = calculateProgress({
    ...shared,
    configurationStatus:
      input.annualConfigurationStatus ?? input.configurationStatus,
    currentValue: input.annualActual,
    targetValue: pacingTarget,
    baselineValue: prorateBaseline(input.annualBaseline, elapsedFraction, precision),
  });
  const annualCompletion = calculateProgress({
    ...shared,
    configurationStatus:
      input.annualConfigurationStatus ?? input.configurationStatus,
    currentValue: input.annualActual,
    targetValue: input.annualTarget,
    baselineValue: input.annualBaseline,
  });
  const fullPlanProgress = calculateProgress({
    ...shared,
    configurationStatus:
      input.fullPlanConfigurationStatus ?? input.configurationStatus,
    currentValue: input.cumulativeActual,
    targetValue: input.fullPlanTarget,
    baselineValue: input.fullPlanBaseline,
  });
  const all = [annualPacing, annualCompletion, fullPlanProgress];
  return {
    state: combineStates(all.map((item) => item.state)),
    pacingTarget,
    annualPacing,
    annualCompletion,
    fullPlanProgress,
    issues: all.flatMap((item) => item.issues),
  };
}

export function calculateGoalCompletion(
  input: GoalCompletionInput,
): GoalCompletionResult {
  const precisionResult = resolvePrecision(input.precision);
  if (precisionResult.issue) {
    return goalResult(input, {
      state: "invalid",
      eligible: false,
      issues: [precisionResult.issue],
      exclusionReasons: [precisionResult.issue.code],
    });
  }
  const precision = precisionResult.precision;
  const excludedKpis: ExcludedGoalKpi[] = [];
  const eligible: Array<{
    kpi: GoalKpiInput;
    progress: number;
    complete: boolean;
    weight: number;
  }> = [];
  const invalidIssues: CalculationIssue[] = [];

  for (const kpi of input.kpis) {
    if (kpi.role === "informational") {
      excludedKpis.push({ id: kpi.id, label: kpi.label, reason: "informational" });
      continue;
    }
    if (kpi.configurationStatus === "draft") {
      excludedKpis.push({ id: kpi.id, label: kpi.label, reason: "draft" });
      continue;
    }
    if (kpi.configurationStatus === "archived") {
      excludedKpis.push({ id: kpi.id, label: kpi.label, reason: "archived" });
      continue;
    }
    if (kpi.configurationStatus === "needs_definition") {
      excludedKpis.push({ id: kpi.id, label: kpi.label, reason: "needs_definition" });
      continue;
    }
    if (kpi.configurationStatus === "needs_target") {
      excludedKpis.push({ id: kpi.id, label: kpi.label, reason: "needs_target" });
      continue;
    }

    const normalized = normalizeGoalKpiProgress(kpi.progress);
    if (normalized.state === "invalid") {
      excludedKpis.push({ id: kpi.id, label: kpi.label, reason: "invalid_progress" });
      invalidIssues.push(...normalized.issues);
      continue;
    }
    if (normalized.state === "missing" || normalized.progress === null) {
      const reason = normalized.status === "needs_definition"
        ? "needs_definition"
        : normalized.status === "target_not_finalized"
          ? "needs_target"
          : "missing_progress";
      excludedKpis.push({ id: kpi.id, label: kpi.label, reason });
      continue;
    }

    const weight = kpi.weight ?? 1;
    if (!Number.isFinite(weight) || weight < 0) {
      invalidIssues.push(invalid("INVALID_WEIGHT", `Weight for KPI ${kpi.id} must be non-negative.`, "weight"));
      excludedKpis.push({ id: kpi.id, label: kpi.label, reason: "invalid_progress" });
      continue;
    }
    eligible.push({
      kpi,
      progress: normalized.progress,
      complete: normalized.complete,
      weight,
    });
  }

  if (invalidIssues.length > 0) {
    return goalResult(input, {
      state: "invalid",
      eligible: false,
      excludedKpis,
      issues: invalidIssues,
      exclusionReasons: unique(excludedKpis.map((item) => item.reason)),
    });
  }

  if (input.rule.type === "manual_status") {
    if (typeof input.rule.complete !== "boolean") {
      const issue = missing("MANUAL_STATUS_REQUIRED", "Manual goal status has not been set.", "rule.complete");
      return goalResult(input, {
        state: "missing",
        eligible: false,
        excludedKpis,
        issues: [issue],
        exclusionReasons: [issue.code],
      });
    }
    return goalResult(input, {
      state: "ok",
      eligible: true,
      complete: input.rule.complete,
      completionPercentage: input.rule.complete ? 100 : 0,
      completedKpisCount: eligible.filter((item) => item.complete).length,
      totalEligibleKpisCount: eligible.length,
      excludedKpis,
    });
  }

  if (eligible.length === 0) {
    const issue = missing("NO_ELIGIBLE_KPIS", "No required configured KPIs are eligible for this goal.", "kpis");
    return goalResult(input, {
      state: "missing",
      eligible: false,
      excludedKpis,
      issues: [issue],
      exclusionReasons: unique([
        issue.code,
        ...excludedKpis
          .filter((item) => item.reason !== "informational")
          .map((item) => item.reason),
      ]),
    });
  }

  const completedKpisCount = eligible.filter((item) => item.complete).length;
  let complete = false;
  let completionPercentage: number | null = null;
  const issues: CalculationIssue[] = [];

  if (input.rule.type === "all_required_kpis") {
    complete = completedKpisCount === eligible.length;
    completionPercentage = roundedAverage(eligible.map((item) => item.progress), precision);
  } else if (input.rule.type === "weighted_average") {
    const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
    const threshold = input.rule.completionThresholdPercentage ?? 100;
    if (totalWeight <= 0) {
      issues.push(invalid("ZERO_WEIGHT_TOTAL", "Weighted-average goals require a positive total weight.", "kpis"));
    }
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      issues.push(invalid("INVALID_COMPLETION_THRESHOLD", "Completion threshold must be between 0 and 100.", "rule.completionThresholdPercentage"));
    }
    if (issues.length === 0) {
      completionPercentage = roundFinite(
        eligible.reduce((sum, item) => sum + item.progress * item.weight, 0) / totalWeight,
        precision,
      );
      completionPercentage = completionPercentage === null
        ? null
        : Math.max(0, Math.min(100, completionPercentage));
      complete = (completionPercentage ?? 0) >= threshold;
    }
  } else if (input.rule.type === "threshold_count") {
    const threshold = resolveThresholdCount(input.rule, eligible.length);
    if (threshold.issue) {
      issues.push(threshold.issue);
    } else {
      complete = completedKpisCount >= threshold.count;
      completionPercentage = roundFinite((completedKpisCount / eligible.length) * 100, precision);
    }
  }

  if (issues.length > 0) {
    return goalResult(input, {
      state: "invalid",
      eligible: false,
      completedKpisCount,
      totalEligibleKpisCount: eligible.length,
      excludedKpis,
      issues,
      exclusionReasons: issues.map((issue) => issue.code),
    });
  }

  return goalResult(input, {
    state: "ok",
    eligible: true,
    complete,
    completionPercentage,
    completedKpisCount,
    totalEligibleKpisCount: eligible.length,
    excludedKpis,
  });
}

export function rollupGoalCompletions(
  goals: Array<Pick<GoalRollupInput, "goalId" | "result">>,
  precision: number = DEFAULT_PRECISION,
): GoalRollupSummary {
  const eligible = goals.filter((goal) => goal.result.state === "ok" && goal.result.eligible);
  const completedGoalsCount = eligible.filter((goal) => goal.result.complete).length;
  const excluded = goals.filter((goal) => !goal.result.eligible || goal.result.state !== "ok");
  return {
    completedGoalsCount,
    totalEligibleGoalsCount: eligible.length,
    completionPercentage: eligible.length === 0
      ? null
      : roundFinite((completedGoalsCount / eligible.length) * 100, precision),
    excludedGoalsCount: excluded.length,
    excludedGoalReasons: excluded.map((goal) => ({
      goalId: goal.goalId,
      reasons: goal.result.exclusionReasons.length > 0
        ? goal.result.exclusionReasons
        : goal.result.issues.map((issue) => issue.code),
    })),
  };
}

export function calculateStrategyRollups(
  goals: GoalRollupInput[],
  precision: number = DEFAULT_PRECISION,
): StrategyRollups {
  const priorityMap = new Map<string, GoalRollupInput[]>();
  for (const goal of goals) {
    const group = priorityMap.get(goal.priorityId) ?? [];
    group.push(goal);
    priorityMap.set(goal.priorityId, group);
  }

  const priorities = Array.from(priorityMap, ([priorityId, priorityGoals]) => ({
    priorityId,
    priorityName: priorityGoals[0]?.priorityName,
    ...rollupGoalCompletions(priorityGoals, precision),
  }));
  return {
    priorities,
    organization: rollupGoalCompletions(goals, precision),
  };
}

function calculateBinary(input: BinaryMeasurementInput, precision: number): MeasurementResult {
  if (input.completed === null || input.completed === undefined) {
    return result({
      state: "missing",
      measurementType: input.measurementType,
      precision,
      issues: [missing("MISSING_BOOLEAN", "Binary completion is required.", "completed")],
    });
  }
  if (typeof input.completed !== "boolean") {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      issues: [invalid("INVALID_BOOLEAN", "Binary completion must be true or false.", "completed")],
    });
  }
  return result({
    state: "ok",
    measurementType: input.measurementType,
    precision,
    value: input.completed ? 1 : 0,
    normalizedPercentage: input.completed ? 100 : 0,
  });
}

function calculateMilestone(input: MilestoneMeasurementInput, precision: number): MeasurementResult {
  const hasBoolean = input.completed !== null && input.completed !== undefined;
  const hasCounts =
    input.completedMilestones !== null && input.completedMilestones !== undefined ||
    input.totalMilestones !== null && input.totalMilestones !== undefined;
  if (hasBoolean && hasCounts) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      issues: [invalid("AMBIGUOUS_MILESTONE_INPUT", "Use either boolean completion or milestone counts, not both.")],
    });
  }
  if (hasBoolean) {
    if (typeof input.completed !== "boolean") {
      return result({
        state: "invalid",
        measurementType: input.measurementType,
        precision,
        issues: [invalid("INVALID_BOOLEAN", "Milestone completion must be true or false.", "completed")],
      });
    }
    return result({
      state: "ok",
      measurementType: input.measurementType,
      precision,
      value: input.completed ? 1 : 0,
      normalizedPercentage: input.completed ? 100 : 0,
    });
  }

  const completed = readFinite(input.completedMilestones, "completedMilestones");
  const total = readFinite(input.totalMilestones, "totalMilestones");
  const issueState = stateFromChecks([completed, total]);
  if (issueState !== "ok") {
    return result({
      state: issueState,
      measurementType: input.measurementType,
      precision,
      issues: [completed.issue, total.issue].filter(isIssue),
    });
  }
  if ((completed.value as number) < 0 || (total.value as number) <= 0) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      issues: [invalid("INVALID_MILESTONE_COUNTS", "Milestone counts require completed >= 0 and total > 0.")],
    });
  }
  if ((completed.value as number) > (total.value as number)) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      issues: [invalid("COMPLETED_EXCEEDS_TOTAL", "Completed milestones cannot exceed total milestones.", "completedMilestones")],
    });
  }
  const percentage = safePercentage(completed.value as number, total.value as number, precision);
  return result({
    state: "ok",
    measurementType: input.measurementType,
    precision,
    value: completed.value,
    normalizedPercentage: percentage,
    numerator: completed.value,
    denominator: total.value,
  });
}

function calculateScalar(input: ScalarMeasurementInput, precision: number): MeasurementResult {
  const value = readFinite(input.value, "value");
  if (value.issue) {
    return result({
      state: value.issue.kind,
      measurementType: input.measurementType,
      precision,
      issues: [value.issue],
    });
  }
  return result({
    state: "ok",
    measurementType: input.measurementType,
    precision,
    value: roundFinite(value.value as number, precision),
  });
}

function calculatePercentage(input: PercentageMeasurementInput, precision: number): MeasurementResult {
  const fraction = calculateFractionInputs(input, precision, 100);
  return result({
    ...fraction,
    measurementType: input.measurementType,
    precision,
    normalizedPercentage: fraction.state === "ok" ? fraction.value : null,
  });
}

function calculateRatio(input: RatioMeasurementInput, precision: number): MeasurementResult {
  const scale = input.scale ?? 1;
  if (!Number.isFinite(scale)) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      issues: [invalid("INVALID_SCALE", "Ratio scale must be finite.", "scale")],
    });
  }
  const fraction = calculateFractionInputs(input, precision, scale);
  return result({
    ...fraction,
    measurementType: input.measurementType,
    precision,
    normalizedPercentage: fraction.state === "ok" && scale === 100 ? fraction.value : null,
  });
}

function calculateAverage(input: AverageMeasurementInput, precision: number): MeasurementResult {
  const averageResult = (overrides: Partial<MeasurementResult>) => result({
    ...overrides,
    averageMethod: input.method,
  });
  const respondentCheck = readOptionalFinite(input.respondentCount, "respondentCount");
  if (respondentCheck.issue?.kind === "invalid" || (respondentCheck.value !== null && respondentCheck.value < 0)) {
    return averageResult({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      issues: [respondentCheck.issue ?? invalid("INVALID_RESPONDENT_COUNT", "Respondent count cannot be negative.", "respondentCount")],
    });
  }

  let numerator: NumericCheck;
  let denominator: NumericCheck;
  if (input.method === "total_score") {
    numerator = readFinite(input.totalScore, "totalScore");
    const explicitPossible = readOptionalFinite(input.totalPossibleScore, "totalPossibleScore");
    const maxPerRespondent = readOptionalFinite(input.maxScorePerRespondent, "maxScorePerRespondent");
    if (explicitPossible.issue?.kind === "invalid" || maxPerRespondent.issue?.kind === "invalid") {
      return averageResult({
        state: "invalid",
        measurementType: input.measurementType,
        precision,
        issues: [explicitPossible.issue, maxPerRespondent.issue].filter(isIssue),
      });
    }
    if (explicitPossible.value !== null) {
      denominator = { value: explicitPossible.value, issue: null };
    } else if (respondentCheck.value !== null && maxPerRespondent.value !== null) {
      denominator = {
        value: respondentCheck.value * maxPerRespondent.value,
        issue: null,
      };
    } else {
      denominator = {
        value: null,
        issue: missing("MISSING_TOTAL_POSSIBLE_SCORE", "Provide total possible score or respondent count and maximum score.", "totalPossibleScore"),
      };
    }
  } else if (input.method === "average_score") {
    numerator = readFinite(input.averageScore, "averageScore");
    const maximum = input.maxScaleValue ?? input.maxScorePerRespondent;
    denominator = readFinite(maximum, "maxScaleValue");
  } else if (input.method === "percent_positive") {
    numerator = readFinite(input.positiveResponseCount, "positiveResponseCount");
    denominator = readFinite(input.totalResponseCount, "totalResponseCount");
  } else {
    return averageResult({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      issues: [invalid("INVALID_AVERAGE_METHOD", "Average method is not supported.", "method")],
    });
  }

  const issueState = stateFromChecks([numerator, denominator]);
  if (issueState !== "ok") {
    return averageResult({
      state: issueState,
      measurementType: input.measurementType,
      precision,
      respondentCount: respondentCheck.value,
      issues: [numerator.issue, denominator.issue].filter(isIssue),
    });
  }
  const numeratorValue = numerator.value as number;
  const denominatorValue = denominator.value as number;
  if (denominatorValue <= 0) {
    return averageResult({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      respondentCount: respondentCheck.value,
      issues: [invalid("ZERO_DENOMINATOR", "Average denominator must be greater than zero.")],
    });
  }
  if (numeratorValue < 0) {
    return averageResult({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      respondentCount: respondentCheck.value,
      issues: [invalid("NEGATIVE_SCORE", "Average inputs cannot be negative.")],
    });
  }
  if (!input.allowOverMaximum && numeratorValue > denominatorValue) {
    return averageResult({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      respondentCount: respondentCheck.value,
      numerator: numeratorValue,
      denominator: denominatorValue,
      issues: [invalid("SCORE_EXCEEDS_MAXIMUM", "Score cannot exceed the possible maximum.")],
    });
  }
  const value = safePercentage(numeratorValue, denominatorValue, precision);
  return averageResult({
    state: "ok",
    measurementType: input.measurementType,
    precision,
    value,
    normalizedPercentage: value,
    numerator: numeratorValue,
    denominator: denominatorValue,
    respondentCount: respondentCheck.value ?? (input.method === "percent_positive" ? denominatorValue : null),
  });
}

function calculateYearOverYear(input: YearOverYearMeasurementInput, precision: number): MeasurementResult {
  const current = readFinite(input.currentValue, "currentValue");
  const previous = readFinite(input.previousPeriodValue, "previousPeriodValue");
  const issueState = stateFromChecks([current, previous]);
  if (issueState !== "ok") {
    return result({
      state: issueState,
      measurementType: input.measurementType,
      precision,
      issues: [current.issue, previous.issue].filter(isIssue),
    });
  }
  if (previous.value === 0) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      numerator: (current.value as number) - (previous.value as number),
      denominator: previous.value,
      issues: [invalid("ZERO_PREVIOUS_PERIOD", "Year-over-year change is undefined when the previous value is zero.", "previousPeriodValue")],
    });
  }
  const delta = (current.value as number) - (previous.value as number);
  return result({
    state: "ok",
    measurementType: input.measurementType,
    precision,
    value: roundFinite((delta / Math.abs(previous.value as number)) * 100, precision),
    numerator: delta,
    denominator: previous.value,
  });
}

function calculateDistribution(
  input: DistributionMeasurementInput,
  precision: number,
): MeasurementResult {
  const total = readFinite(input.respondentTotal, "respondentTotal");
  if (total.issue) {
    return result({
      state: total.issue.kind,
      measurementType: input.measurementType,
      precision,
      issues: [total.issue],
    });
  }
  if ((total.value as number) <= 0) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      respondentCount: total.value,
      issues: [invalid("ZERO_RESPONDENT_TOTAL", "Respondent total must be greater than zero.", "respondentTotal")],
    });
  }
  if (!Array.isArray(input.categories) || input.categories.length === 0) {
    return result({
      state: "missing",
      measurementType: input.measurementType,
      precision,
      respondentCount: total.value,
      issues: [missing("MISSING_DISTRIBUTION_CATEGORIES", "At least one distribution category is required.", "categories")],
    });
  }

  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  const categoryResults: DistributionCategoryResult[] = [];
  const issues: CalculationIssue[] = [];
  for (const category of input.categories) {
    const id = category.id?.trim();
    const label = category.label?.trim();
    if (!id || !label) {
      issues.push(invalid("INVALID_DISTRIBUTION_CATEGORY", "Distribution categories require an id and label.", "categories"));
      continue;
    }
    if (seenIds.has(id) || seenLabels.has(label.toLocaleLowerCase())) {
      issues.push(invalid("DUPLICATE_DISTRIBUTION_CATEGORY", `Distribution category ${label} is duplicated.`, "categories"));
      continue;
    }
    seenIds.add(id);
    seenLabels.add(label.toLocaleLowerCase());
    const count = readFinite(category.count, `categories.${id}.count`);
    if (count.issue) {
      issues.push(count.issue);
      continue;
    }
    if ((count.value as number) < 0 || (count.value as number) > (total.value as number)) {
      issues.push(invalid("INVALID_CATEGORY_COUNT", `Count for ${label} must be between zero and respondent total.`, `categories.${id}.count`));
      continue;
    }
    categoryResults.push({
      id,
      label,
      count: count.value as number,
      percentage: safePercentage(count.value as number, total.value as number, precision) as number,
      derivedGroup:
        category.derivedGroup === "white" || category.derivedGroup === "non_white"
          ? category.derivedGroup
          : null,
    });
  }
  if (issues.length > 0) {
    return result({
      state: issues.some((issue) => issue.kind === "invalid") ? "invalid" : "missing",
      measurementType: input.measurementType,
      precision,
      respondentCount: total.value,
      issues,
    });
  }

  const categoryTotal = categoryResults.reduce((sum, category) => sum + category.count, 0);
  if (!input.allowNonExclusive && categoryTotal !== total.value) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      respondentCount: total.value,
      issues: [invalid("CATEGORY_TOTAL_MISMATCH", "Mutually exclusive category counts must equal respondent total.", "categories")],
    });
  }
  const distribution: DistributionResult = {
    respondentTotal: total.value as number,
    categoryTotal,
    unallocatedCount: Math.max(0, (total.value as number) - categoryTotal),
    allowNonExclusive: input.allowNonExclusive ?? false,
    categories: categoryResults,
    derivedNonWhitePercentage: input.allowNonExclusive
      ? null
      : deriveNonWhitePercentage(
          categoryResults,
          total.value as number,
          precision,
        ),
  };
  return result({
    state: "ok",
    measurementType: input.measurementType,
    precision,
    respondentCount: total.value,
    denominator: total.value,
    distribution,
  });
}

function deriveNonWhitePercentage(
  categories: DistributionCategoryResult[],
  respondentTotal: number,
  precision: number,
): number | null {
  const configured = categories.filter(
    (category) => category.derivedGroup === "non_white",
  );
  if (configured.length === 0) return null;
  return safePercentage(
    configured.reduce((sum, category) => sum + category.count, 0),
    respondentTotal,
    precision,
  );
}

function calculateMultiComponent(
  input: MultiComponentMeasurementInput,
  precision: number,
): MeasurementResult {
  if (!Array.isArray(input.components) || input.components.length === 0) {
    return result({
      state: "missing",
      measurementType: input.measurementType,
      precision,
      aggregationMethod: input.aggregationMethod,
      issues: [missing("MISSING_COMPONENTS", "At least one component is required.", "components")],
    });
  }
  if (!["none", "average", "weighted_average", "sum", "ratio", "all_complete"].includes(input.aggregationMethod)) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      issues: [invalid("INVALID_AGGREGATION_METHOD", "Multi-component aggregation method is unsupported.", "aggregationMethod")],
    });
  }

  const ids = new Set<string>();
  const components: MultiComponentResult[] = [];
  const definitionIssues: CalculationIssue[] = [];
  for (const component of input.components) {
    if (!component.id?.trim() || !component.label?.trim()) {
      definitionIssues.push(invalid("INVALID_COMPONENT", "Components require an id and label.", "components"));
      continue;
    }
    if (ids.has(component.id)) {
      definitionIssues.push(invalid("DUPLICATE_COMPONENT", `Component ${component.id} is duplicated.`, "components"));
      continue;
    }
    ids.add(component.id);
    const componentResult = calculateMeasurement(component.input);
    const hasTarget =
      component.targetValue !== undefined ||
      component.configurationStatus === "needs_target" ||
      component.configurationStatus === "needs_definition";
    components.push({
      id: component.id,
      label: component.label,
      unit: component.unit?.trim() || defaultUnitKey(component.input.measurementType),
      aggregationRole: component.aggregationRole ?? "value",
      weight: component.weight ?? 1,
      required: component.required ?? true,
      result: componentResult,
      progress: hasTarget
        ? calculateProgress({
            currentValue: componentResult.value,
            targetValue: component.targetValue,
            baselineValue: component.baselineValue,
            direction: component.direction,
            precision,
            configurationStatus: component.configurationStatus,
          })
        : null,
    });
  }
  if (definitionIssues.length > 0) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      aggregationMethod: input.aggregationMethod,
      components,
      issues: definitionIssues,
    });
  }
  if (components.some((component) => component.result.state === "invalid")) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      aggregationMethod: input.aggregationMethod,
      components,
      issues: components.flatMap((component) => component.result.state === "invalid" ? component.result.issues : []),
    });
  }
  if (input.aggregationMethod === "none") {
    return result({
      state: "ok",
      measurementType: input.measurementType,
      precision,
      aggregationMethod: "none",
      components,
    });
  }

  const requiredMissing = components.filter(
    (component) => component.required && component.result.state === "missing",
  );
  if (requiredMissing.length > 0) {
    return result({
      state: "missing",
      measurementType: input.measurementType,
      precision,
      aggregationMethod: input.aggregationMethod,
      components,
      issues: requiredMissing.flatMap((component) => component.result.issues),
    });
  }
  const included = components.filter((component) => component.result.state === "ok");
  if (included.length === 0) {
    return result({
      state: "missing",
      measurementType: input.measurementType,
      precision,
      aggregationMethod: input.aggregationMethod,
      components,
      issues: [missing("NO_AGGREGATABLE_COMPONENTS", "No components have values to aggregate.", "components")],
    });
  }

  if (input.aggregationMethod === "all_complete") {
    const missingProgress = included.filter((component) => component.progress === null || component.progress.state !== "ok");
    if (missingProgress.length > 0) {
      return result({
        state: missingProgress.some((component) => component.progress?.state === "invalid") ? "invalid" : "missing",
        measurementType: input.measurementType,
        precision,
        aggregationMethod: input.aggregationMethod,
        components,
        issues: missingProgress.flatMap((component) =>
          component.progress?.issues ?? [missing("MISSING_COMPONENT_TARGET", `Component ${component.id} needs a target.`, "targetValue")],
        ),
      });
    }
    const allComplete = included.every((component) => component.progress?.isComplete);
    return result({
      state: "ok",
      measurementType: input.measurementType,
      precision,
      aggregationMethod: input.aggregationMethod,
      components,
      value: allComplete ? 1 : 0,
      normalizedPercentage: allComplete ? 100 : 0,
    });
  }

  const units = new Set(included.map((component) => component.unit));
  if (units.size > 1) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      aggregationMethod: input.aggregationMethod,
      components,
      issues: [invalid("INCOMPATIBLE_COMPONENT_UNITS", "Average and sum aggregations require compatible component units.", "components")],
    });
  }
  const values = included.map((component) => component.result.value).filter(isNumber);
  if (values.length !== included.length) {
    return result({
      state: "invalid",
      measurementType: input.measurementType,
      precision,
      aggregationMethod: input.aggregationMethod,
      components,
      issues: [invalid("NON_SCALAR_COMPONENT", "This aggregation requires scalar component results.", "components")],
    });
  }

  if (input.aggregationMethod === "ratio") {
    const numeratorComponents = included.filter(
      (component) => component.aggregationRole === "numerator",
    );
    const denominatorComponents = included.filter(
      (component) => component.aggregationRole === "denominator",
    );
    const unassignedComponents = included.filter(
      (component) => component.aggregationRole === "value",
    );
    if (
      numeratorComponents.length === 0 ||
      denominatorComponents.length === 0 ||
      unassignedComponents.length > 0
    ) {
      return result({
        state: "invalid",
        measurementType: input.measurementType,
        precision,
        aggregationMethod: input.aggregationMethod,
        components,
        issues: [
          invalid(
            "INVALID_RATIO_COMPONENT_ROLES",
            "Ratio aggregation requires explicit numerator and denominator roles for every component.",
            "components",
          ),
        ],
      });
    }
    const numerator = numeratorComponents.reduce(
      (sum, component) => sum + (component.result.value as number),
      0,
    );
    const denominator = denominatorComponents.reduce(
      (sum, component) => sum + (component.result.value as number),
      0,
    );
    if (denominator <= 0) {
      return result({
        state: "invalid",
        measurementType: input.measurementType,
        precision,
        aggregationMethod: input.aggregationMethod,
        components,
        numerator,
        denominator,
        issues: [
          invalid(
            "INVALID_RATIO_DENOMINATOR",
            "Ratio aggregation requires a positive denominator total.",
            "components",
          ),
        ],
      });
    }
    const value = safePercentage(numerator, denominator, precision);
    return result({
      state: value === null ? "invalid" : "ok",
      measurementType: input.measurementType,
      precision,
      aggregationMethod: input.aggregationMethod,
      components,
      value,
      normalizedPercentage: value,
      numerator,
      denominator,
      issues:
        value === null
          ? [invalid("NON_FINITE_RESULT", "Ratio aggregation produced a non-finite result.")]
          : [],
    });
  }

  let value: number | null;
  if (input.aggregationMethod === "sum") {
    value = roundFinite(values.reduce((sum, item) => sum + item, 0), precision);
  } else if (input.aggregationMethod === "average") {
    value = roundedAverage(values, precision);
  } else {
    const invalidWeight = included.find(
      (component) => !Number.isFinite(component.weight) || component.weight < 0,
    );
    const weightTotal = included.reduce((sum, component) => sum + component.weight, 0);
    if (invalidWeight || weightTotal <= 0) {
      return result({
        state: "invalid",
        measurementType: input.measurementType,
        precision,
        aggregationMethod: input.aggregationMethod,
        components,
        issues: [invalid("INVALID_COMPONENT_WEIGHT", "Weighted aggregation requires non-negative weights with a positive total.", "components")],
      });
    }
    value = roundFinite(
      included.reduce(
        (sum, component) => sum + (component.result.value as number) * component.weight,
        0,
      ) / weightTotal,
      precision,
    );
  }

  const percentageUnit = units.has("percent");
  return result({
    state: value === null ? "invalid" : "ok",
    measurementType: input.measurementType,
    precision,
    aggregationMethod: input.aggregationMethod,
    components,
    value,
    normalizedPercentage: percentageUnit ? value : null,
    issues: value === null ? [invalid("NON_FINITE_RESULT", "Aggregation produced a non-finite result.")] : [],
  });
}

interface NumericCheck {
  value: number | null;
  issue: CalculationIssue | null;
}

function calculateFractionInputs(
  input: PercentageMeasurementInput | RatioMeasurementInput,
  precision: number,
  scale: number,
): Partial<MeasurementResult> {
  const numerator = readFinite(input.numerator, "numerator");
  const denominator = readOptionalFinite(input.denominator, "denominator");
  const fixedDenominator = readOptionalFinite(input.fixedDenominator, "fixedDenominator");
  const checks = [numerator, denominator, fixedDenominator];
  const invalidIssues = checks
    .map((check) => check.issue)
    .filter((issue): issue is CalculationIssue => issue?.kind === "invalid");
  if (invalidIssues.length > 0) {
    return { state: "invalid", issues: invalidIssues };
  }
  if (numerator.issue) {
    return { state: "missing", issues: [numerator.issue] };
  }
  if (
    denominator.value !== null &&
    fixedDenominator.value !== null &&
    denominator.value !== fixedDenominator.value
  ) {
    return {
      state: "invalid",
      issues: [invalid("DENOMINATOR_CONFLICT", "Entered and fixed denominators disagree.", "denominator")],
    };
  }
  const resolvedDenominator = denominator.value ?? fixedDenominator.value;
  if (resolvedDenominator === null) {
    return {
      state: "missing",
      numerator: numerator.value,
      issues: [missing("MISSING_DENOMINATOR", "A denominator or fixed denominator is required.", "denominator")],
    };
  }
  if (resolvedDenominator === 0) {
    return {
      state: "invalid",
      numerator: numerator.value,
      denominator: resolvedDenominator,
      issues: [invalid("ZERO_DENOMINATOR", "Denominator must not be zero.", "denominator")],
    };
  }
  const value = roundFinite(((numerator.value as number) / resolvedDenominator) * scale, precision);
  return {
    state: value === null ? "invalid" : "ok",
    value,
    numerator: numerator.value,
    denominator: resolvedDenominator,
    issues: value === null ? [invalid("NON_FINITE_RESULT", "Division produced a non-finite result.")] : [],
  };
}

function result(overrides: Partial<MeasurementResult>): MeasurementResult {
  return {
    state: overrides.state ?? "invalid",
    measurementType: overrides.measurementType ?? null,
    value: overrides.value ?? null,
    normalizedPercentage: overrides.normalizedPercentage ?? null,
    numerator: overrides.numerator ?? null,
    denominator: overrides.denominator ?? null,
    respondentCount: overrides.respondentCount ?? null,
    precision: overrides.precision ?? DEFAULT_PRECISION,
    issues: overrides.issues ?? [],
    ...(overrides.averageMethod
      ? { averageMethod: overrides.averageMethod }
      : {}),
    ...(overrides.calculationProvenance
      ? { calculationProvenance: overrides.calculationProvenance }
      : {}),
    ...(overrides.distribution ? { distribution: overrides.distribution } : {}),
    ...(overrides.components ? { components: overrides.components } : {}),
    ...(overrides.aggregationMethod ? { aggregationMethod: overrides.aggregationMethod } : {}),
  };
}

function progressResult(overrides: Partial<ProgressResult>): ProgressResult {
  return {
    state: overrides.state ?? "invalid",
    status: overrides.status ?? "needs_definition",
    currentValue: overrides.currentValue ?? null,
    targetValue: overrides.targetValue ?? null,
    baselineValue: overrides.baselineValue ?? null,
    actualProgressPercentage: overrides.actualProgressPercentage ?? null,
    displayProgressPercentage: overrides.displayProgressPercentage ?? null,
    isComplete: overrides.isComplete ?? false,
    isExceeded: overrides.isExceeded ?? false,
    issues: overrides.issues ?? [],
  };
}

function goalResult(
  input: GoalCompletionInput,
  overrides: Partial<GoalCompletionResult>,
): GoalCompletionResult {
  const excludedKpis = overrides.excludedKpis ?? [];
  return {
    goalId: input.goalId,
    rule: input.rule.type,
    state: overrides.state ?? "invalid",
    eligible: overrides.eligible ?? false,
    complete: overrides.complete ?? false,
    completionPercentage: overrides.completionPercentage ?? null,
    completedKpisCount: overrides.completedKpisCount ?? 0,
    totalEligibleKpisCount: overrides.totalEligibleKpisCount ?? 0,
    excludedKpisCount: excludedKpis.length,
    excludedKpis,
    exclusionReasons: overrides.exclusionReasons ?? [],
    issues: overrides.issues ?? [],
  };
}

function normalizeGoalKpiProgress(progress: GoalKpiInput["progress"]): {
  state: CalculationState;
  progress: number | null;
  complete: boolean;
  status?: ProgressStatus;
  issues: CalculationIssue[];
} {
  if (typeof progress === "number") {
    if (!Number.isFinite(progress)) {
      return {
        state: "invalid",
        progress: null,
        complete: false,
        issues: [invalid("NON_FINITE_PROGRESS", "KPI progress must be finite.", "progress")],
      };
    }
    return {
      state: "ok",
      progress: Math.max(0, Math.min(100, progress)),
      complete: progress >= 100,
      issues: [],
    };
  }
  if (!progress) {
    return {
      state: "missing",
      progress: null,
      complete: false,
      issues: [missing("MISSING_PROGRESS", "KPI progress is missing.", "progress")],
    };
  }
  if (progress.state === "missing" && progress.status === "not_started") {
    return {
      state: "ok",
      progress: 0,
      complete: false,
      status: progress.status,
      issues: [],
    };
  }
  return {
    state: progress.state,
    progress: progress.displayProgressPercentage,
    complete: progress.isComplete,
    status: progress.status,
    issues: progress.issues,
  };
}

function resolveThresholdCount(
  rule: Extract<GoalCompletionRule, { type: "threshold_count" }>,
  eligibleCount: number,
): { count: number; issue: CalculationIssue | null } {
  const hasCount = rule.thresholdCount !== null && rule.thresholdCount !== undefined;
  const hasPercentage = rule.thresholdPercentage !== null && rule.thresholdPercentage !== undefined;
  if (hasCount === hasPercentage) {
    return {
      count: 0,
      issue: invalid("AMBIGUOUS_THRESHOLD", "Provide exactly one threshold count or percentage.", "rule"),
    };
  }
  if (hasCount) {
    const count = rule.thresholdCount as number;
    if (!Number.isInteger(count) || count < 1 || count > eligibleCount) {
      return {
        count: 0,
        issue: invalid("INVALID_THRESHOLD_COUNT", "Threshold count must be an integer within the eligible KPI count.", "rule.thresholdCount"),
      };
    }
    return { count, issue: null };
  }
  const percentage = rule.thresholdPercentage as number;
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    return {
      count: 0,
      issue: invalid("INVALID_THRESHOLD_PERCENTAGE", "Threshold percentage must be greater than 0 and at most 100.", "rule.thresholdPercentage"),
    };
  }
  return { count: Math.ceil((eligibleCount * percentage) / 100), issue: null };
}

function resolvePrecision(value: unknown): {
  precision: number;
  issue: CalculationIssue | null;
} {
  if (value === undefined) return { precision: DEFAULT_PRECISION, issue: null };
  if (typeof value !== "number" || !isValidPrecision(value)) {
    return {
      precision: DEFAULT_PRECISION,
      issue: invalid("INVALID_PRECISION", `Precision must be an integer from 0 to ${MAX_PRECISION}.`, "precision"),
    };
  }
  return { precision: value, issue: null };
}

function isValidPrecision(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_PRECISION;
}

function readFinite(value: unknown, field: string): NumericCheck {
  if (value === null || value === undefined) {
    return { value: null, issue: missing("MISSING_VALUE", `${field} is required.`, field) };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { value: null, issue: invalid("NON_FINITE_VALUE", `${field} must be a finite number.`, field) };
  }
  return { value, issue: null };
}

function readOptionalFinite(value: unknown, field: string): NumericCheck {
  if (value === null || value === undefined) return { value: null, issue: null };
  return readFinite(value, field);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stateFromChecks(checks: NumericCheck[]): CalculationState {
  if (checks.some((check) => check.issue?.kind === "invalid")) return "invalid";
  if (checks.some((check) => check.issue?.kind === "missing")) return "missing";
  return "ok";
}

function combineStates(states: CalculationState[]): CalculationState {
  if (states.includes("invalid")) return "invalid";
  if (states.includes("missing")) return "missing";
  return "ok";
}

function prorateBaseline(
  value: number | null | undefined,
  fraction: number,
  precision: number,
): number | null | undefined {
  if (value === null || value === undefined) return value;
  if (!Number.isFinite(value)) return value;
  return roundFinite(value * fraction, precision);
}

function roundedAverage(values: number[], precision: number): number | null {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return null;
  return roundFinite(values.reduce((sum, value) => sum + value, 0) / values.length, precision);
}

function safePercentage(numerator: number, denominator: number, precision: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return roundFinite((numerator / denominator) * 100, precision);
}

function defaultUnitKey(type: MeasurementType): string {
  if (type === "percentage" || type === "average" || type === "year_over_year") return "percent";
  if (type === "currency") return "currency";
  if (type === "count" || type === "cumulative") return "count";
  return type;
}

function missing(code: string, message: string, field?: string): CalculationIssue {
  return { kind: "missing", code, message, ...(field ? { field } : {}) };
}

function invalid(code: string, message: string, field?: string): CalculationIssue {
  return { kind: "invalid", code, message, ...(field ? { field } : {}) };
}

function isIssue(value: CalculationIssue | null | undefined): value is CalculationIssue {
  return value !== null && value !== undefined;
}

function isNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
