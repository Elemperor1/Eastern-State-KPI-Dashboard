import { resolveConfiguredTargetValue } from "./calculations";
import type { PersistedTarget } from "./records";
import type { ConfigurationStatus, MeasurementType } from "./types";

type EffectiveTargetKind =
  | "annual"
  | "future_full_plan"
  | "past_full_plan"
  | null;

type TargetCalculationConfigurationStatus =
  | "ready"
  | "active"
  | "needs_definition"
  | "needs_target";

interface EffectiveTargetDecision {
  kind: EffectiveTargetKind;
  target: PersistedTarget | null;
  value: number | null;
  calculationConfigurationStatus: TargetCalculationConfigurationStatus;
  progressStatus: "not_started" | "target_not_finalized" | "needs_definition";
}

export interface EffectiveTargetPolicyResult {
  annual: EffectiveTargetDecision;
  fullPlan: EffectiveTargetDecision;
  effective: EffectiveTargetDecision;
}

export interface EffectiveTargetPolicyInput {
  targets: readonly PersistedTarget[];
  reportingYear: number;
  measurementType: MeasurementType | null;
  parentConfigurationStatus: ConfigurationStatus;
}

/**
 * Select and resolve the Targets applicable to one Reporting Year.
 *
 * Annual Targets take precedence. Without one, the nearest future Full-Plan
 * Target is used, followed by the latest past Full-Plan Target. Stable ids
 * break otherwise-equal ties so every reporting consumer makes the same choice.
 */
export function resolveEffectiveTargetPolicy({
  targets,
  reportingYear,
  measurementType,
  parentConfigurationStatus,
}: EffectiveTargetPolicyInput): EffectiveTargetPolicyResult {
  const available = targets.filter((target) => target.archived_at === null);
  const annualTarget = available
    .filter(
      (target) =>
        target.target_scope === "annual" &&
        target.reporting_year === reportingYear,
    )
    .sort(compareTargetYearThenId)[0] ?? null;

  const fullPlanTargets = available.filter(
    (target) => target.target_scope === "full_plan",
  );
  const futureTarget = fullPlanTargets
    .filter((target) => target.target_year >= reportingYear)
    .sort(compareTargetYearThenId)[0] ?? null;
  const pastTarget = futureTarget === null
    ? fullPlanTargets
        .filter((target) => target.target_year < reportingYear)
        .sort(compareLatestTargetYearThenId)[0] ?? null
    : null;

  const annual = resolveTargetDecision(
    annualTarget,
    annualTarget === null ? null : "annual",
    measurementType,
    parentConfigurationStatus,
  );
  const fullPlan = resolveTargetDecision(
    futureTarget ?? pastTarget,
    futureTarget !== null
      ? "future_full_plan"
      : pastTarget !== null
        ? "past_full_plan"
        : null,
    measurementType,
    parentConfigurationStatus,
  );

  return {
    annual,
    fullPlan,
    effective: annual.target === null ? fullPlan : annual,
  };
}

function resolveTargetDecision(
  target: PersistedTarget | null,
  kind: EffectiveTargetKind,
  measurementType: MeasurementType | null,
  parentConfigurationStatus: ConfigurationStatus,
): EffectiveTargetDecision {
  const value = target === null
    ? null
    : resolveConfiguredTargetValue({
        measurementType,
        targetValue: target.target_value,
        structuredTarget: target.structured_target,
        targetDescription: target.target_description,
        configurationStatus: target.configuration_status,
      });

  const calculationConfigurationStatus = targetCalculationConfigurationStatus(
    parentConfigurationStatus,
    target,
    value,
  );
  return {
    kind,
    target,
    value,
    calculationConfigurationStatus,
    progressStatus:
      calculationConfigurationStatus === "needs_definition"
        ? "needs_definition"
        : calculationConfigurationStatus === "needs_target" || target === null
          ? "target_not_finalized"
          : "not_started",
  };
}

function targetCalculationConfigurationStatus(
  parentStatus: ConfigurationStatus,
  target: PersistedTarget | null,
  resolvedValue: number | null,
): TargetCalculationConfigurationStatus {
  const normalizedParent = normalizeConfigurationStatus(parentStatus);
  if (normalizedParent === "needs_definition" || normalizedParent === "needs_target") {
    return normalizedParent;
  }
  if (target === null) return normalizedParent;

  const normalizedTarget = normalizeConfigurationStatus(
    target.configuration_status,
  );
  if (normalizedTarget === "needs_definition" || normalizedTarget === "needs_target") {
    return normalizedTarget;
  }
  return resolvedValue === null ? "needs_definition" : normalizedParent;
}

function normalizeConfigurationStatus(
  status: ConfigurationStatus,
): TargetCalculationConfigurationStatus {
  if (status === "needs_definition") return "needs_definition";
  if (status === "ready" || status === "active") return status;
  return "needs_target";
}

function compareTargetYearThenId(
  left: PersistedTarget,
  right: PersistedTarget,
): number {
  return left.target_year - right.target_year || left.id - right.id;
}

function compareLatestTargetYearThenId(
  left: PersistedTarget,
  right: PersistedTarget,
): number {
  return right.target_year - left.target_year || left.id - right.id;
}
