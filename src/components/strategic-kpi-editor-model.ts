import {
  MeasurementConfigurationCreateSchema,
  MeasurementConfigurationUpdateSchema,
  resolveEffectiveTargetPolicy,
  STRATEGIC_PLAN_END_YEAR,
  StrategicTargetCreateSchema,
  StrategicTargetUpdateSchema,
  StrategyComponentCreateSchema,
  StrategyComponentUpdateSchema,
  type AggregationMethod,
  type BoardStatus,
  type ComponentAggregationRole,
  type ConfigurationStatus,
  type DistributionDerivedGroup,
  type MeasurementType,
  type PersistedMeasurementConfig,
  type PersistedTarget,
  type StrategyComponentWithTargets,
  type StrategyKpiIdentity,
  type StrategyReportingFrequency,
  type TargetScope,
} from "@/features/strategy";
import { slugFromLabel } from "@/lib/slug";

export const STRATEGY_EDITOR_ENDPOINTS = {
  configurations: "/api/strategy/configurations",
  targets: "/api/strategy/targets",
  components: "/api/strategy/components",
  distributionBands: "/api/strategy/distribution-bands",
} as const;

interface StrategicKpiGoalContext {
  id: number;
  name: string;
  priorityName: string;
}

export interface StrategicDistributionBandEditorRecord {
  id: number;
  kpiId: number;
  componentId: number | null;
  slug: string;
  label: string;
  effectiveFromYear: number;
  effectiveToYear: number | null;
  displayOrder: number;
  isUnknown: boolean;
  isDeclined: boolean;
  derivedGroup: DistributionDerivedGroup | null;
  archivedAt: string | null;
}

export interface StrategicKpiEditorData {
  kpi: StrategyKpiIdentity;
  goalContexts: StrategicKpiGoalContext[];
  configuration: PersistedMeasurementConfig | null;
  targets: PersistedTarget[];
  components: StrategyComponentWithTargets[];
  distributionBands: StrategicDistributionBandEditorRecord[];
  reportingYear: number;
}

export interface ConfigurationFormDraft {
  effectiveStartYear: string;
  effectiveEndYear: string;
  measurementType: MeasurementType | "";
  unit: string;
  numeratorLabel: string;
  denominatorLabel: string;
  fixedDenominator: string;
  baselineValue: string;
  reportingFrequency: StrategyReportingFrequency | "";
  aggregationMethod: AggregationMethod;
  boardStatus: BoardStatus;
  calculationPrecision: string;
  allowScoreOverMax: boolean;
  configurationStatus: ConfigurationStatus;
  unresolvedQuestion: string;
  owner: string;
  dueDate: string;
  resolutionNotes: string;
  sourceReference: string;
  lastReviewedDate: string;
}

export interface TargetFormDraft {
  id: number | null;
  scope: TargetScope;
  targetYear: string;
  externalTargetYear: boolean;
  targetValue: string;
  structuredTarget: string;
  targetDescription: string;
  configurationStatus: ConfigurationStatus;
  sourceReference: string;
  lastReviewedDate: string;
}

export interface ComponentFormDraft {
  id: number | null;
  slug: string;
  label: string;
  measurementType: MeasurementType;
  unit: string;
  numeratorLabel: string;
  denominatorLabel: string;
  fixedDenominator: string;
  baselineValue: string;
  previousPeriodValue: string;
  aggregationRole: ComponentAggregationRole;
  weight: string;
  displayOrder: string;
  configurationStatus: ConfigurationStatus;
  unresolvedQuestion: string;
}

export interface DistributionBandFormDraft {
  id: number | null;
  slug: string;
  label: string;
  effectiveFromYear: string;
  effectiveToYear: string;
  displayOrder: string;
  isUnknown: boolean;
  isDeclined: boolean;
  derivedGroup: DistributionDerivedGroup | "";
}

export type StrategyEditorFormErrors = Record<string, string>;

export type StrategyEditorBuildResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; errors: StrategyEditorFormErrors };

export interface StrategyEditorMutation {
  endpoint: (typeof STRATEGY_EDITOR_ENDPOINTS)[keyof typeof STRATEGY_EDITOR_ENDPOINTS];
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
}

interface StrategyEditorMutationResult {
  ok: boolean;
  error: string | null;
}

export type StrategyEditorMutationRunner = (
  mutation: StrategyEditorMutation,
) => Promise<StrategyEditorMutationResult>;

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  return Number(value);
}

function requiredNumber(value: string): number {
  return value.trim() ? Number(value) : Number.NaN;
}

function errorsFromIssues(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): StrategyEditorFormErrors {
  const errors: StrategyEditorFormErrors = {};
  for (const issue of issues) {
    const field = issue.path.join(".") || "form";
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

function parseWithSchema(
  schema: { safeParse: (value: unknown) => { success: true; data: unknown } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  payload: Record<string, unknown>,
): StrategyEditorBuildResult {
  const parsed = schema.safeParse(payload);
  return parsed.success
    ? { ok: true, payload: parsed.data as Record<string, unknown> }
    : { ok: false, errors: errorsFromIssues(parsed.error.issues) };
}

export function configurationDraftFromData(
  configuration: PersistedMeasurementConfig | null,
  kpi: StrategyKpiIdentity,
  reportingYear: number,
): ConfigurationFormDraft {
  return {
    effectiveStartYear: String(configuration?.effective_from_year ?? reportingYear),
    effectiveEndYear:
      configuration?.effective_to_year === null ||
      configuration?.effective_to_year === undefined
        ? ""
        : String(configuration.effective_to_year),
    measurementType: configuration?.measurement_type ?? "",
    unit: configuration?.unit ?? kpi.unit ?? "",
    numeratorLabel: configuration?.numerator_label ?? "",
    denominatorLabel: configuration?.denominator_label ?? "",
    fixedDenominator:
      configuration?.fixed_denominator === null ||
      configuration?.fixed_denominator === undefined
        ? ""
        : String(configuration.fixed_denominator),
    baselineValue:
      configuration?.baseline_value === null ||
      configuration?.baseline_value === undefined
        ? ""
        : String(configuration.baseline_value),
    reportingFrequency: configuration?.reporting_frequency ?? "",
    aggregationMethod: configuration?.aggregation_method ?? "none",
    boardStatus: configuration?.board_level_status ?? "not_reported",
    calculationPrecision: String(configuration?.calculation_precision ?? 1),
    allowScoreOverMax: configuration?.allow_score_over_max ?? false,
    configurationStatus: configuration?.configuration_status ?? "draft",
    unresolvedQuestion: configuration?.unresolved_question ?? "",
    owner: configuration?.owner ?? "",
    dueDate: configuration?.due_date ?? "",
    resolutionNotes: configuration?.resolution_notes ?? "",
    sourceReference: configuration?.source_reference ?? "",
    lastReviewedDate: configuration?.last_reviewed_date ?? "",
  };
}

export function buildConfigurationFormPayload(
  draft: ConfigurationFormDraft,
  kpiId: number,
  configurationId: number | null,
): StrategyEditorBuildResult {
  const common = {
    effective_start_year: requiredNumber(draft.effectiveStartYear),
    effective_end_year: optionalNumber(draft.effectiveEndYear),
    measurement_type: draft.measurementType || undefined,
    unit: optionalText(draft.unit),
    numerator_label: optionalText(draft.numeratorLabel),
    denominator_label: optionalText(draft.denominatorLabel),
    fixed_denominator: optionalNumber(draft.fixedDenominator),
    baseline_value: optionalNumber(draft.baselineValue),
    reporting_frequency: draft.reportingFrequency || undefined,
    aggregation_method: draft.aggregationMethod,
    board_level_status: draft.boardStatus,
    calculation_precision: requiredNumber(draft.calculationPrecision),
    allow_score_over_max: draft.allowScoreOverMax,
    configuration_status: draft.configurationStatus,
    unresolved_question: optionalText(draft.unresolvedQuestion),
    owner: optionalText(draft.owner),
    due_date: optionalText(draft.dueDate),
    resolution_notes: optionalText(draft.resolutionNotes),
    source_reference: optionalText(draft.sourceReference),
    last_reviewed_date: optionalText(draft.lastReviewedDate),
  };
  const complete = parseWithSchema(MeasurementConfigurationCreateSchema, {
    kpi_id: kpiId,
    ...common,
  });
  if (!complete.ok || configurationId === null) return complete;
  return parseWithSchema(MeasurementConfigurationUpdateSchema, {
    id: configurationId,
    ...common,
  });
}

export function buildConfigurationMutation(
  payload: Record<string, unknown>,
  isCreate: boolean,
): StrategyEditorMutation {
  return isCreate
    ? {
        endpoint: STRATEGY_EDITOR_ENDPOINTS.configurations,
        method: "POST",
        body: payload,
      }
    : {
        endpoint: STRATEGY_EDITOR_ENDPOINTS.configurations,
        method: "PATCH",
        body: { action: "update", update: payload },
      };
}

export function successorConfigurationDraftFromData(
  configuration: PersistedMeasurementConfig,
  kpi: StrategyKpiIdentity,
  reportingYear: number,
): ConfigurationFormDraft {
  const draft = configurationDraftFromData(configuration, kpi, reportingYear);
  const suggestedStart = Math.max(
    configuration.effective_from_year + 1,
    reportingYear + 1,
  );
  return {
    ...draft,
    effectiveStartYear: String(suggestedStart),
    effectiveEndYear:
      configuration.effective_to_year === null
        ? ""
        : String(Math.max(configuration.effective_to_year, suggestedStart)),
  };
}

export function canCreateMeasurementSuccessor(
  configuration: PersistedMeasurementConfig,
  reportingYear: number,
): boolean {
  const finalYear = Math.min(
    configuration.effective_to_year ?? STRATEGIC_PLAN_END_YEAR,
    STRATEGIC_PLAN_END_YEAR,
  );
  return (
    reportingYear < STRATEGIC_PLAN_END_YEAR &&
    Math.max(configuration.effective_from_year + 1, reportingYear + 1) <=
      finalYear
  );
}

export function buildSuccessorConfigurationMutation(
  predecessorId: number,
  payload: Record<string, unknown>,
): StrategyEditorMutation {
  return {
    endpoint: STRATEGY_EDITOR_ENDPOINTS.configurations,
    method: "PATCH",
    body: {
      action: "create_successor",
      predecessor_id: predecessorId,
      successor: payload,
    },
  };
}

export function targetDraftForScope(
  targets: PersistedTarget[],
  scope: TargetScope,
  reportingYear: number,
): TargetFormDraft {
  const decision = resolveEffectiveTargetPolicy({
    targets,
    reportingYear,
    measurementType: null,
    parentConfigurationStatus: "active",
  });
  const target = scope === "annual"
    ? decision.annual.target
    : decision.fullPlan.target;
  return {
    id: target?.id ?? null,
    scope,
    targetYear: String(
      target?.target_year ?? (scope === "annual" ? reportingYear : 2029),
    ),
    externalTargetYear: target?.external_target_year ?? false,
    targetValue:
      target?.target_value === null || target?.target_value === undefined
        ? ""
        : String(target.target_value),
    structuredTarget:
      target?.structured_target === null ||
      target?.structured_target === undefined
        ? ""
        : JSON.stringify(target.structured_target, null, 2),
    targetDescription: target?.target_description ?? "",
    configurationStatus: target?.configuration_status ?? "draft",
    sourceReference: target?.source_reference ?? "",
    lastReviewedDate: target?.last_reviewed_date ?? "",
  };
}

export function buildTargetFormPayload(
  draft: TargetFormDraft,
  kpiId: number,
  measurementType: MeasurementType | null,
  componentId: number | null = null,
): StrategyEditorBuildResult {
  const targetYear = requiredNumber(draft.targetYear);
  const targetValue = optionalNumber(draft.targetValue);
  const targetDescription = optionalText(draft.targetDescription);
  const errors: StrategyEditorFormErrors = {};
  let structuredTarget: Record<string, unknown> | null = null;
  if (draft.structuredTarget.trim()) {
    try {
      const parsed = JSON.parse(draft.structuredTarget) as unknown;
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
        errors.structured_target = "Structured target must be a JSON object.";
      } else {
        structuredTarget = parsed as Record<string, unknown>;
      }
    } catch {
      errors.structured_target = "Structured target must be valid JSON.";
    }
  }
  if (
    !Number.isInteger(targetYear) ||
    (draft.externalTargetYear
      ? targetYear < 1900 || targetYear > 2100
      : targetYear < 2025 || targetYear > 2029)
  ) {
    errors.target_year = draft.externalTargetYear
      ? "External target year must be between 1900 and 2100."
      : "Target year must be between 2025 and 2029.";
  }
  if (
    targetValue === null &&
    structuredTarget === null &&
    targetDescription === null
  ) {
    errors.target_value = "Provide a numeric, structured, or descriptive target.";
  }
  if (
    measurementType === "percentage" &&
    targetValue !== null &&
    (targetValue < 0 || targetValue > 100)
  ) {
    errors.target_value = "Percentage targets must be between 0 and 100.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (draft.id === null) {
    return parseWithSchema(StrategicTargetCreateSchema, {
      kpi_id: componentId === null ? kpiId : null,
      component_id: componentId,
      target_scope: draft.scope,
      reporting_year: draft.scope === "annual" ? targetYear : null,
      target_year: targetYear,
      external_target_year: draft.externalTargetYear,
      target_value: targetValue,
      structured_target: structuredTarget,
      target_description: targetDescription,
      baseline_year: null,
      baseline_value: null,
      configuration_status: draft.configurationStatus,
      source_reference: optionalText(draft.sourceReference),
      last_reviewed_date: optionalText(draft.lastReviewedDate),
    });
  }
  return parseWithSchema(StrategicTargetUpdateSchema, {
    id: draft.id,
    target_scope: draft.scope,
    reporting_year: draft.scope === "annual" ? targetYear : null,
    target_year: targetYear,
    external_target_year: draft.externalTargetYear,
    target_value: targetValue,
    structured_target: structuredTarget,
    target_description: targetDescription,
    configuration_status: draft.configurationStatus,
    source_reference: optionalText(draft.sourceReference),
    last_reviewed_date: optionalText(draft.lastReviewedDate),
  });
}

export function buildTargetMutation(
  payload: Record<string, unknown>,
  isCreate: boolean,
): StrategyEditorMutation {
  return isCreate
    ? { endpoint: STRATEGY_EDITOR_ENDPOINTS.targets, method: "POST", body: payload }
    : {
        endpoint: STRATEGY_EDITOR_ENDPOINTS.targets,
        method: "PATCH",
        body: { action: "update", update: payload },
      };
}

export function componentDraftFromData(
  component: StrategyComponentWithTargets | null,
  displayOrder: number,
): ComponentFormDraft {
  return {
    id: component?.id ?? null,
    slug: component?.slug ?? "",
    label: component?.label ?? "",
    measurementType: component?.measurement_type ?? "count",
    unit: component?.unit ?? "",
    numeratorLabel: component?.numerator_label ?? "",
    denominatorLabel: component?.denominator_label ?? "",
    fixedDenominator:
      component?.fixed_denominator === null ||
      component?.fixed_denominator === undefined
        ? ""
        : String(component.fixed_denominator),
    baselineValue:
      component?.baseline_value === null || component?.baseline_value === undefined
        ? ""
        : String(component.baseline_value),
    previousPeriodValue:
      component?.previous_period_value === null ||
      component?.previous_period_value === undefined
        ? ""
        : String(component.previous_period_value),
    aggregationRole: component?.aggregation_role ?? "value",
    weight: String(component?.weight ?? 1),
    displayOrder: String(component?.display_order ?? displayOrder),
    configurationStatus: component?.configuration_status ?? "draft",
    unresolvedQuestion: component?.unresolved_question ?? "",
  };
}

export function buildComponentFormPayload(
  draft: ComponentFormDraft,
  configurationId: number,
): StrategyEditorBuildResult {
  const errors: StrategyEditorFormErrors = {};
  const unresolvedQuestion = optionalText(draft.unresolvedQuestion);
  const numeratorLabel = optionalText(draft.numeratorLabel);
  const denominatorLabel = optionalText(draft.denominatorLabel);
  const fixedDenominator = optionalNumber(draft.fixedDenominator);
  if (
    (draft.configurationStatus === "needs_definition" ||
      draft.configurationStatus === "needs_target") &&
    unresolvedQuestion === null
  ) {
    errors.unresolved_question =
      "An unresolved question is required for unresolved configuration.";
  }
  if (
    (draft.configurationStatus === "ready" ||
      draft.configurationStatus === "active") &&
    (draft.measurementType === "percentage" || draft.measurementType === "ratio")
  ) {
    if (numeratorLabel === null) {
      errors.numerator_label = "A numerator label is required.";
    }
    if (denominatorLabel === null && fixedDenominator === null) {
      errors.denominator_label =
        "Provide a denominator label or positive fixed denominator.";
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (draft.id === null) {
    return parseWithSchema(StrategyComponentCreateSchema, {
      configuration_id: configurationId,
      slug: draft.slug.trim() || slugFromLabel(draft.label),
      label: draft.label.trim(),
      measurement_type: draft.measurementType,
      unit: optionalText(draft.unit),
      numerator_label: numeratorLabel,
      denominator_label: denominatorLabel,
      fixed_denominator: fixedDenominator,
      baseline_value: optionalNumber(draft.baselineValue),
      previous_period_value: optionalNumber(draft.previousPeriodValue),
      aggregation_role: draft.aggregationRole,
      weight: requiredNumber(draft.weight),
      display_order: requiredNumber(draft.displayOrder),
      configuration_status: draft.configurationStatus,
      unresolved_question: unresolvedQuestion,
    });
  }
  return parseWithSchema(StrategyComponentUpdateSchema, {
    id: draft.id,
    label: draft.label.trim(),
    measurement_type: draft.measurementType,
    unit: optionalText(draft.unit),
    numerator_label: numeratorLabel,
    denominator_label: denominatorLabel,
    fixed_denominator: fixedDenominator,
    baseline_value: optionalNumber(draft.baselineValue),
    previous_period_value: optionalNumber(draft.previousPeriodValue),
    aggregation_role: draft.aggregationRole,
    weight: requiredNumber(draft.weight),
    display_order: requiredNumber(draft.displayOrder),
    configuration_status: draft.configurationStatus,
    unresolved_question: unresolvedQuestion,
  });
}

export function buildComponentMutation(
  payload: Record<string, unknown>,
  isCreate: boolean,
): StrategyEditorMutation {
  return isCreate
    ? {
        endpoint: STRATEGY_EDITOR_ENDPOINTS.components,
        method: "POST",
        body: payload,
      }
    : {
        endpoint: STRATEGY_EDITOR_ENDPOINTS.components,
        method: "PATCH",
        body: { action: "update", update: payload },
      };
}

export function buildComponentLifecycleMutation(
  id: number,
  action: "archive" | "restore",
): StrategyEditorMutation {
  return {
    endpoint: STRATEGY_EDITOR_ENDPOINTS.components,
    method: "PATCH",
    body: { action, id },
  };
}

export function buildComponentReorderMutation(
  configurationId: number,
  orderedComponentIds: number[],
): StrategyEditorMutation {
  return {
    endpoint: STRATEGY_EDITOR_ENDPOINTS.components,
    method: "PATCH",
    body: {
      action: "reorder",
      reorder: {
        configuration_id: configurationId,
        ordered_component_ids: orderedComponentIds,
      },
    },
  };
}

export function distributionBandDraftFromData(
  band: StrategicDistributionBandEditorRecord | null,
  reportingYear: number,
  displayOrder: number,
): DistributionBandFormDraft {
  return {
    id: band?.id ?? null,
    slug: band?.slug ?? "",
    label: band?.label ?? "",
    effectiveFromYear: String(band?.effectiveFromYear ?? reportingYear),
    effectiveToYear:
      band?.effectiveToYear === null || band?.effectiveToYear === undefined
        ? ""
        : String(band.effectiveToYear),
    displayOrder: String(band?.displayOrder ?? displayOrder),
    isUnknown: band?.isUnknown ?? false,
    isDeclined: band?.isDeclined ?? false,
    derivedGroup: band?.derivedGroup ?? "",
  };
}

export function buildDistributionBandPayload(
  draft: DistributionBandFormDraft,
  kpiId: number,
  componentId: number | null = null,
): StrategyEditorBuildResult {
  const errors: StrategyEditorFormErrors = {};
  const slug = draft.slug.trim() || slugFromLabel(draft.label);
  const label = draft.label.trim();
  const start = requiredNumber(draft.effectiveFromYear);
  const end = optionalNumber(draft.effectiveToYear);
  const order = requiredNumber(draft.displayOrder);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    errors.slug = "Slug must use lowercase kebab-case.";
  }
  if (!label) errors.label = "Label is required.";
  if (label.length > 200) errors.label = "Label must be 200 characters or fewer.";
  if (!Number.isInteger(start) || start < 1900 || start > 2100) {
    errors.effective_from_year = "Effective start year must be between 1900 and 2100.";
  }
  if (end !== null && (!Number.isInteger(end) || end < start || end > 2100)) {
    errors.effective_to_year = "Effective end year must follow the start year.";
  }
  if (!Number.isInteger(order) || order < 0) {
    errors.display_order = "Display order must be a non-negative integer.";
  }
  if (draft.isUnknown && draft.isDeclined) {
    errors.isDeclined = "A band cannot be both unknown and declined.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      ...(draft.id === null ? {} : { id: draft.id }),
      kpi_id: kpiId,
      component_id: componentId,
      slug,
      label,
      effective_from_year: start,
      effective_to_year: end,
      display_order: order,
      is_unknown: draft.isUnknown,
      is_declined: draft.isDeclined,
      derived_group: draft.derivedGroup || null,
    },
  };
}

export function buildDistributionBandMutation(
  payload: Record<string, unknown>,
  isCreate: boolean,
): StrategyEditorMutation {
  return isCreate
    ? {
        endpoint: STRATEGY_EDITOR_ENDPOINTS.distributionBands,
        method: "POST",
        body: payload,
      }
    : {
        endpoint: STRATEGY_EDITOR_ENDPOINTS.distributionBands,
        method: "PATCH",
        body: { action: "update", band: payload },
      };
}

export function buildDistributionBandLifecycleMutation(
  id: number,
  action: "archive" | "restore",
): StrategyEditorMutation {
  return {
    endpoint: STRATEGY_EDITOR_ENDPOINTS.distributionBands,
    method: "PATCH",
    body: { action, id },
  };
}

export function buildDistributionBandReorderMutation(
  kpiId: number,
  reportingYear: number,
  orderedBandIds: number[],
  componentId: number | null = null,
): StrategyEditorMutation {
  return {
    endpoint: STRATEGY_EDITOR_ENDPOINTS.distributionBands,
    method: "PATCH",
    body: {
      action: "reorder",
      order: {
        kpi_id: kpiId,
        component_id: componentId,
        reporting_year: reportingYear,
        ordered_band_ids: orderedBandIds,
      },
    },
  };
}

export function moveId<T extends { id: number }>(
  rows: T[],
  id: number,
  direction: "up" | "down",
): T[] {
  const index = rows.findIndex((row) => row.id === id);
  const destination = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || destination < 0 || destination >= rows.length) return rows;
  const copy = [...rows];
  [copy[index], copy[destination]] = [copy[destination], copy[index]];
  return copy;
}

export function firstFormError(errors: StrategyEditorFormErrors): string | null {
  return Object.values(errors)[0] ?? null;
}
