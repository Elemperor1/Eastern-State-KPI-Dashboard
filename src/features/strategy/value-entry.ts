import { z } from "zod";
import { getDb, transaction } from "@/lib/db";
import { recordStrategicAuditEvent } from "./audit";
import { validateReportingPeriod } from "./periods";
import type {
  AverageInputMethod,
  DistributionDerivedGroup,
  MeasurementType,
  StrategyJsonValue,
  StrategyReportingFrequency,
} from "./types";
import {
  DistributionInputSchema,
  ObservationInputSchema,
  type ValidatedObservationInput,
} from "./validation";

type StoredPeriodType = Exclude<StrategyReportingFrequency, "flexible">;

export interface StrategyValueEntryIssue {
  path: string;
  message: string;
}

export class StrategyValueEntryValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: StrategyValueEntryIssue[] = [],
  ) {
    super(message);
    this.name = "StrategyValueEntryValidationError";
  }
}

export class StrategyValueEntryNotFoundError extends Error {
  constructor(
    public readonly entity:
      | "kpi"
      | "measurement_config"
      | "component"
      | "observation"
      | "component_entry"
      | "distribution"
      | "distribution_band",
    public readonly id: number,
  ) {
    super(`${entity.replaceAll("_", " ")} ${id} was not found.`);
    this.name = "StrategyValueEntryNotFoundError";
  }
}

export interface StrategyObservationRecord {
  id: number;
  kpi_id: number;
  configuration_id: number;
  measurement_type: MeasurementType;
  reporting_frequency: StrategyReportingFrequency;
  year: number;
  period_type: StoredPeriodType;
  period_index: number;
  scalar_value: number | null;
  numerator: number | null;
  denominator: number | null;
  respondent_count: number | null;
  average_method: AverageInputMethod | null;
  total_score: number | null;
  average_score: number | null;
  max_score_per_respondent: number | null;
  total_possible_score: number | null;
  positive_response_count: number | null;
  total_response_count: number | null;
  boolean_value: boolean | null;
  milestone_value: number | null;
  notes: string | null;
  source_reference: string | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface StrategyComponentEntryRecord
  extends Omit<StrategyObservationRecord, "id" | "configuration_id"> {
  id: number;
  component_id: number;
  component_label: string;
  configuration_id: number;
}

export interface StrategyDistributionValueRecord {
  id: number;
  band_id: number;
  slug: string;
  current_label: string;
  label_snapshot: string;
  count: number;
  display_order: number;
  is_unknown: boolean;
  is_declined: boolean;
  derived_group: DistributionDerivedGroup | null;
}

export interface StrategyDistributionBandDefinition {
  id: number;
  kpi_id: number;
  component_id: number | null;
  slug: string;
  label: string;
  effective_from_year: number;
  effective_to_year: number | null;
  display_order: number;
  is_unknown: boolean;
  is_declined: boolean;
  derived_group: DistributionDerivedGroup | null;
  archived_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
}

export interface StrategyDistributionRecord {
  id: number;
  kpi_id: number;
  component_id: number | null;
  configuration_id: number;
  year: number;
  period_type: StoredPeriodType;
  period_index: number;
  respondent_count: number;
  mutually_exclusive: boolean;
  notes: string | null;
  source_reference: string | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  bands: StrategyDistributionValueRecord[];
}

const OptionalTextSchema = z
  .string()
  .trim()
  .min(1, "Use null instead of a blank string.")
  .max(4_000)
  .nullable()
  .optional()
  .default(null);

const AverageInputPayloadSchema = z
  .record(z.unknown())
  .nullable()
  .optional()
  .default(null);

const ValuePayloadShape = {
  reporting_year: z.number().int().min(1900).max(2100),
  reporting_month: z.number().int().min(1).max(12).nullable().optional().default(null),
  reporting_quarter: z.number().int().min(1).max(4).nullable().optional().default(null),
  flexible_mode: z.enum(["monthly", "annual"]).nullable().optional().default(null),
  value: z.number().finite().nullable().optional().default(null),
  numerator: z.number().finite().nonnegative().nullable().optional().default(null),
  denominator: z.number().finite().nonnegative().nullable().optional().default(null),
  average_inputs: AverageInputPayloadSchema,
  notes: OptionalTextSchema,
  source_reference: OptionalTextSchema,
};

export const StrategyObservationWriteSchema = z
  .object({
    kpi_id: z.number().int().positive(),
    ...ValuePayloadShape,
  })
  .strict();

export const StrategyComponentEntryWriteSchema = z
  .object({
    component_id: z.number().int().positive(),
    ...ValuePayloadShape,
  })
  .strict();

const DistributionBandWriteSchema = z
  .object({
    band_id: z.number().int().positive().nullable().optional().default(null),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Band slug must use lowercase kebab-case."),
    label: z.string().trim().min(1).max(200),
    count: z.number().int().nonnegative(),
    display_order: z.number().int().nonnegative(),
    is_unknown: z.boolean().optional().default(false),
    is_declined: z.boolean().optional().default(false),
    derived_group: z.enum(["white", "non_white"]).nullable().optional().default(null),
  })
  .strict()
  .superRefine((band, ctx) => {
    if (band.is_unknown && band.is_declined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["is_declined"],
        message: "A band cannot be both unknown and declined.",
      });
    }
  });

export const StrategyDistributionWriteSchema = z
  .object({
    kpi_id: z.number().int().positive(),
    component_id: z.number().int().positive().nullable().optional().default(null),
    reporting_year: z.number().int().min(1900).max(2100),
    reporting_month: z.number().int().min(1).max(12).nullable().optional().default(null),
    reporting_quarter: z.number().int().min(1).max(4).nullable().optional().default(null),
    flexible_mode: z.enum(["monthly", "annual"]).nullable().optional().default(null),
    respondent_count: z.number().int().nonnegative(),
    mutually_exclusive: z.boolean().optional().default(true),
    bands: z.array(DistributionBandWriteSchema).min(1).max(100),
    notes: OptionalTextSchema,
    source_reference: OptionalTextSchema,
  })
  .strict();

const DistributionBandDefinitionShape = {
  kpi_id: z.number().int().positive(),
  component_id: z.number().int().positive().nullable().optional().default(null),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Band slug must use lowercase kebab-case."),
  label: z.string().trim().min(1).max(200),
  effective_from_year: z.number().int().min(1900).max(2100),
  effective_to_year: z.number().int().min(1900).max(2100).nullable().optional().default(null),
  display_order: z.number().int().nonnegative(),
  is_unknown: z.boolean().optional().default(false),
  is_declined: z.boolean().optional().default(false),
  derived_group: z.enum(["white", "non_white"]).nullable().optional().default(null),
};

function validateDistributionBandDefinition(
  band: {
    effective_from_year: number;
    effective_to_year: number | null;
    is_unknown: boolean;
    is_declined: boolean;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    band.effective_to_year !== null &&
    band.effective_to_year < band.effective_from_year
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effective_to_year"],
      message: "Effective end year must be on or after the start year.",
    });
  }
  if (band.is_unknown && band.is_declined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["is_declined"],
      message: "A band cannot be both unknown and declined.",
    });
  }
}

export const StrategyDistributionBandCreateSchema = z
  .object(DistributionBandDefinitionShape)
  .strict()
  .superRefine(validateDistributionBandDefinition);

export const StrategyDistributionBandUpdateSchema = z
  .object({
    id: z.number().int().positive(),
    ...DistributionBandDefinitionShape,
  })
  .strict()
  .superRefine(validateDistributionBandDefinition);

export const StrategyDistributionBandReorderSchema = z
  .object({
    kpi_id: z.number().int().positive(),
    component_id: z.number().int().positive().nullable().optional().default(null),
    reporting_year: z.number().int().min(1900).max(2100),
    ordered_band_ids: z.array(z.number().int().positive()).min(1).max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.ordered_band_ids).size !== value.ordered_band_ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ordered_band_ids"],
        message: "Band order cannot contain duplicate ids.",
      });
    }
  });

interface NormalizedValuePayload {
  reporting_year: number;
  reporting_month: number | null;
  reporting_quarter: number | null;
  flexible_mode: "monthly" | "annual" | null;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  average_inputs: Record<string, unknown> | null;
  notes: string | null;
  source_reference: string | null;
}

interface ObservationWrite extends NormalizedValuePayload {
  kpi_id: number;
}

interface ComponentEntryWrite extends NormalizedValuePayload {
  component_id: number;
}

interface DistributionBandWrite {
  band_id: number | null;
  slug: string;
  label: string;
  count: number;
  display_order: number;
  is_unknown: boolean;
  is_declined: boolean;
  derived_group: DistributionDerivedGroup | null;
}

interface DistributionWrite {
  kpi_id: number;
  component_id: number | null;
  reporting_year: number;
  reporting_month: number | null;
  reporting_quarter: number | null;
  flexible_mode: "monthly" | "annual" | null;
  respondent_count: number;
  mutually_exclusive: boolean;
  bands: DistributionBandWrite[];
  notes: string | null;
  source_reference: string | null;
}

interface DistributionBandDefinitionWrite {
  kpi_id: number;
  component_id: number | null;
  slug: string;
  label: string;
  effective_from_year: number;
  effective_to_year: number | null;
  display_order: number;
  is_unknown: boolean;
  is_declined: boolean;
  derived_group: DistributionDerivedGroup | null;
}

interface DistributionBandDefinitionUpdate
  extends DistributionBandDefinitionWrite {
  id: number;
}

interface DistributionBandReorder {
  kpi_id: number;
  component_id: number | null;
  reporting_year: number;
  ordered_band_ids: number[];
}

interface EffectiveConfiguration {
  id: number;
  kpi_id: number;
  kpi_name: string;
  priority_name: string;
  goal_name: string | null;
  measurement_type: MeasurementType;
  reporting_frequency: StrategyReportingFrequency;
  fixed_denominator: number | null;
  baseline_value: number | null;
  allow_score_over_max: boolean;
}

interface ComponentContext {
  id: number;
  kpi_id: number;
  configuration_id: number;
  label: string;
  measurement_type: MeasurementType;
  fixed_denominator: number | null;
  baseline_value: number | null;
  previous_period_value: number | null;
}

interface AuditContext {
  kpi_name: string;
  priority_name: string;
  goal_name: string | null;
}

function zodIssues(error: z.ZodError): StrategyValueEntryIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function parsePayload<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new StrategyValueEntryValidationError(
      "Invalid strategy value entry.",
      zodIssues(result.error),
    );
  }
  return result.data;
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function stringOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function loadAuditContext(kpiId: number, year: number): AuditContext {
  const row = getDb()
    .prepare(
      `SELECT k.name AS kpi_name, c.name AS priority_name,
              (
                SELECT sg.name
                FROM goal_kpis gk
                JOIN strategic_goals sg ON sg.id = gk.goal_id
                WHERE gk.kpi_id = k.id
                  AND gk.archived_at IS NULL
                  AND sg.archived_at IS NULL
                  AND gk.effective_from_year <= ?
                  AND (gk.effective_to_year IS NULL OR gk.effective_to_year >= ?)
                  AND sg.plan_start_year <= ? AND sg.plan_end_year >= ?
                ORDER BY sg.sort_order, sg.id
                LIMIT 1
              ) AS goal_name
       FROM kpis k
       JOIN categories c ON c.id = k.category_id
       WHERE k.id = ?`,
    )
    .get(year, year, year, year, kpiId);
  if (!row) throw new StrategyValueEntryNotFoundError("kpi", kpiId);
  return {
    kpi_name: String(row.kpi_name),
    priority_name: String(row.priority_name),
    goal_name: stringOrNull(row.goal_name),
  };
}

function loadEffectiveConfiguration(kpiId: number, year: number): EffectiveConfiguration {
  const context = loadAuditContext(kpiId, year);
  const row = getDb()
    .prepare(
      `SELECT * FROM kpi_measurement_configs
       WHERE kpi_id = ?
         AND archived_at IS NULL
         AND configuration_status <> 'archived'
         AND effective_from_year <= ?
         AND (effective_to_year IS NULL OR effective_to_year >= ?)
       ORDER BY effective_from_year DESC, id DESC
       LIMIT 1`,
    )
    .get(kpiId, year, year);
  if (!row) {
    throw new StrategyValueEntryNotFoundError("measurement_config", kpiId);
  }
  const measurementType = stringOrNull(row.measurement_type) as MeasurementType | null;
  const reportingFrequency = stringOrNull(
    row.reporting_frequency,
  ) as StrategyReportingFrequency | null;
  if (measurementType === null || reportingFrequency === null) {
    throw new StrategyValueEntryValidationError(
      "The effective KPI measurement configuration is incomplete.",
      [
        {
          path: measurementType === null ? "measurement_type" : "reporting_frequency",
          message: "Define the measurement type and reporting frequency before entering values.",
        },
      ],
    );
  }
  return {
    id: Number(row.id),
    kpi_id: kpiId,
    kpi_name: context.kpi_name,
    priority_name: context.priority_name,
    goal_name: context.goal_name,
    measurement_type: measurementType,
    reporting_frequency: reportingFrequency,
    fixed_denominator: numberOrNull(row.fixed_denominator),
    baseline_value: numberOrNull(row.baseline_value),
    allow_score_over_max: Number(row.allow_score_over_max) === 1,
  };
}

function loadComponent(
  componentId: number,
  year: number,
): { component: ComponentContext; configuration: EffectiveConfiguration } {
  const row = getDb()
    .prepare(
      `SELECT * FROM kpi_components
       WHERE id = ? AND archived_at IS NULL AND configuration_status <> 'archived'`,
    )
    .get(componentId);
  if (!row) throw new StrategyValueEntryNotFoundError("component", componentId);
  const configuration = loadEffectiveConfiguration(Number(row.kpi_id), year);
  if (Number(row.configuration_id) !== configuration.id) {
    throw new StrategyValueEntryValidationError(
      "The component does not belong to the effective KPI configuration for this year.",
      [{ path: "component_id", message: "Choose a component configured for the selected year." }],
    );
  }
  const measurementType = stringOrNull(row.measurement_type) as MeasurementType | null;
  if (measurementType === null) {
    throw new StrategyValueEntryValidationError(
      "The component measurement type is not configured.",
      [{ path: "component_id", message: "Define the component measurement type first." }],
    );
  }
  return {
    configuration,
    component: {
      id: componentId,
      kpi_id: Number(row.kpi_id),
      configuration_id: Number(row.configuration_id),
      label: String(row.label),
      measurement_type: measurementType,
      fixed_denominator: numberOrNull(row.fixed_denominator),
      baseline_value: numberOrNull(row.baseline_value),
      previous_period_value: numberOrNull(row.previous_period_value),
    },
  };
}

/**
 * Resolve the exact component/configuration metadata that owns historical
 * entries. Unlike the write-path loader, this intentionally includes archived
 * definitions and does not substitute the configuration effective today.
 */
function loadComponentForHistory(
  componentId: number,
  year: number,
): { component: ComponentContext; configuration: EffectiveConfiguration } {
  const row = getDb()
    .prepare(
      `SELECT component.*,
              config.measurement_type AS parent_measurement_type,
              config.reporting_frequency AS parent_reporting_frequency,
              config.fixed_denominator AS parent_fixed_denominator,
              config.baseline_value AS parent_baseline_value,
              config.allow_score_over_max AS parent_allow_score_over_max
       FROM kpi_components component
       JOIN kpi_measurement_configs config
         ON config.id = component.configuration_id
       WHERE component.id = ?`,
    )
    .get(componentId);
  if (!row) throw new StrategyValueEntryNotFoundError("component", componentId);

  const componentMeasurementType = stringOrNull(
    row.measurement_type,
  ) as MeasurementType | null;
  const parentMeasurementType = stringOrNull(
    row.parent_measurement_type,
  ) as MeasurementType | null;
  const reportingFrequency = stringOrNull(
    row.parent_reporting_frequency,
  ) as StrategyReportingFrequency | null;
  if (
    componentMeasurementType === null ||
    parentMeasurementType === null ||
    reportingFrequency === null
  ) {
    throw new StrategyValueEntryValidationError(
      "The historical component definition is incomplete.",
      [{
        path: "component_id",
        message: "Historical component entries require their recorded measurement metadata.",
      }],
    );
  }

  const kpiId = Number(row.kpi_id);
  const context = loadAuditContext(kpiId, year);
  return {
    component: {
      id: componentId,
      kpi_id: kpiId,
      configuration_id: Number(row.configuration_id),
      label: String(row.label),
      measurement_type: componentMeasurementType,
      fixed_denominator: numberOrNull(row.fixed_denominator),
      baseline_value: numberOrNull(row.baseline_value),
      previous_period_value: numberOrNull(row.previous_period_value),
    },
    configuration: {
      id: Number(row.configuration_id),
      kpi_id: kpiId,
      kpi_name: context.kpi_name,
      priority_name: context.priority_name,
      goal_name: context.goal_name,
      measurement_type: parentMeasurementType,
      reporting_frequency: reportingFrequency,
      fixed_denominator: numberOrNull(row.parent_fixed_denominator),
      baseline_value: numberOrNull(row.parent_baseline_value),
      allow_score_over_max: Number(row.parent_allow_score_over_max) === 1,
    },
  };
}

function resolvePeriod(
  reportingFrequency: StrategyReportingFrequency,
  value: {
    reporting_year: number;
    reporting_month: number | null;
    reporting_quarter: number | null;
    flexible_mode: "monthly" | "annual" | null;
  },
): { period_type: StoredPeriodType; period_index: number } {
  const result = validateReportingPeriod({
    reportingFrequency,
    reportingYear: value.reporting_year,
    reportingMonth: value.reporting_month,
    reportingQuarter: value.reporting_quarter,
    flexibleMode: value.flexible_mode,
  });
  if (!result.success) {
    throw new StrategyValueEntryValidationError(
      "Invalid reporting period.",
      result.issues.map((issue) => ({
        path: String(issue.path),
        message: issue.message,
      })),
    );
  }
  return {
    period_type: result.period.resolvedFrequency,
    period_index: result.period.periodIndex,
  };
}

function validateObservation(
  input: ObservationWrite | ComponentEntryWrite,
  configuration: EffectiveConfiguration,
  measurementType: MeasurementType,
  component: ComponentContext | null,
): {
  validated: ValidatedObservationInput;
  period_type: StoredPeriodType;
  period_index: number;
} {
  if (measurementType === "distribution" || measurementType === "multi_component") {
    throw new StrategyValueEntryValidationError(
      measurementType === "distribution"
        ? "Distribution values must use the distribution endpoint."
        : "Multi-component KPI values must be entered against a component.",
      [{ path: "value", message: "Use the specialized strategy value endpoint." }],
    );
  }
  const period = resolvePeriod(configuration.reporting_frequency, input);
  const averageInputs =
    input.average_inputs === null
      ? null
      : {
          ...input.average_inputs,
          allow_over_max: configuration.allow_score_over_max,
        };
  const candidate = {
    kpi_id: configuration.kpi_id,
    component_id: component?.id ?? null,
    measurement_type: measurementType,
    reporting_frequency: period.period_type,
    reporting_year: input.reporting_year,
    reporting_month:
      period.period_type === "monthly"
        ? period.period_index
        : period.period_type === "annual"
          ? 0
          : null,
    reporting_quarter:
      period.period_type === "quarterly" ? period.period_index : null,
    value: input.value,
    numerator: input.numerator,
    denominator: input.denominator,
    fixed_denominator:
      component?.fixed_denominator ?? configuration.fixed_denominator,
    average_inputs: averageInputs,
    baseline_value: component?.baseline_value ?? configuration.baseline_value,
    previous_period_value: component?.previous_period_value ?? null,
    notes: input.notes,
    source_reference: input.source_reference,
    observed_at: null,
  };
  const result = ObservationInputSchema.safeParse(candidate);
  if (!result.success) {
    throw new StrategyValueEntryValidationError(
      "Invalid observation values.",
      zodIssues(result.error),
    );
  }
  if (
    measurementType === "milestone" &&
    result.data.value !== null &&
    (result.data.value < 0 || result.data.value > 100)
  ) {
    throw new StrategyValueEntryValidationError(
      "Invalid milestone value.",
      [{ path: "value", message: "Milestone progress must be between 0 and 100." }],
    );
  }
  const average = result.data.average_inputs;
  if (average !== null) {
    const incompatible =
      average.method === "total_score"
        ? average.average_score !== null ||
          average.positive_response_count !== null ||
          average.total_response_count !== null
        : average.method === "average_score"
          ? average.total_score !== null ||
            average.total_possible_score !== null ||
            average.positive_response_count !== null ||
            average.total_response_count !== null
          : average.total_score !== null ||
            average.average_score !== null ||
            average.total_possible_score !== null ||
            average.max_score_per_respondent !== null;
    if (incompatible) {
      throw new StrategyValueEntryValidationError(
        "Average input methods cannot mix incompatible raw fields.",
        [{ path: "average_inputs", message: "Submit raw fields for exactly one average method." }],
      );
    }
  }
  return { validated: result.data, ...period };
}

function inferAverageMethod(row: Record<string, unknown>): AverageInputMethod | null {
  if (row.positive_response_count !== null && row.positive_response_count !== undefined) {
    return "percent_positive";
  }
  if (row.average_score !== null && row.average_score !== undefined) {
    return "average_score";
  }
  if (row.total_score !== null && row.total_score !== undefined) {
    return "total_score";
  }
  return null;
}

function observationColumns(
  validated: ValidatedObservationInput,
): {
  scalar_value: number | null;
  numerator: number | null;
  denominator: number | null;
  respondent_count: number | null;
  total_score: number | null;
  average_score: number | null;
  max_score_per_respondent: number | null;
  total_possible_score: number | null;
  positive_response_count: number | null;
  total_response_count: number | null;
  boolean_value: number | null;
  milestone_value: number | null;
} {
  const average = validated.average_inputs;
  return {
    scalar_value:
      validated.measurement_type === "binary" ||
      validated.measurement_type === "milestone" ||
      validated.measurement_type === "percentage" ||
      validated.measurement_type === "ratio" ||
      validated.measurement_type === "average"
        ? null
        : validated.value,
    numerator: validated.numerator,
    denominator: validated.denominator,
    respondent_count: average?.respondent_count ?? null,
    total_score: average?.total_score ?? null,
    average_score: average?.average_score ?? null,
    max_score_per_respondent: average?.max_score_per_respondent ?? null,
    total_possible_score: average?.total_possible_score ?? null,
    positive_response_count: average?.positive_response_count ?? null,
    total_response_count: average?.total_response_count ?? null,
    boolean_value:
      validated.measurement_type === "binary" ? validated.value : null,
    milestone_value:
      validated.measurement_type === "milestone" ? validated.value : null,
  };
}

function asObservation(
  row: Record<string, unknown>,
  measurementType: MeasurementType,
  reportingFrequency: StrategyReportingFrequency,
): StrategyObservationRecord {
  return {
    id: Number(row.id),
    kpi_id: Number(row.kpi_id),
    configuration_id: Number(row.configuration_id),
    measurement_type: measurementType,
    reporting_frequency: reportingFrequency,
    year: Number(row.year),
    period_type: String(row.period_type) as StoredPeriodType,
    period_index: Number(row.period_index),
    scalar_value: numberOrNull(row.scalar_value),
    numerator: numberOrNull(row.numerator),
    denominator: numberOrNull(row.denominator),
    respondent_count: numberOrNull(row.respondent_count),
    average_method: inferAverageMethod(row),
    total_score: numberOrNull(row.total_score),
    average_score: numberOrNull(row.average_score),
    max_score_per_respondent: numberOrNull(row.max_score_per_respondent),
    total_possible_score: numberOrNull(row.total_possible_score),
    positive_response_count: numberOrNull(row.positive_response_count),
    total_response_count: numberOrNull(row.total_response_count),
    boolean_value:
      row.boolean_value === null || row.boolean_value === undefined
        ? null
        : Number(row.boolean_value) === 1,
    milestone_value: numberOrNull(row.milestone_value),
    notes: stringOrNull(row.notes),
    source_reference: stringOrNull(row.source_reference),
    updated_by: numberOrNull(row.updated_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function observationSnapshot(
  value: StrategyObservationRecord | StrategyComponentEntryRecord,
): Record<string, StrategyJsonValue> {
  return {
    kpi_id: value.kpi_id,
    configuration_id: value.configuration_id,
    ...("component_id" in value
      ? {
          component_id: value.component_id,
          component_label: value.component_label,
        }
      : {}),
    measurement_type: value.measurement_type,
    reporting_frequency: value.reporting_frequency,
    year: value.year,
    period_type: value.period_type,
    period_index: value.period_index,
    scalar_value: value.scalar_value,
    numerator: value.numerator,
    denominator: value.denominator,
    respondent_count: value.respondent_count,
    average_method: value.average_method,
    total_score: value.total_score,
    average_score: value.average_score,
    max_score_per_respondent: value.max_score_per_respondent,
    total_possible_score: value.total_possible_score,
    positive_response_count: value.positive_response_count,
    total_response_count: value.total_response_count,
    boolean_value: value.boolean_value,
    milestone_value: value.milestone_value,
    notes: value.notes,
    source_reference: value.source_reference,
  };
}

function snapshotsEqual(
  left: Record<string, StrategyJsonValue>,
  right: Record<string, StrategyJsonValue>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readObservation(
  id: number,
  measurementType: MeasurementType,
  reportingFrequency: StrategyReportingFrequency,
): StrategyObservationRecord {
  const row = getDb().prepare("SELECT * FROM kpi_observations WHERE id = ?").get(id);
  if (!row) throw new StrategyValueEntryNotFoundError("observation", id);
  return asObservation(row, measurementType, reportingFrequency);
}

export interface StrategyObservationListOptions {
  kpi_id: number;
  reporting_year: number;
}

/** Raw KPI observations for the configuration effective in the selected year. */
export function listStrategyObservations(
  options: StrategyObservationListOptions,
): StrategyObservationRecord[] {
  const configuration = loadEffectiveConfiguration(
    options.kpi_id,
    options.reporting_year,
  );
  return getDb()
    .prepare(
      `SELECT * FROM kpi_observations
       WHERE kpi_id = ? AND configuration_id = ? AND year = ?
       ORDER BY period_type, period_index, id`,
    )
    .all(options.kpi_id, configuration.id, options.reporting_year)
    .map((row) =>
      asObservation(
        row,
        configuration.measurement_type,
        configuration.reporting_frequency,
      ),
    );
}

/** Read one observation by immutable id, including its original raw inputs. */
export function getStrategyObservation(id: number): StrategyObservationRecord {
  const row = getDb()
    .prepare(
      `SELECT o.*, c.measurement_type, c.reporting_frequency
       FROM kpi_observations o
       JOIN kpi_measurement_configs c ON c.id = o.configuration_id
       WHERE o.id = ?`,
    )
    .get(id);
  if (!row) throw new StrategyValueEntryNotFoundError("observation", id);
  return asObservation(
    row,
    String(row.measurement_type) as MeasurementType,
    String(row.reporting_frequency) as StrategyReportingFrequency,
  );
}

function upsertObservationRow(
  input: ObservationWrite,
  configuration: EffectiveConfiguration,
  actorId: number | null,
): StrategyObservationRecord {
  const prepared = validateObservation(
    input,
    configuration,
    configuration.measurement_type,
    null,
  );
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT * FROM kpi_observations
       WHERE kpi_id = ? AND configuration_id = ? AND year = ?
         AND period_type = ? AND period_index = ?`,
    )
    .get(
      configuration.kpi_id,
      configuration.id,
      input.reporting_year,
      prepared.period_type,
      prepared.period_index,
    );
  const values = observationColumns(prepared.validated);
  const proposed = {
    ...(existing ?? {
      id: 0,
      kpi_id: configuration.kpi_id,
      configuration_id: configuration.id,
      year: input.reporting_year,
      period_type: prepared.period_type,
      period_index: prepared.period_index,
      created_at: "",
      updated_at: "",
    }),
    ...values,
    notes: input.notes,
    source_reference: input.source_reference,
    updated_by: actorId,
  };
  const proposedRecord = asObservation(
    proposed,
    configuration.measurement_type,
    configuration.reporting_frequency,
  );
  const beforeRecord = existing
    ? asObservation(
        existing,
        configuration.measurement_type,
        configuration.reporting_frequency,
      )
    : null;
  if (
    beforeRecord &&
    snapshotsEqual(observationSnapshot(beforeRecord), observationSnapshot(proposedRecord))
  ) {
    return beforeRecord;
  }

  let id: number;
  if (existing) {
    db.prepare(
      `UPDATE kpi_observations SET
         scalar_value = ?, numerator = ?, denominator = ?, respondent_count = ?,
         total_score = ?, average_score = ?, max_score_per_respondent = ?,
         total_possible_score = ?, positive_response_count = ?, total_response_count = ?,
         boolean_value = ?, milestone_value = ?, notes = ?, source_reference = ?,
         updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      values.scalar_value,
      values.numerator,
      values.denominator,
      values.respondent_count,
      values.total_score,
      values.average_score,
      values.max_score_per_respondent,
      values.total_possible_score,
      values.positive_response_count,
      values.total_response_count,
      values.boolean_value,
      values.milestone_value,
      input.notes,
      input.source_reference,
      actorId,
      Number(existing.id),
    );
    id = Number(existing.id);
  } else {
    id = Number(
      db.prepare(
        `INSERT INTO kpi_observations (
           kpi_id, configuration_id, year, period_type, period_index,
           scalar_value, numerator, denominator, respondent_count, total_score,
           average_score, max_score_per_respondent, total_possible_score,
           positive_response_count, total_response_count, boolean_value,
           milestone_value, notes, source_reference, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        configuration.kpi_id,
        configuration.id,
        input.reporting_year,
        prepared.period_type,
        prepared.period_index,
        values.scalar_value,
        values.numerator,
        values.denominator,
        values.respondent_count,
        values.total_score,
        values.average_score,
        values.max_score_per_respondent,
        values.total_possible_score,
        values.positive_response_count,
        values.total_response_count,
        values.boolean_value,
        values.milestone_value,
        input.notes,
        input.source_reference,
        actorId,
      ).lastInsertRowid,
    );
  }
  const after = readObservation(
    id,
    configuration.measurement_type,
    configuration.reporting_frequency,
  );
  recordStrategicAuditEvent({
    entity_type: "kpi_observation",
    entity_id: id,
    event_type: beforeRecord ? "update" : "create",
    entity_display_name: configuration.kpi_name,
    parent_priority_name: configuration.priority_name,
    parent_goal_name: configuration.goal_name,
    previous_value: beforeRecord ? observationSnapshot(beforeRecord) : null,
    new_value: observationSnapshot(after),
    actor_id: actorId,
    source_reference: input.source_reference,
  });
  return after;
}

export function upsertStrategyObservation(
  rawInput: unknown,
  actorId: number | null,
): StrategyObservationRecord {
  const input = parsePayload(
    StrategyObservationWriteSchema,
    rawInput,
  ) as ObservationWrite;
  return transaction(() => {
    const configuration = loadEffectiveConfiguration(input.kpi_id, input.reporting_year);
    return upsertObservationRow(input, configuration, actorId);
  });
}

export function deleteStrategyObservation(
  id: number,
  actorId: number | null,
): void {
  transaction(() => {
    const row = getDb()
      .prepare(
        `SELECT o.*, c.measurement_type, c.reporting_frequency
         FROM kpi_observations o
         JOIN kpi_measurement_configs c ON c.id = o.configuration_id
         WHERE o.id = ?`,
      )
      .get(id);
    if (!row) throw new StrategyValueEntryNotFoundError("observation", id);
    const record = asObservation(
      row,
      String(row.measurement_type) as MeasurementType,
      String(row.reporting_frequency) as StrategyReportingFrequency,
    );
    const context = loadAuditContext(record.kpi_id, record.year);
    getDb().prepare("DELETE FROM kpi_observations WHERE id = ?").run(id);
    recordStrategicAuditEvent({
      entity_type: "kpi_observation",
      entity_id: id,
      event_type: "delete",
      entity_display_name: context.kpi_name,
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: observationSnapshot(record),
      new_value: null,
      actor_id: actorId,
      source_reference: record.source_reference,
    });
  });
}

function asComponentEntry(
  row: Record<string, unknown>,
  component: ComponentContext,
  configuration: EffectiveConfiguration,
): StrategyComponentEntryRecord {
  const common = asObservation(
    {
      ...row,
      kpi_id: component.kpi_id,
      configuration_id: component.configuration_id,
    },
    component.measurement_type,
    configuration.reporting_frequency,
  );
  return {
    ...common,
    component_id: component.id,
    component_label: component.label,
    configuration_id: component.configuration_id,
  };
}

function readComponentEntry(
  id: number,
  component: ComponentContext,
  configuration: EffectiveConfiguration,
): StrategyComponentEntryRecord {
  const row = getDb().prepare("SELECT * FROM kpi_component_entries WHERE id = ?").get(id);
  if (!row) throw new StrategyValueEntryNotFoundError("component_entry", id);
  return asComponentEntry(row, component, configuration);
}

export interface StrategyComponentEntryListOptions {
  component_id: number;
  reporting_year: number;
}

/** Raw component-entry history, including archived owner metadata. */
export function listStrategyComponentEntries(
  options: StrategyComponentEntryListOptions,
): StrategyComponentEntryRecord[] {
  const { component, configuration } = loadComponentForHistory(
    options.component_id,
    options.reporting_year,
  );
  return getDb()
    .prepare(
      `SELECT * FROM kpi_component_entries
       WHERE component_id = ? AND year = ?
       ORDER BY period_type, period_index, id`,
    )
    .all(options.component_id, options.reporting_year)
    .map((row) => asComponentEntry(row, component, configuration));
}

/** Read one component entry even after its owning definition is archived. */
export function getStrategyComponentEntry(
  id: number,
): StrategyComponentEntryRecord {
  const row = getDb()
    .prepare("SELECT * FROM kpi_component_entries WHERE id = ?")
    .get(id);
  if (!row) throw new StrategyValueEntryNotFoundError("component_entry", id);
  const { component, configuration } = loadComponentForHistory(
    Number(row.component_id),
    Number(row.year),
  );
  return asComponentEntry(row, component, configuration);
}

export function upsertStrategyComponentEntry(
  rawInput: unknown,
  actorId: number | null,
): StrategyComponentEntryRecord {
  const input = parsePayload(
    StrategyComponentEntryWriteSchema,
    rawInput,
  ) as ComponentEntryWrite;
  return transaction(() => {
    const { component, configuration } = loadComponent(
      input.component_id,
      input.reporting_year,
    );
    const prepared = validateObservation(
      input,
      configuration,
      component.measurement_type,
      component,
    );
    const db = getDb();
    const existing = db
      .prepare(
        `SELECT * FROM kpi_component_entries
         WHERE component_id = ? AND year = ? AND period_type = ? AND period_index = ?`,
      )
      .get(
        component.id,
        input.reporting_year,
        prepared.period_type,
        prepared.period_index,
      );
    const values = observationColumns(prepared.validated);
    const proposed = {
      ...(existing ?? {
        id: 0,
        component_id: component.id,
        year: input.reporting_year,
        period_type: prepared.period_type,
        period_index: prepared.period_index,
        created_at: "",
        updated_at: "",
      }),
      ...values,
      notes: input.notes,
      source_reference: input.source_reference,
      updated_by: actorId,
    };
    const before = existing
      ? asComponentEntry(existing, component, configuration)
      : null;
    const proposedRecord = asComponentEntry(proposed, component, configuration);
    if (
      before &&
      snapshotsEqual(observationSnapshot(before), observationSnapshot(proposedRecord))
    ) {
      return before;
    }

    let id: number;
    if (existing) {
      db.prepare(
        `UPDATE kpi_component_entries SET
           scalar_value = ?, numerator = ?, denominator = ?, respondent_count = ?,
           total_score = ?, average_score = ?, max_score_per_respondent = ?,
           total_possible_score = ?, positive_response_count = ?, total_response_count = ?,
           boolean_value = ?, milestone_value = ?, notes = ?, source_reference = ?,
           updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(
        values.scalar_value,
        values.numerator,
        values.denominator,
        values.respondent_count,
        values.total_score,
        values.average_score,
        values.max_score_per_respondent,
        values.total_possible_score,
        values.positive_response_count,
        values.total_response_count,
        values.boolean_value,
        values.milestone_value,
        input.notes,
        input.source_reference,
        actorId,
        Number(existing.id),
      );
      id = Number(existing.id);
    } else {
      id = Number(
        db.prepare(
          `INSERT INTO kpi_component_entries (
             component_id, year, period_type, period_index, scalar_value,
             numerator, denominator, respondent_count, total_score, average_score,
             max_score_per_respondent, total_possible_score, positive_response_count,
             total_response_count, boolean_value, milestone_value, notes,
             source_reference, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          component.id,
          input.reporting_year,
          prepared.period_type,
          prepared.period_index,
          values.scalar_value,
          values.numerator,
          values.denominator,
          values.respondent_count,
          values.total_score,
          values.average_score,
          values.max_score_per_respondent,
          values.total_possible_score,
          values.positive_response_count,
          values.total_response_count,
          values.boolean_value,
          values.milestone_value,
          input.notes,
          input.source_reference,
          actorId,
        ).lastInsertRowid,
      );
    }
    const after = readComponentEntry(id, component, configuration);
    recordStrategicAuditEvent({
      entity_type: "kpi_component_entry",
      entity_id: id,
      event_type: before ? "update" : "create",
      entity_display_name: component.label,
      parent_priority_name: configuration.priority_name,
      parent_goal_name: configuration.goal_name,
      previous_value: before ? observationSnapshot(before) : null,
      new_value: observationSnapshot(after),
      actor_id: actorId,
      source_reference: input.source_reference,
    });
    return after;
  });
}

export function deleteStrategyComponentEntry(
  id: number,
  actorId: number | null,
): void {
  transaction(() => {
    const row = getDb()
      .prepare(
        `SELECT e.*, c.kpi_id, c.configuration_id, c.label,
                c.measurement_type, c.fixed_denominator, c.baseline_value,
                c.previous_period_value, mc.reporting_frequency
         FROM kpi_component_entries e
         JOIN kpi_components c ON c.id = e.component_id
         JOIN kpi_measurement_configs mc ON mc.id = c.configuration_id
         WHERE e.id = ?`,
      )
      .get(id);
    if (!row) throw new StrategyValueEntryNotFoundError("component_entry", id);
    const component: ComponentContext = {
      id: Number(row.component_id),
      kpi_id: Number(row.kpi_id),
      configuration_id: Number(row.configuration_id),
      label: String(row.label),
      measurement_type: String(row.measurement_type) as MeasurementType,
      fixed_denominator: numberOrNull(row.fixed_denominator),
      baseline_value: numberOrNull(row.baseline_value),
      previous_period_value: numberOrNull(row.previous_period_value),
    };
    const context = loadAuditContext(component.kpi_id, Number(row.year));
    const configuration: EffectiveConfiguration = {
      id: component.configuration_id,
      kpi_id: component.kpi_id,
      kpi_name: context.kpi_name,
      priority_name: context.priority_name,
      goal_name: context.goal_name,
      measurement_type: "multi_component",
      reporting_frequency: String(row.reporting_frequency) as StrategyReportingFrequency,
      fixed_denominator: null,
      baseline_value: null,
      allow_score_over_max: false,
    };
    const record = asComponentEntry(row, component, configuration);
    getDb().prepare("DELETE FROM kpi_component_entries WHERE id = ?").run(id);
    recordStrategicAuditEvent({
      entity_type: "kpi_component_entry",
      entity_id: id,
      event_type: "delete",
      entity_display_name: component.label,
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: observationSnapshot(record),
      new_value: null,
      actor_id: actorId,
      source_reference: record.source_reference,
    });
  });
}

function validateDistribution(
  input: DistributionWrite,
  configuration: EffectiveConfiguration,
  component: ComponentContext | null,
): { period_type: StoredPeriodType; period_index: number } {
  const measurementType = component?.measurement_type ?? configuration.measurement_type;
  if (measurementType !== "distribution") {
    throw new StrategyValueEntryValidationError(
      "Only distribution measurements may use this endpoint.",
      [{ path: component ? "component_id" : "kpi_id", message: "Choose a distribution measurement." }],
    );
  }
  const period = resolvePeriod(configuration.reporting_frequency, input);
  const distributionResult = DistributionInputSchema.safeParse({
    kpi_id: configuration.kpi_id,
    component_id: component?.id ?? null,
    reporting_year: input.reporting_year,
    reporting_month:
      period.period_type === "monthly"
        ? period.period_index
        : period.period_type === "annual"
          ? 0
          : null,
    respondent_count: input.respondent_count,
    mutually_exclusive: input.mutually_exclusive,
    categories: input.bands.map((band) => ({
      key: band.slug,
      label: band.label,
      count: band.count,
      display_order: band.display_order,
      derived_group: band.derived_group,
      is_archived: false,
    })),
    notes: input.notes,
    source_reference: input.source_reference,
  });
  if (!distributionResult.success) {
    throw new StrategyValueEntryValidationError(
      "Invalid distribution values.",
      zodIssues(distributionResult.error),
    );
  }
  return period;
}

function bandSnapshot(row: Record<string, unknown>): Record<string, StrategyJsonValue> {
  return {
    kpi_id: Number(row.kpi_id),
    component_id: numberOrNull(row.component_id),
    slug: String(row.slug),
    label: String(row.label),
    effective_from_year: Number(row.effective_from_year),
    effective_to_year: numberOrNull(row.effective_to_year),
    display_order: Number(row.display_order),
    is_unknown: Number(row.is_unknown) === 1,
    is_declined: Number(row.is_declined) === 1,
    derived_group: stringOrNull(row.derived_group) as DistributionDerivedGroup | null,
    archived_at: stringOrNull(row.archived_at),
  };
}

function findBand(
  input: DistributionBandWrite,
  kpiId: number,
  componentId: number | null,
  year: number,
): Record<string, unknown> | null {
  const db = getDb();
  if (input.band_id !== null) {
    const row = db.prepare("SELECT * FROM distribution_bands WHERE id = ?").get(input.band_id);
    if (!row) {
      throw new StrategyValueEntryNotFoundError("distribution_band", input.band_id);
    }
    if (
      Number(row.kpi_id) !== kpiId ||
      numberOrNull(row.component_id) !== componentId ||
      row.archived_at !== null
    ) {
      throw new StrategyValueEntryValidationError(
        "The distribution band does not belong to this KPI measurement.",
        [{ path: "bands.band_id", message: "Choose an active band for this KPI or component." }],
      );
    }
    const effectiveToYear = numberOrNull(row.effective_to_year);
    if (
      Number(row.effective_from_year) > year ||
      (effectiveToYear !== null && effectiveToYear < year)
    ) {
      throw new StrategyValueEntryValidationError(
        "The distribution band is not effective for this reporting year.",
        [{ path: "bands.band_id", message: "Choose a band effective for this reporting year." }],
      );
    }
    return row;
  }
  return (
    db.prepare(
      `SELECT * FROM distribution_bands
       WHERE kpi_id = ? AND component_id IS ? AND slug = ?
         AND archived_at IS NULL
         AND effective_from_year <= ?
         AND (effective_to_year IS NULL OR effective_to_year >= ?)
       ORDER BY effective_from_year DESC, id DESC
       LIMIT 1`,
    ).get(kpiId, componentId, input.slug, year, year) ?? null
  );
}

function syncDistributionBand(
  input: DistributionBandWrite,
  kpiId: number,
  componentId: number | null,
  year: number,
  context: AuditContext,
  actorId: number | null,
): Record<string, unknown> {
  const db = getDb();
  const before = findBand(input, kpiId, componentId, year);
  // Observation writes own counts, not band configuration. Existing band
  // definitions are authoritative and may only change through the explicit
  // create/update/reorder/archive/restore operations below.
  if (before) return before;
  const implicitBand: DistributionBandDefinitionWrite = {
    kpi_id: kpiId,
    component_id: componentId,
    slug: input.slug,
    label: input.label,
    effective_from_year: year,
    effective_to_year: null,
    display_order: input.display_order,
    is_unknown: input.is_unknown,
    is_declined: input.is_declined,
    derived_group: input.derived_group,
  };
  if (findOverlappingActiveDistributionBand(implicitBand)) {
    throw overlappingDistributionBandError();
  }
  const id = Number(
    db.prepare(
      `INSERT INTO distribution_bands (
         kpi_id, component_id, slug, label, effective_from_year,
         display_order, is_unknown, is_declined, derived_group,
         created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      kpiId,
      componentId,
      input.slug,
      input.label,
      year,
      input.display_order,
      input.is_unknown ? 1 : 0,
      input.is_declined ? 1 : 0,
      input.derived_group,
      actorId,
      actorId,
    ).lastInsertRowid,
  );
  const after = db.prepare("SELECT * FROM distribution_bands WHERE id = ?").get(id)!;
  recordStrategicAuditEvent({
    entity_type: "distribution_band",
    entity_id: id,
    event_type: "create",
    entity_display_name: input.label,
    parent_priority_name: context.priority_name,
    parent_goal_name: context.goal_name,
    previous_value: null,
    new_value: bandSnapshot(after),
    actor_id: actorId,
  });
  return after;
}

function asDistribution(
  row: Record<string, unknown>,
  bands: Record<string, unknown>[],
): StrategyDistributionRecord {
  return {
    id: Number(row.id),
    kpi_id: Number(row.kpi_id),
    component_id: numberOrNull(row.component_id),
    configuration_id: Number(row.configuration_id),
    year: Number(row.year),
    period_type: String(row.period_type) as StoredPeriodType,
    period_index: Number(row.period_index),
    respondent_count: Number(row.respondent_count),
    mutually_exclusive: Number(row.categories_mutually_exclusive) === 1,
    notes: stringOrNull(row.notes),
    source_reference: stringOrNull(row.source_reference),
    updated_by: numberOrNull(row.updated_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    bands: bands.map((band) => ({
      id: Number(band.value_id),
      band_id: Number(band.band_id),
      slug: String(band.slug),
      current_label: String(band.current_label),
      label_snapshot: String(band.band_label_snapshot),
      count: Number(band.category_count),
      display_order: Number(band.display_order),
      is_unknown: Number(band.is_unknown) === 1,
      is_declined: Number(band.is_declined) === 1,
      derived_group: stringOrNull(
        band.derived_group,
      ) as DistributionDerivedGroup | null,
    })),
  };
}

function readDistribution(id: number): StrategyDistributionRecord {
  const db = getDb();
  const row = db.prepare("SELECT * FROM distribution_observations WHERE id = ?").get(id);
  if (!row) throw new StrategyValueEntryNotFoundError("distribution", id);
  const bands = db
    .prepare(
      `SELECT dv.id AS value_id, dv.band_id, dv.band_label_snapshot,
              dv.category_count, b.slug, b.label AS current_label,
              b.display_order, b.is_unknown, b.is_declined, b.derived_group
       FROM distribution_values dv
       LEFT JOIN distribution_bands b ON b.id = dv.band_id
       WHERE dv.observation_id = ?
       ORDER BY b.display_order, dv.id`,
    )
    .all(id);
  return asDistribution(row, bands);
}

export interface StrategyDistributionListOptions {
  kpi_id: number;
  component_id?: number | null;
  reporting_year: number;
}

/** Distribution observations and immutable band-label snapshots for a year. */
export function listStrategyDistributions(
  options: StrategyDistributionListOptions,
): StrategyDistributionRecord[] {
  const componentId = options.component_id ?? null;
  const configuration = loadEffectiveConfiguration(
    options.kpi_id,
    options.reporting_year,
  );
  let measurementType = configuration.measurement_type;
  if (componentId !== null) {
    const { component } = loadComponent(componentId, options.reporting_year);
    if (component.kpi_id !== options.kpi_id) {
      throw new StrategyValueEntryValidationError(
        "The component does not belong to the supplied KPI.",
        [{ path: "component_id", message: "Choose a component owned by this KPI." }],
      );
    }
    measurementType = component.measurement_type;
  }
  if (measurementType !== "distribution") {
    throw new StrategyValueEntryValidationError(
      "Only distribution measurements have distribution observations.",
      [{ path: componentId === null ? "kpi_id" : "component_id", message: "Choose a distribution measurement." }],
    );
  }
  return getDb()
    .prepare(
      `SELECT id FROM distribution_observations
       WHERE kpi_id = ? AND component_id IS ? AND configuration_id = ? AND year = ?
       ORDER BY period_type, period_index, id`,
    )
    .all(
      options.kpi_id,
      componentId,
      configuration.id,
      options.reporting_year,
    )
    .map((row) => readDistribution(Number(row.id)));
}

/** Read one saved distribution with the exact labels recorded at entry time. */
export function getStrategyDistribution(id: number): StrategyDistributionRecord {
  return readDistribution(id);
}

function distributionSnapshot(
  value: StrategyDistributionRecord,
): Record<string, StrategyJsonValue> {
  return {
    kpi_id: value.kpi_id,
    component_id: value.component_id,
    configuration_id: value.configuration_id,
    year: value.year,
    period_type: value.period_type,
    period_index: value.period_index,
    respondent_count: value.respondent_count,
    mutually_exclusive: value.mutually_exclusive,
    notes: value.notes,
    source_reference: value.source_reference,
    bands: value.bands.map((band) => ({
      band_id: band.band_id,
      slug: band.slug,
      label_snapshot: band.label_snapshot,
      count: band.count,
      display_order: band.display_order,
      is_unknown: band.is_unknown,
      is_declined: band.is_declined,
      derived_group: band.derived_group,
    })),
  };
}

export function upsertStrategyDistribution(
  rawInput: unknown,
  actorId: number | null,
): StrategyDistributionRecord {
  const input = parsePayload(
    StrategyDistributionWriteSchema,
    rawInput,
  ) as DistributionWrite;
  return transaction(() => {
    const configuration = loadEffectiveConfiguration(input.kpi_id, input.reporting_year);
    const component =
      input.component_id === null
        ? null
        : loadComponent(input.component_id, input.reporting_year).component;
    if (component !== null && component.kpi_id !== input.kpi_id) {
      throw new StrategyValueEntryValidationError(
        "The component does not belong to the supplied KPI.",
        [{ path: "component_id", message: "Choose a component owned by this KPI." }],
      );
    }
    const period = validateDistribution(input, configuration, component);
    const context: AuditContext = {
      kpi_name: configuration.kpi_name,
      priority_name: configuration.priority_name,
      goal_name: configuration.goal_name,
    };
    const db = getDb();
    const existing = db
      .prepare(
        `SELECT id FROM distribution_observations
         WHERE kpi_id = ? AND component_id IS ? AND year = ?
           AND period_type = ? AND period_index = ?`,
      )
      .get(
        input.kpi_id,
        input.component_id,
        input.reporting_year,
        period.period_type,
        period.period_index,
      );
    const before = existing ? readDistribution(Number(existing.id)) : null;
    const bands = input.bands.map((band) =>
      syncDistributionBand(
        band,
        input.kpi_id,
        input.component_id,
        input.reporting_year,
        context,
        actorId,
      ),
    );

    let id: number;
    if (existing) {
      id = Number(existing.id);
      db.prepare(
        `UPDATE distribution_observations SET
           configuration_id = ?, respondent_count = ?,
           categories_mutually_exclusive = ?, notes = ?, source_reference = ?,
           updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(
        configuration.id,
        input.respondent_count,
        input.mutually_exclusive ? 1 : 0,
        input.notes,
        input.source_reference,
        actorId,
        id,
      );
    } else {
      id = Number(
        db.prepare(
          `INSERT INTO distribution_observations (
             kpi_id, component_id, configuration_id, year, period_type,
             period_index, respondent_count, categories_mutually_exclusive,
             notes, source_reference, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          input.kpi_id,
          input.component_id,
          configuration.id,
          input.reporting_year,
          period.period_type,
          period.period_index,
          input.respondent_count,
          input.mutually_exclusive ? 1 : 0,
          input.notes,
          input.source_reference,
          actorId,
        ).lastInsertRowid,
      );
    }

    const requestedBandIds = new Set(bands.map((band) => Number(band.id)));
    const oldValues = db
      .prepare("SELECT id, band_id FROM distribution_values WHERE observation_id = ?")
      .all(id);
    for (const old of oldValues) {
      if (!requestedBandIds.has(Number(old.band_id))) {
        db.prepare("DELETE FROM distribution_values WHERE id = ?").run(Number(old.id));
      }
    }
    const existingValues = new Map(
      db
        .prepare("SELECT * FROM distribution_values WHERE observation_id = ?")
        .all(id)
        .map((row) => [Number(row.band_id), row]),
    );
    for (const [index, band] of bands.entries()) {
      const bandId = Number(band.id);
      const requestedBand = input.bands[index]!;
      const existingValue = existingValues.get(bandId);
      if (existingValue) {
        db.prepare(
          `UPDATE distribution_values SET
             category_count = ?, updated_by = ?, updated_at = datetime('now')
           WHERE id = ?`,
        ).run(requestedBand.count, actorId, Number(existingValue.id));
      } else {
        db.prepare(
          `INSERT INTO distribution_values (
             observation_id, band_id, band_label_snapshot, category_count,
             created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          bandId,
          String(band.label),
          requestedBand.count,
          actorId,
          actorId,
        );
      }
    }
    const after = readDistribution(id);
    if (
      !before ||
      !snapshotsEqual(distributionSnapshot(before), distributionSnapshot(after))
    ) {
      recordStrategicAuditEvent({
        entity_type: "distribution_observation",
        entity_id: id,
        event_type: before ? "update" : "create",
        entity_display_name: component?.label ?? configuration.kpi_name,
        parent_priority_name: configuration.priority_name,
        parent_goal_name: configuration.goal_name,
        previous_value: before ? distributionSnapshot(before) : null,
        new_value: distributionSnapshot(after),
        actor_id: actorId,
        source_reference: input.source_reference,
      });
    }
    return after;
  });
}

export function deleteStrategyDistribution(
  id: number,
  actorId: number | null,
): void {
  transaction(() => {
    const before = readDistribution(id);
    const context = loadAuditContext(before.kpi_id, before.year);
    const componentLabel =
      before.component_id === null
        ? null
        : stringOrNull(
            getDb()
              .prepare("SELECT label FROM kpi_components WHERE id = ?")
              .get(before.component_id)?.label,
          );
    getDb().prepare("DELETE FROM distribution_values WHERE observation_id = ?").run(id);
    getDb().prepare("DELETE FROM distribution_observations WHERE id = ?").run(id);
    recordStrategicAuditEvent({
      entity_type: "distribution_observation",
      entity_id: id,
      event_type: "delete",
      entity_display_name: componentLabel ?? context.kpi_name,
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: distributionSnapshot(before),
      new_value: null,
      actor_id: actorId,
      source_reference: before.source_reference,
    });
  });
}

function asDistributionBandDefinition(
  row: Record<string, unknown>,
): StrategyDistributionBandDefinition {
  return {
    id: Number(row.id),
    kpi_id: Number(row.kpi_id),
    component_id: numberOrNull(row.component_id),
    slug: String(row.slug),
    label: String(row.label),
    effective_from_year: Number(row.effective_from_year),
    effective_to_year: numberOrNull(row.effective_to_year),
    display_order: Number(row.display_order),
    is_unknown: Number(row.is_unknown) === 1,
    is_declined: Number(row.is_declined) === 1,
    derived_group: stringOrNull(row.derived_group) as DistributionDerivedGroup | null,
    archived_at: stringOrNull(row.archived_at),
    created_by: numberOrNull(row.created_by),
    created_at: String(row.created_at),
    updated_by: numberOrNull(row.updated_by),
    updated_at: String(row.updated_at),
  };
}

function getDistributionBandDefinition(
  id: number,
): StrategyDistributionBandDefinition {
  const row = getDb().prepare("SELECT * FROM distribution_bands WHERE id = ?").get(id);
  if (!row) throw new StrategyValueEntryNotFoundError("distribution_band", id);
  return asDistributionBandDefinition(row);
}

function findOverlappingActiveDistributionBand(
  input: DistributionBandDefinitionWrite,
  excludeId?: number,
): Record<string, unknown> | undefined {
  const excludePredicate = excludeId === undefined ? "" : "AND id <> ?";
  const parameters: (number | string | null)[] = [
    input.kpi_id,
    input.component_id,
    input.slug,
    input.effective_from_year,
    input.effective_to_year,
    input.effective_to_year,
  ];
  if (excludeId !== undefined) parameters.push(excludeId);
  return getDb()
    .prepare(
      `SELECT id FROM distribution_bands
       WHERE kpi_id = ? AND component_id IS ? AND slug = ?
         AND archived_at IS NULL
         AND (effective_to_year IS NULL OR effective_to_year >= ?)
         AND (? IS NULL OR effective_from_year <= ?)
         ${excludePredicate}
       LIMIT 1`,
    )
    .get(...parameters);
}

function overlappingDistributionBandError(): StrategyValueEntryValidationError {
  return new StrategyValueEntryValidationError(
    "A distribution band with this slug already overlaps this effective period.",
    [{ path: "slug", message: "Choose a non-overlapping effective period for this band slug." }],
  );
}

function assertDistributionBandOwner(
  kpiId: number,
  componentId: number | null,
  year: number,
): AuditContext {
  const configuration = loadEffectiveConfiguration(kpiId, year);
  let measurementType = configuration.measurement_type;
  if (componentId !== null) {
    const { component } = loadComponent(componentId, year);
    if (component.kpi_id !== kpiId) {
      throw new StrategyValueEntryValidationError(
        "The component does not belong to the supplied KPI.",
        [{ path: "component_id", message: "Choose a component owned by this KPI." }],
      );
    }
    measurementType = component.measurement_type;
  }
  if (measurementType !== "distribution") {
    throw new StrategyValueEntryValidationError(
      "Distribution bands require a distribution KPI or component.",
      [{ path: componentId === null ? "kpi_id" : "component_id", message: "Choose a distribution measurement." }],
    );
  }
  return {
    kpi_name: configuration.kpi_name,
    priority_name: configuration.priority_name,
    goal_name: configuration.goal_name,
  };
}

export interface DistributionBandListOptions {
  kpi_id: number;
  component_id?: number | null;
  reporting_year: number;
  include_archived?: boolean;
}

/** Current effective band definitions for a selected KPI/component and year. */
export function listEffectiveDistributionBands(
  options: DistributionBandListOptions,
): StrategyDistributionBandDefinition[] {
  const componentId = options.component_id ?? null;
  assertDistributionBandOwner(
    options.kpi_id,
    componentId,
    options.reporting_year,
  );
  const archivePredicate = options.include_archived ? "" : "AND archived_at IS NULL";
  return getDb()
    .prepare(
      `SELECT * FROM distribution_bands
       WHERE kpi_id = ? AND component_id IS ?
         AND effective_from_year <= ?
         AND (effective_to_year IS NULL OR effective_to_year >= ?)
         ${archivePredicate}
       ORDER BY display_order, id`,
    )
    .all(
      options.kpi_id,
      componentId,
      options.reporting_year,
      options.reporting_year,
    )
    .map(asDistributionBandDefinition);
}

export function createStrategyDistributionBand(
  rawInput: unknown,
  actorId: number | null,
): StrategyDistributionBandDefinition {
  const input = parsePayload(
    StrategyDistributionBandCreateSchema,
    rawInput,
  ) as DistributionBandDefinitionWrite;
  return transaction(() => {
    const context = assertDistributionBandOwner(
      input.kpi_id,
      input.component_id,
      input.effective_from_year,
    );
    if (findOverlappingActiveDistributionBand(input)) {
      throw overlappingDistributionBandError();
    }
    const id = Number(
      getDb()
        .prepare(
          `INSERT INTO distribution_bands (
             kpi_id, component_id, slug, label, effective_from_year,
             effective_to_year, display_order, is_unknown, is_declined,
             derived_group, created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.kpi_id,
          input.component_id,
          input.slug,
          input.label,
          input.effective_from_year,
          input.effective_to_year,
          input.display_order,
          input.is_unknown ? 1 : 0,
          input.is_declined ? 1 : 0,
          input.derived_group,
          actorId,
          actorId,
        ).lastInsertRowid,
    );
    const after = getDistributionBandDefinition(id);
    recordStrategicAuditEvent({
      entity_type: "distribution_band",
      entity_id: id,
      event_type: "create",
      entity_display_name: after.label,
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: null,
      new_value: bandSnapshot(after as unknown as Record<string, unknown>),
      actor_id: actorId,
    });
    return after;
  });
}

export function updateStrategyDistributionBand(
  rawInput: unknown,
  actorId: number | null,
): StrategyDistributionBandDefinition {
  const input = parsePayload(
    StrategyDistributionBandUpdateSchema,
    rawInput,
  ) as DistributionBandDefinitionUpdate;
  return transaction(() => {
    const before = getDistributionBandDefinition(input.id);
    if (
      before.kpi_id !== input.kpi_id ||
      before.component_id !== input.component_id
    ) {
      throw new StrategyValueEntryValidationError(
        "A distribution band cannot be moved to another KPI or component.",
        [{ path: "kpi_id", message: "Create a new effective band for a different owner." }],
      );
    }
    if (before.archived_at !== null) {
      throw new StrategyValueEntryValidationError(
        "Restore the distribution band before editing it.",
        [{ path: "id", message: "Archived bands are immutable until restored." }],
      );
    }
    const changesCalculationSemantics =
      before.is_unknown !== input.is_unknown ||
      before.is_declined !== input.is_declined ||
      before.derived_group !== input.derived_group;
    if (
      changesCalculationSemantics &&
      getDb()
        .prepare("SELECT 1 FROM distribution_values WHERE band_id = ? LIMIT 1")
        .get(input.id)
    ) {
      throw new StrategyValueEntryValidationError(
        "A reported distribution band cannot change its calculation semantics.",
        [
          {
            path: "derived_group",
            message:
              "End this band's effective period and create a successor band for the new classification.",
          },
        ],
      );
    }
    const context = assertDistributionBandOwner(
      input.kpi_id,
      input.component_id,
      input.effective_from_year,
    );
    if (findOverlappingActiveDistributionBand(input, input.id)) {
      throw overlappingDistributionBandError();
    }
    const proposed = {
      ...before,
      slug: input.slug,
      label: input.label,
      effective_from_year: input.effective_from_year,
      effective_to_year: input.effective_to_year,
      display_order: input.display_order,
      is_unknown: input.is_unknown,
      is_declined: input.is_declined,
      derived_group: input.derived_group,
    };
    if (
      snapshotsEqual(
        bandSnapshot(before as unknown as Record<string, unknown>),
        bandSnapshot(proposed as unknown as Record<string, unknown>),
      )
    ) {
      return before;
    }
    getDb()
      .prepare(
        `UPDATE distribution_bands SET
           slug = ?, label = ?, effective_from_year = ?, effective_to_year = ?,
           display_order = ?, is_unknown = ?, is_declined = ?, derived_group = ?,
           updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        input.slug,
        input.label,
        input.effective_from_year,
        input.effective_to_year,
        input.display_order,
        input.is_unknown ? 1 : 0,
        input.is_declined ? 1 : 0,
        input.derived_group,
        actorId,
        input.id,
      );
    const after = getDistributionBandDefinition(input.id);
    recordStrategicAuditEvent({
      entity_type: "distribution_band",
      entity_id: input.id,
      event_type: "update",
      entity_display_name: after.label,
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: bandSnapshot(before as unknown as Record<string, unknown>),
      new_value: bandSnapshot(after as unknown as Record<string, unknown>),
      actor_id: actorId,
    });
    return after;
  });
}

export function reorderStrategyDistributionBands(
  rawInput: unknown,
  actorId: number | null,
): StrategyDistributionBandDefinition[] {
  const input = parsePayload(
    StrategyDistributionBandReorderSchema,
    rawInput,
  ) as DistributionBandReorder;
  return transaction(() => {
    const context = assertDistributionBandOwner(
      input.kpi_id,
      input.component_id,
      input.reporting_year,
    );
    const current = listEffectiveDistributionBands({
      kpi_id: input.kpi_id,
      component_id: input.component_id,
      reporting_year: input.reporting_year,
    });
    const currentIds = new Set(current.map((band) => band.id));
    const requestedIds = new Set(input.ordered_band_ids);
    if (
      currentIds.size !== requestedIds.size ||
      [...currentIds].some((id) => !requestedIds.has(id))
    ) {
      throw new StrategyValueEntryValidationError(
        "Band reorder must include every active effective band exactly once.",
        [{ path: "ordered_band_ids", message: "Refresh the band list and submit its complete order." }],
      );
    }
    const byId = new Map(current.map((band) => [band.id, band]));
    for (const [displayOrder, id] of input.ordered_band_ids.entries()) {
      const before = byId.get(id)!;
      if (before.display_order === displayOrder) continue;
      getDb()
        .prepare(
          `UPDATE distribution_bands
           SET display_order = ?, updated_by = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(displayOrder, actorId, id);
      const after = getDistributionBandDefinition(id);
      recordStrategicAuditEvent({
        entity_type: "distribution_band",
        entity_id: id,
        event_type: "update",
        entity_display_name: after.label,
        parent_priority_name: context.priority_name,
        parent_goal_name: context.goal_name,
        previous_value: bandSnapshot(before as unknown as Record<string, unknown>),
        new_value: bandSnapshot(after as unknown as Record<string, unknown>),
        actor_id: actorId,
      });
    }
    return listEffectiveDistributionBands({
      kpi_id: input.kpi_id,
      component_id: input.component_id,
      reporting_year: input.reporting_year,
    });
  });
}

function setDistributionBandArchived(
  id: number,
  archived: boolean,
  actorId: number | null,
): StrategyDistributionBandDefinition {
  return transaction(() => {
    const before = getDistributionBandDefinition(id);
    const alreadyDesired = archived
      ? before.archived_at !== null
      : before.archived_at === null;
    if (alreadyDesired) return before;
    if (!archived && findOverlappingActiveDistributionBand(before, before.id)) {
      throw overlappingDistributionBandError();
    }
    const context = loadAuditContext(before.kpi_id, before.effective_from_year);
    getDb()
      .prepare(
        `UPDATE distribution_bands
         SET archived_at = ${archived ? "datetime('now')" : "NULL"},
             updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(actorId, id);
    const after = getDistributionBandDefinition(id);
    recordStrategicAuditEvent({
      entity_type: "distribution_band",
      entity_id: id,
      event_type: archived ? "archive" : "restore",
      entity_display_name: before.label,
      parent_priority_name: context.priority_name,
      parent_goal_name: context.goal_name,
      previous_value: bandSnapshot(before as unknown as Record<string, unknown>),
      new_value: bandSnapshot(after as unknown as Record<string, unknown>),
      actor_id: actorId,
    });
    return after;
  });
}

export function archiveStrategyDistributionBand(
  id: number,
  actorId: number | null,
): StrategyDistributionBandDefinition {
  return setDistributionBandArchived(id, true, actorId);
}

export function restoreStrategyDistributionBand(
  id: number,
  actorId: number | null,
): StrategyDistributionBandDefinition {
  return setDistributionBandArchived(id, false, actorId);
}
