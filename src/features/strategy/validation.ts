import { z } from "zod";
import {
  AGGREGATION_METHODS,
  AVERAGE_INPUT_METHODS,
  BOARD_STATUSES,
  CONFIGURATION_STATUSES,
  DISTRIBUTION_DERIVED_GROUPS,
  GOAL_COMPLETION_RULES,
  GOAL_MANUAL_STATUSES,
  GOAL_MEMBERSHIP_ROLES,
  MEASUREMENT_TYPES,
  PROGRESS_STATES,
  STRATEGY_AUDIT_ACTIONS,
  STRATEGY_AUDIT_ENTITY_TYPES,
  STRATEGY_REPORTING_FREQUENCIES,
  STRATEGIC_PLAN_END_YEAR,
  STRATEGIC_PLAN_START_YEAR,
  TARGET_SCOPES,
  type StrategyJsonValue,
} from "./types";

export const MeasurementTypeSchema = z.enum(MEASUREMENT_TYPES);
export const StrategyReportingFrequencySchema = z.enum(
  STRATEGY_REPORTING_FREQUENCIES,
);
export const ConfigurationStatusSchema = z.enum(CONFIGURATION_STATUSES);
export const EditableConfigurationStatusSchema = z.enum([
  "draft",
  "needs_definition",
  "needs_target",
  "ready",
  "active",
]);
export const BoardStatusSchema = z.enum(BOARD_STATUSES);
export const AggregationMethodSchema = z.enum(AGGREGATION_METHODS);
export const GoalCompletionRuleSchema = z.enum(GOAL_COMPLETION_RULES);
export const GoalManualStatusSchema = z.enum(GOAL_MANUAL_STATUSES);
export const GoalMembershipRoleSchema = z.enum(GOAL_MEMBERSHIP_ROLES);
export const TargetScopeSchema = z.enum(TARGET_SCOPES);
export const ProgressStateSchema = z.enum(PROGRESS_STATES);
export const AverageInputMethodSchema = z.enum(AVERAGE_INPUT_METHODS);
export const StrategyAuditEntityTypeSchema = z.enum(
  STRATEGY_AUDIT_ENTITY_TYPES,
);
export const StrategyAuditActionSchema = z.enum(STRATEGY_AUDIT_ACTIONS);

const IdSchema = z.number().int().positive();
const YearSchema = z.number().int().min(1900).max(2100);
const PlanTargetYearSchema = z
  .number()
  .int()
  .min(STRATEGIC_PLAN_START_YEAR)
  .max(STRATEGIC_PLAN_END_YEAR);
const FiniteNumberSchema = z.number().finite();
const NullableFiniteNumberSchema = FiniteNumberSchema.nullable().optional().default(null);
const NullableIdSchema = IdSchema.nullable().optional().default(null);

const SlugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required.")
  .max(120, "Slug must be 120 characters or fewer.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must use lowercase kebab-case.");
const NameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(200, "Name must be 200 characters or fewer.");
const UnitSchema = z
  .string()
  .trim()
  .min(1, "Unit cannot be blank.")
  .max(80, "Unit must be 80 characters or fewer.")
  .nullable()
  .optional()
  .default(null);

function nullableText(max: number) {
  return z
    .string()
    .trim()
    .min(1, "Use null instead of a blank string.")
    .max(max)
    .nullable()
    .optional()
    .default(null);
}

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD.")
  .refine(
    (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
    "Date must be valid.",
  );
const NullableIsoDateSchema = IsoDateSchema.nullable().optional().default(null);
const NullableIsoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional()
  .default(null);

const EffectiveYearShape = {
  effective_start_year: YearSchema,
  effective_end_year: YearSchema.nullable().optional().default(null),
};

function validateEffectiveYearRange(
  value: { effective_start_year: number; effective_end_year: number | null },
  ctx: z.RefinementCtx,
): void {
  if (
    value.effective_end_year !== null &&
    value.effective_start_year > value.effective_end_year
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effective_end_year"],
      message: "Effective end year must be on or after the start year.",
    });
  }
}

const ConfigurationGapShape = {
  configuration_status: ConfigurationStatusSchema.default("draft"),
  unresolved_question: nullableText(2_000),
  owner: nullableText(200),
  due_date: NullableIsoDateSchema,
  resolution_notes: nullableText(4_000),
  source_reference: nullableText(2_000),
  last_reviewed_date: NullableIsoDateSchema,
};

function validateConfigurationGap(
  value: {
    configuration_status: z.infer<typeof ConfigurationStatusSchema>;
    unresolved_question: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    (value.configuration_status === "needs_definition" ||
      value.configuration_status === "needs_target") &&
    value.unresolved_question === null
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unresolved_question"],
      message: "An unresolved question is required for unresolved configuration.",
    });
  }
}

export const StrategicGoalInputSchema = z
  .object({
    priority_id: IdSchema,
    slug: SlugSchema,
    name: NameSchema,
    description: nullableText(4_000),
    completion_rule: GoalCompletionRuleSchema.default("all_required_kpis"),
    threshold_count: z.number().int().positive().nullable().optional().default(null),
    threshold_percentage: z
      .number()
      .finite()
      .gt(0)
      .max(100)
      .nullable()
      .optional()
      .default(null),
    manual_status: GoalManualStatusSchema.nullable().optional().default(null),
    board_level_status: BoardStatusSchema.default("not_reported"),
    display_order: z.number().int().nonnegative().default(0),
    ...EffectiveYearShape,
    ...ConfigurationGapShape,
  })
  .strict()
  .superRefine((goal, ctx) => {
    validateEffectiveYearRange(goal, ctx);
    validateConfigurationGap(goal, ctx);

    const hasCount = goal.threshold_count !== null;
    const hasPercentage = goal.threshold_percentage !== null;
    if (goal.completion_rule === "threshold_count") {
      if (hasCount === hasPercentage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["threshold_count"],
          message:
            "Threshold-count goals require exactly one count or percentage threshold.",
        });
      }
    } else if (hasCount || hasPercentage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completion_rule"],
        message: "Threshold fields are valid only for threshold_count goals.",
      });
    }

    if (goal.completion_rule === "manual_status") {
      if (goal.manual_status === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["manual_status"],
          message: "Manual-status goals require a manual status.",
        });
      }
    } else if (goal.manual_status !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manual_status"],
        message: "Manual status is valid only for manual_status goals.",
      });
    }
  });

export const StrategicGoalMembershipInputSchema = z
  .object({
    goal_id: IdSchema,
    kpi_id: IdSchema,
    role: GoalMembershipRoleSchema.default("required"),
    weight: z.number().finite().positive().nullable().optional().default(null),
    display_order: z.number().int().nonnegative().default(0),
    ...EffectiveYearShape,
  })
  .strict()
  .superRefine(validateEffectiveYearRange);

/** Existing-membership settings that an admin may change without rewriting history. */
export const StrategicGoalMembershipUpdateSchema = z
  .object({
    id: IdSchema,
    role: GoalMembershipRoleSchema.optional(),
    weight: z.number().finite().positive().optional(),
    display_order: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine(requirePatch);

type MeasurementDefinition = {
  measurement_type: z.infer<typeof MeasurementTypeSchema>;
  numerator_label: string | null;
  denominator_label: string | null;
  fixed_denominator: number | null;
};

function validateRatioDefinition(
  value: MeasurementDefinition,
  ctx: z.RefinementCtx,
): void {
  if (value.measurement_type !== "ratio" && value.measurement_type !== "percentage") {
    return;
  }
  if (value.numerator_label === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["numerator_label"],
      message: `${value.measurement_type} measurements require a numerator label.`,
    });
  }
  if (value.denominator_label === null && value.fixed_denominator === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["denominator_label"],
      message:
        `${value.measurement_type} measurements require a denominator label ` +
        "or a positive fixed denominator.",
    });
  }
}

export const MeasurementConfigInputSchema = z
  .object({
    kpi_id: IdSchema,
    measurement_type: MeasurementTypeSchema,
    unit: UnitSchema,
    numerator_label: nullableText(200),
    denominator_label: nullableText(200),
    fixed_denominator: z.number().finite().positive().nullable().optional().default(null),
    baseline_value: FiniteNumberSchema.nullable().optional().default(null),
    reporting_frequency: StrategyReportingFrequencySchema,
    aggregation_method: AggregationMethodSchema.default("none"),
    board_level_status: BoardStatusSchema.default("not_reported"),
    calculation_precision: z.number().int().min(0).max(6).default(1),
    allow_score_over_max: z.boolean().default(false),
    ...EffectiveYearShape,
    ...ConfigurationGapShape,
  })
  .strict()
  .superRefine((config, ctx) => {
    validateEffectiveYearRange(config, ctx);
    validateConfigurationGap(config, ctx);

    const complete =
      config.configuration_status === "ready" ||
      config.configuration_status === "active";
    if (complete) {
      validateRatioDefinition(config, ctx);
      if (config.reporting_frequency === "flexible") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reporting_frequency"],
          message: "Ready and active configurations require an explicit frequency.",
        });
      }
    }

    if (
      config.measurement_type !== "multi_component" &&
      config.aggregation_method !== "none"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aggregation_method"],
        message: "Only multi-component KPIs may define component aggregation.",
      });
    }
  });

export const RawAverageInputsSchema = z
  .object({
    method: AverageInputMethodSchema,
    respondent_count: z.number().int().nonnegative().nullable().optional().default(null),
    total_score: z.number().finite().nonnegative().nullable().optional().default(null),
    average_score: z.number().finite().nonnegative().nullable().optional().default(null),
    max_score_per_respondent: z
      .number()
      .finite()
      .positive()
      .nullable()
      .optional()
      .default(null),
    total_possible_score: z
      .number()
      .finite()
      .positive()
      .nullable()
      .optional()
      .default(null),
    positive_response_count: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional()
      .default(null),
    total_response_count: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional()
      .default(null),
    allow_over_max: z.boolean().default(false),
  })
  .strict()
  .superRefine((raw, ctx) => {
    if (raw.method === "percent_positive") {
      if (raw.positive_response_count === null || raw.total_response_count === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["positive_response_count"],
          message: "Percent-positive inputs require positive and total response counts.",
        });
      } else if (raw.positive_response_count > raw.total_response_count) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["positive_response_count"],
          message: "Positive responses cannot exceed total responses.",
        });
      }
      return;
    }

    if (raw.respondent_count === null || raw.respondent_count < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["respondent_count"],
        message: "Score averages require a positive respondent count.",
      });
    }

    if (raw.method === "average_score") {
      if (raw.average_score === null || raw.max_score_per_respondent === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["average_score"],
          message: "Average-score inputs require an average and maximum scale value.",
        });
      } else if (
        !raw.allow_over_max &&
        raw.average_score > raw.max_score_per_respondent
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["average_score"],
          message: "Average score cannot exceed the maximum scale value.",
        });
      }
      return;
    }

    if (raw.total_score === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total_score"],
        message: "Total-score inputs require a total score.",
      });
      return;
    }
    const derivedMaximum =
      raw.total_possible_score ??
      (raw.respondent_count !== null && raw.max_score_per_respondent !== null
        ? raw.respondent_count * raw.max_score_per_respondent
        : null);
    if (derivedMaximum === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total_possible_score"],
        message:
          "Total-score inputs require total possible score or respondent count plus max score.",
      });
    } else if (!raw.allow_over_max && raw.total_score > derivedMaximum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total_score"],
        message: "Total score cannot exceed the maximum possible score.",
      });
    }
  });

export const ObservationInputSchema = z
  .object({
    kpi_id: IdSchema,
    component_id: NullableIdSchema,
    measurement_type: MeasurementTypeSchema,
    reporting_frequency: StrategyReportingFrequencySchema,
    reporting_year: YearSchema,
    reporting_month: z.number().int().min(0).max(12).nullable().optional().default(null),
    reporting_quarter: z.number().int().min(1).max(4).nullable().optional().default(null),
    value: NullableFiniteNumberSchema,
    numerator: z.number().finite().nonnegative().nullable().optional().default(null),
    denominator: z.number().finite().nonnegative().nullable().optional().default(null),
    fixed_denominator: z.number().finite().positive().nullable().optional().default(null),
    average_inputs: RawAverageInputsSchema.nullable().optional().default(null),
    baseline_value: NullableFiniteNumberSchema,
    previous_period_value: NullableFiniteNumberSchema,
    notes: nullableText(4_000),
    source_reference: nullableText(2_000),
    observed_at: NullableIsoDateTimeSchema,
  })
  .strict()
  .superRefine((observation, ctx) => {
    if (
      observation.reporting_frequency === "monthly" &&
      (observation.reporting_month === null || observation.reporting_month === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reporting_month"],
        message: "Monthly observations require a calendar month from 1 through 12.",
      });
    }
    if (
      observation.reporting_frequency === "annual" &&
      observation.reporting_month !== null &&
      observation.reporting_month !== 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reporting_month"],
        message: "Annual observations may use only the internal month-0 period.",
      });
    }
    if (
      observation.reporting_frequency === "quarterly" &&
      observation.reporting_quarter === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reporting_quarter"],
        message: "Quarterly observations require a quarter from 1 through 4.",
      });
    }

    if (
      observation.measurement_type === "percentage" ||
      observation.measurement_type === "ratio"
    ) {
      if (observation.numerator === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["numerator"],
          message: "Percentage and ratio observations require a raw numerator.",
        });
      }
      if (observation.denominator === null && observation.fixed_denominator === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["denominator"],
          message: "Percentage and ratio observations require a denominator.",
        });
      }
      if (observation.value !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "Store raw numerator and denominator, not a calculated result.",
        });
      }
      return;
    }

    if (observation.measurement_type === "average") {
      if (observation.average_inputs === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["average_inputs"],
          message: "Average observations require raw average inputs.",
        });
      }
      if (observation.value !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "Store raw average inputs, not a calculated result.",
        });
      }
      return;
    }

    if (
      observation.measurement_type === "distribution" ||
      observation.measurement_type === "multi_component"
    ) {
      if (observation.value !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "Distribution and multi-component values use their normalized records.",
        });
      }
      return;
    }

    if (observation.value === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `${observation.measurement_type} observations require a value.`,
      });
    } else if (
      observation.measurement_type === "binary" &&
      observation.value !== 0 &&
      observation.value !== 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Binary observations must be 0 or 1.",
      });
    }
  });

export const TargetInputSchema = z
  .object({
    kpi_id: IdSchema,
    component_id: NullableIdSchema,
    measurement_type: MeasurementTypeSchema,
    scope: TargetScopeSchema,
    target_value: NullableFiniteNumberSchema,
    target_description: nullableText(4_000),
    target_year: YearSchema,
    is_external_target: z.boolean().default(false),
    ...EffectiveYearShape,
  })
  .strict()
  .superRefine((target, ctx) => {
    validateEffectiveYearRange(target, ctx);
    if (
      !target.is_external_target &&
      !PlanTargetYearSchema.safeParse(target.target_year).success
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_year"],
        message: "Strategic-plan target year must be between 2025 and 2029.",
      });
    }
    if (
      target.target_year < target.effective_start_year ||
      (target.effective_end_year !== null &&
        target.target_year > target.effective_end_year)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_year"],
        message: "Target year must fall inside its effective-year range.",
      });
    }
    if (target.target_value === null && target.target_description === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_value"],
        message: "Provide a numeric target or a target description.",
      });
    }
    if (target.measurement_type !== "binary" && target.target_value === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_value"],
        message: "Non-binary targets require a numeric target value.",
      });
    }
    if (
      target.measurement_type === "percentage" &&
      target.target_value !== null &&
      (target.target_value < 0 || target.target_value > 100)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_value"],
        message: "Percentage targets must be between 0 and 100.",
      });
    }
  });

export const ComponentInputSchema = z
  .object({
    parent_kpi_id: IdSchema,
    slug: SlugSchema,
    label: NameSchema,
    measurement_type: MeasurementTypeSchema,
    unit: UnitSchema,
    numerator_label: nullableText(200),
    denominator_label: nullableText(200),
    fixed_denominator: z.number().finite().positive().nullable().optional().default(null),
    value: NullableFiniteNumberSchema,
    baseline_value: NullableFiniteNumberSchema,
    previous_period_value: NullableFiniteNumberSchema,
    target_value: NullableFiniteNumberSchema,
    annual_target_value: NullableFiniteNumberSchema,
    target_year: PlanTargetYearSchema.nullable().optional().default(null),
    target_description: nullableText(4_000),
    weight: z.number().finite().positive().nullable().optional().default(null),
    display_order: z.number().int().nonnegative(),
    configuration_status: ConfigurationStatusSchema.default("draft"),
    ...EffectiveYearShape,
  })
  .strict()
  .superRefine((component, ctx) => {
    validateEffectiveYearRange(component, ctx);
    const complete =
      component.configuration_status === "ready" ||
      component.configuration_status === "active";
    if (complete) validateRatioDefinition(component, ctx);

    const hasTarget =
      component.target_value !== null ||
      component.annual_target_value !== null ||
      component.target_description !== null;
    if (hasTarget && component.target_year === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_year"],
        message: "Configured component targets require a target year.",
      });
    }
    if (
      complete &&
      component.measurement_type !== "binary" &&
      component.target_value === null &&
      component.annual_target_value === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_value"],
        message: "Ready and active non-binary components require a numeric target.",
      });
    }
    if (
      complete &&
      component.measurement_type === "binary" &&
      component.target_value === null &&
      component.target_description === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_description"],
        message: "Binary components require a target value or description.",
      });
    }
  });

export const ComponentSetInputSchema = z
  .object({
    parent_kpi_id: IdSchema,
    aggregation_method: AggregationMethodSchema,
    components: z.array(ComponentInputSchema).min(1).max(100),
  })
  .strict()
  .superRefine((set, ctx) => {
    const slugs = new Set<string>();
    const orders = new Set<number>();
    for (const [index, component] of set.components.entries()) {
      if (component.parent_kpi_id !== set.parent_kpi_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components", index, "parent_kpi_id"],
          message: "Every component must belong to the component set's parent KPI.",
        });
      }
      if (slugs.has(component.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components", index, "slug"],
          message: "Component slugs must be unique within a parent KPI.",
        });
      }
      slugs.add(component.slug);
      if (orders.has(component.display_order)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components", index, "display_order"],
          message: "Component display order values must be unique.",
        });
      }
      orders.add(component.display_order);
    }

    if (set.aggregation_method === "weighted_average") {
      if (set.components.some((component) => component.weight === null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components"],
          message: "Weighted averages require a positive weight for every component.",
        });
      }
    }

    if (
      set.aggregation_method === "average" ||
      set.aggregation_method === "weighted_average" ||
      set.aggregation_method === "sum"
    ) {
      const units = new Set(set.components.map((component) => component.unit));
      if (units.size !== 1 || units.has(null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components"],
          message: `${set.aggregation_method} aggregation requires one compatible unit.`,
        });
      }
      if (set.aggregation_method !== "sum") {
        const types = new Set(
          set.components.map((component) => component.measurement_type),
        );
        if (types.size !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["components"],
            message: "Average aggregation requires compatible measurement types.",
          });
        }
      }
    }
  });

export const DistributionCategoryInputSchema = z
  .object({
    key: SlugSchema,
    label: NameSchema,
    count: z.number().int().nonnegative(),
    display_order: z.number().int().nonnegative(),
    derived_group: z
      .enum(DISTRIBUTION_DERIVED_GROUPS)
      .nullable()
      .optional()
      .default(null),
    is_archived: z.boolean().default(false),
  })
  .strict();

export const DistributionInputSchema = z
  .object({
    kpi_id: IdSchema,
    component_id: NullableIdSchema,
    reporting_year: YearSchema,
    reporting_month: z.number().int().min(0).max(12).nullable().optional().default(null),
    respondent_count: z.number().int().nonnegative(),
    mutually_exclusive: z.boolean().default(true),
    categories: z.array(DistributionCategoryInputSchema).min(1).max(100),
    notes: nullableText(4_000),
    source_reference: nullableText(2_000),
  })
  .strict()
  .superRefine((distribution, ctx) => {
    const keys = new Set<string>();
    const labels = new Set<string>();
    const orders = new Set<number>();
    const active = distribution.categories.filter((category) => !category.is_archived);

    for (const [index, category] of distribution.categories.entries()) {
      const normalizedLabel = category.label.toLocaleLowerCase();
      if (keys.has(category.key) || labels.has(normalizedLabel)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categories", index, "label"],
          message: "Distribution category keys and labels must be unique.",
        });
      }
      keys.add(category.key);
      labels.add(normalizedLabel);
      if (orders.has(category.display_order)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categories", index, "display_order"],
          message: "Distribution display order values must be unique.",
        });
      }
      orders.add(category.display_order);

      if (!category.is_archived && category.count > distribution.respondent_count) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categories", index, "count"],
          message: "A category count cannot exceed the respondent total.",
        });
      }
    }

    if (distribution.mutually_exclusive) {
      const categoryTotal = active.reduce((sum, category) => sum + category.count, 0);
      if (categoryTotal !== distribution.respondent_count) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categories"],
          message:
            "Mutually exclusive category counts must equal the respondent total, including unknown or declined responses.",
        });
      }
    }
  });

const StrategyJsonValueSchema: z.ZodType<StrategyJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(StrategyJsonValueSchema),
    z.record(StrategyJsonValueSchema),
  ]),
);

function patchNullableText(max: number) {
  return z
    .string()
    .trim()
    .min(1, "Use null instead of a blank string.")
    .max(max)
    .nullable()
    .optional();
}

const PatchUnitSchema = z
  .string()
  .trim()
  .min(1, "Unit cannot be blank.")
  .max(80)
  .nullable()
  .optional();

const ConfigurationGapPatchShape = {
  configuration_status: EditableConfigurationStatusSchema.optional(),
  unresolved_question: patchNullableText(2_000),
  owner: patchNullableText(200),
  due_date: IsoDateSchema.nullable().optional(),
  resolution_notes: patchNullableText(4_000),
  source_reference: patchNullableText(2_000),
  last_reviewed_date: IsoDateSchema.nullable().optional(),
};

function requirePatch(
  value: Record<string, unknown>,
  ctx: z.RefinementCtx,
): void {
  if (Object.keys(value).every((key) => key === "id")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide at least one field to update.",
    });
  }
}

export const MeasurementConfigurationCreateSchema = MeasurementConfigInputSchema.superRefine(
  (config, ctx) => {
    if (config.configuration_status === "archived") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["configuration_status"],
        message:
          "Create the configuration first, then use the archive lifecycle action.",
      });
    }
  },
);

export const MeasurementConfigurationUpdateSchema = z
  .object({
    id: IdSchema,
    effective_start_year: YearSchema.optional(),
    effective_end_year: YearSchema.nullable().optional(),
    measurement_type: MeasurementTypeSchema.optional(),
    unit: PatchUnitSchema,
    numerator_label: patchNullableText(200),
    denominator_label: patchNullableText(200),
    fixed_denominator: z.number().finite().positive().nullable().optional(),
    baseline_value: FiniteNumberSchema.nullable().optional(),
    reporting_frequency: StrategyReportingFrequencySchema.optional(),
    aggregation_method: AggregationMethodSchema.optional(),
    board_level_status: BoardStatusSchema.optional(),
    calculation_precision: z.number().int().min(0).max(6).optional(),
    allow_score_over_max: z.boolean().optional(),
    ...ConfigurationGapPatchShape,
  })
  .strict()
  .superRefine(requirePatch);

export const StrategicGoalSettingsUpdateSchema = z
  .object({
    id: IdSchema,
    completion_rule: GoalCompletionRuleSchema.optional(),
    threshold_count: z.number().int().positive().nullable().optional(),
    threshold_percentage: z.number().finite().gt(0).max(100).nullable().optional(),
    manual_status: GoalManualStatusSchema.nullable().optional(),
    board_level_status: BoardStatusSchema.optional(),
    ...ConfigurationGapPatchShape,
  })
  .strict()
  .superRefine(requirePatch);

const StrategicTargetShape = {
  kpi_id: IdSchema.nullable().optional(),
  component_id: IdSchema.nullable().optional(),
  target_scope: TargetScopeSchema,
  reporting_year: YearSchema.nullable().optional().default(null),
  target_year: YearSchema,
  external_target_year: z.boolean().default(false),
  target_value: FiniteNumberSchema.nullable().optional().default(null),
  structured_target: z
    .record(StrategyJsonValueSchema)
    .nullable()
    .optional()
    .default(null),
  target_description: nullableText(4_000),
  baseline_year: YearSchema.nullable().optional().default(null),
  baseline_value: FiniteNumberSchema.nullable().optional().default(null),
  configuration_status: EditableConfigurationStatusSchema.default("draft"),
  source_reference: nullableText(2_000),
  last_reviewed_date: NullableIsoDateSchema,
};

export const StrategicTargetCreateSchema = z
  .object(StrategicTargetShape)
  .strict()
  .superRefine((target, ctx) => {
    const hasKpi = target.kpi_id !== null && target.kpi_id !== undefined;
    const hasComponent =
      target.component_id !== null && target.component_id !== undefined;
    if (hasKpi === hasComponent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["kpi_id"],
        message: "Provide exactly one KPI or component target subject.",
      });
    }
    if (target.target_scope === "annual") {
      if (target.reporting_year === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reporting_year"],
          message: "Annual targets require a reporting year.",
        });
      } else if (target.reporting_year !== target.target_year) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["target_year"],
          message: "Annual target and reporting years must match.",
        });
      }
    } else if (target.reporting_year !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reporting_year"],
        message: "Full-plan targets do not use a reporting year.",
      });
    }
    if (
      !target.external_target_year &&
      !PlanTargetYearSchema.safeParse(target.target_year).success
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_year"],
        message: "Strategic-plan target year must be between 2025 and 2029.",
      });
    }
    if (target.baseline_year !== null && target.baseline_year >= target.target_year) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baseline_year"],
        message: "Baseline year must precede the target year.",
      });
    }
    if (
      target.target_value === null &&
      target.structured_target === null &&
      target.target_description === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_value"],
        message: "Provide a numeric, structured, or descriptive target.",
      });
    }
  });

export const StrategicTargetUpdateSchema = z
  .object({
    id: IdSchema,
    target_scope: TargetScopeSchema.optional(),
    reporting_year: YearSchema.nullable().optional(),
    target_year: YearSchema.optional(),
    external_target_year: z.boolean().optional(),
    target_value: FiniteNumberSchema.nullable().optional(),
    structured_target: z.record(StrategyJsonValueSchema).nullable().optional(),
    target_description: patchNullableText(4_000),
    baseline_year: YearSchema.nullable().optional(),
    baseline_value: FiniteNumberSchema.nullable().optional(),
    configuration_status: EditableConfigurationStatusSchema.optional(),
    source_reference: patchNullableText(2_000),
    last_reviewed_date: IsoDateSchema.nullable().optional(),
  })
  .strict()
  .superRefine(requirePatch);

export const StrategyComponentCreateSchema = z
  .object({
    configuration_id: IdSchema,
    slug: SlugSchema,
    label: NameSchema,
    measurement_type: MeasurementTypeSchema,
    unit: UnitSchema,
    numerator_label: nullableText(200),
    denominator_label: nullableText(200),
    fixed_denominator: z.number().finite().positive().nullable().optional().default(null),
    baseline_value: FiniteNumberSchema.nullable().optional().default(null),
    previous_period_value: FiniteNumberSchema.nullable().optional().default(null),
    weight: z.number().finite().positive().default(1),
    display_order: z.number().int().nonnegative(),
    configuration_status: EditableConfigurationStatusSchema.default("draft"),
    unresolved_question: nullableText(2_000),
  })
  .strict()
  .superRefine((component, ctx) => {
    validateConfigurationGap(component, ctx);
    if (
      component.configuration_status === "ready" ||
      component.configuration_status === "active"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["configuration_status"],
        message: "Create the component as draft, then add its target before activation.",
      });
    }
  });

export const StrategyComponentUpdateSchema = z
  .object({
    id: IdSchema,
    label: NameSchema.optional(),
    measurement_type: MeasurementTypeSchema.optional(),
    unit: PatchUnitSchema,
    numerator_label: patchNullableText(200),
    denominator_label: patchNullableText(200),
    fixed_denominator: z.number().finite().positive().nullable().optional(),
    baseline_value: FiniteNumberSchema.nullable().optional(),
    previous_period_value: FiniteNumberSchema.nullable().optional(),
    weight: z.number().finite().positive().optional(),
    display_order: z.number().int().nonnegative().optional(),
    configuration_status: EditableConfigurationStatusSchema.optional(),
    unresolved_question: patchNullableText(2_000),
  })
  .strict()
  .superRefine(requirePatch);

export const StrategyComponentReorderSchema = z
  .object({
    configuration_id: IdSchema,
    ordered_component_ids: z.array(IdSchema).min(1).max(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (new Set(input.ordered_component_ids).size !== input.ordered_component_ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ordered_component_ids"],
        message: "Component reorder ids must be unique.",
      });
    }
  });

export const StrategyEntityLifecycleSchema = z
  .object({ id: IdSchema })
  .strict();

export const StrategyAuditEventInputSchema = z
  .object({
    entity_type: StrategyAuditEntityTypeSchema,
    entity_id: IdSchema,
    action: StrategyAuditActionSchema,
    entity_display_name: NameSchema,
    parent_priority_id: NullableIdSchema,
    parent_priority_name: nullableText(200),
    parent_goal_id: NullableIdSchema,
    parent_goal_name: nullableText(200),
    previous_value: StrategyJsonValueSchema.nullable().optional().default(null),
    new_value: StrategyJsonValueSchema.nullable().optional().default(null),
    actor_id: NullableIdSchema,
    actor_display_name: nullableText(200),
    actor_email: z.string().trim().email().max(320).nullable().optional().default(null),
    occurred_at: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((event, ctx) => {
    if ((event.parent_priority_id === null) !== (event.parent_priority_name === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parent_priority_name"],
        message: "Priority snapshot id and name must be provided together.",
      });
    }
    if ((event.parent_goal_id === null) !== (event.parent_goal_name === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parent_goal_name"],
        message: "Goal snapshot id and name must be provided together.",
      });
    }
    if (
      event.actor_id !== null &&
      event.actor_display_name === null &&
      event.actor_email === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actor_display_name"],
        message: "Actor snapshots require a display name or email.",
      });
    }

    const requiresPrevious =
      event.action === "update" ||
      event.action === "archive" ||
      event.action === "restore" ||
      event.action === "status_change" ||
      event.action === "delete";
    const requiresNew =
      event.action === "create" ||
      event.action === "update" ||
      event.action === "archive" ||
      event.action === "restore" ||
      event.action === "status_change";
    if (requiresPrevious && event.previous_value === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previous_value"],
        message: `${event.action} audit events require the previous snapshot.`,
      });
    }
    if (requiresNew && event.new_value === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["new_value"],
        message: `${event.action} audit events require the new snapshot.`,
      });
    }
  });

// Short aliases keep route/service call sites readable while retaining the
// domain-specific names for documentation and discovery.
export const GoalInputSchema = StrategicGoalInputSchema;
export const GoalMembershipInputSchema = StrategicGoalMembershipInputSchema;
export const AverageRawInputsSchema = RawAverageInputsSchema;
export const AuditEventInputSchema = StrategyAuditEventInputSchema;

export type ValidatedStrategicGoalInput = z.output<typeof StrategicGoalInputSchema>;
export type ValidatedGoalMembershipInput = z.output<
  typeof StrategicGoalMembershipInputSchema
>;
export type ValidatedGoalMembershipUpdate = z.output<
  typeof StrategicGoalMembershipUpdateSchema
>;
export type ValidatedMeasurementConfigInput = z.output<
  typeof MeasurementConfigInputSchema
>;
export type ValidatedRawAverageInputs = z.output<typeof RawAverageInputsSchema>;
export type ValidatedObservationInput = z.output<typeof ObservationInputSchema>;
export type ValidatedTargetInput = z.output<typeof TargetInputSchema>;
export type ValidatedComponentInput = z.output<typeof ComponentInputSchema>;
export type ValidatedDistributionInput = z.output<typeof DistributionInputSchema>;
export type ValidatedAuditEventInput = z.output<
  typeof StrategyAuditEventInputSchema
>;
export type ValidatedMeasurementConfigurationCreate = z.output<
  typeof MeasurementConfigurationCreateSchema
>;
export type ValidatedMeasurementConfigurationUpdate = z.output<
  typeof MeasurementConfigurationUpdateSchema
>;
export type ValidatedStrategicGoalSettingsUpdate = z.output<
  typeof StrategicGoalSettingsUpdateSchema
>;
export type ValidatedStrategicTargetCreate = z.output<
  typeof StrategicTargetCreateSchema
>;
export type ValidatedStrategicTargetUpdate = z.output<
  typeof StrategicTargetUpdateSchema
>;
export type ValidatedStrategyComponentCreate = z.output<
  typeof StrategyComponentCreateSchema
>;
export type ValidatedStrategyComponentUpdate = z.output<
  typeof StrategyComponentUpdateSchema
>;
export type ValidatedStrategyComponentReorder = z.output<
  typeof StrategyComponentReorderSchema
>;
