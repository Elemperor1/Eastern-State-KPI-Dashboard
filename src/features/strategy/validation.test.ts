import { describe, expect, it } from "vitest";
import {
  AGGREGATION_METHODS,
  BOARD_STATUSES,
  CONFIGURATION_STATUSES,
  GOAL_COMPLETION_RULES,
  GOAL_MEMBERSHIP_ROLES,
  MEASUREMENT_TYPES,
  PROGRESS_STATES,
  STRATEGY_REPORTING_FREQUENCIES,
  TARGET_SCOPES,
  type ComponentInput,
  type DistributionInput,
  type MeasurementConfigInput,
  type StrategicGoalInput,
  type TargetInput,
} from "./types";
import {
  ComponentInputSchema,
  ComponentSetInputSchema,
  DistributionInputSchema,
  MeasurementConfigInputSchema,
  ObservationInputSchema,
  RawAverageInputsSchema,
  StrategicGoalInputSchema,
  StrategicGoalMembershipInputSchema,
  StrategyAuditEventInputSchema,
  TargetInputSchema,
} from "./validation";

const effectiveYears = {
  effective_start_year: 2025,
  effective_end_year: 2029,
};

function goal(overrides: Record<string, unknown> = {}) {
  return {
    priority_id: 1,
    slug: "visitor-experience",
    name: "Improve the visitor experience",
    description: null,
    completion_rule: "all_required_kpis",
    configuration_status: "active",
    unresolved_question: null,
    owner: "Strategy team",
    due_date: null,
    resolution_notes: null,
    source_reference: null,
    last_reviewed_date: "2026-07-09",
    ...effectiveYears,
    ...overrides,
  };
}

function measurement(overrides: Record<string, unknown> = {}) {
  return {
    kpi_id: 10,
    measurement_type: "count",
    unit: "projects",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    reporting_frequency: "annual",
    aggregation_method: "none",
    calculation_precision: 1,
    configuration_status: "active",
    board_level_status: "on_track",
    unresolved_question: null,
    owner: null,
    due_date: null,
    resolution_notes: null,
    source_reference: null,
    last_reviewed_date: null,
    ...effectiveYears,
    ...overrides,
  };
}

function target(overrides: Record<string, unknown> = {}) {
  return {
    kpi_id: 10,
    component_id: null,
    measurement_type: "count",
    scope: "full_plan",
    target_value: 5,
    target_description: "Complete five upgrades by 2029",
    target_year: 2029,
    is_external_target: false,
    ...effectiveYears,
    ...overrides,
  };
}

function observation(overrides: Record<string, unknown> = {}) {
  return {
    kpi_id: 10,
    component_id: null,
    measurement_type: "count",
    reporting_frequency: "annual",
    reporting_year: 2026,
    reporting_month: 0,
    reporting_quarter: null,
    value: 3,
    numerator: null,
    denominator: null,
    fixed_denominator: null,
    average_inputs: null,
    baseline_value: null,
    previous_period_value: null,
    notes: null,
    source_reference: null,
    observed_at: null,
    ...overrides,
  };
}

function component(
  overrides: Record<string, unknown> = {},
  parentKpiId = 10,
) {
  return {
    parent_kpi_id: parentKpiId,
    slug: "completed-projects",
    label: "Completed projects",
    measurement_type: "count",
    unit: "projects",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    value: 2,
    baseline_value: 0,
    previous_period_value: 1,
    target_value: 5,
    annual_target_value: 1,
    target_year: 2029,
    target_description: "Complete five projects",
    weight: null,
    display_order: 0,
    configuration_status: "active",
    ...effectiveYears,
    ...overrides,
  };
}

function distribution(overrides: Record<string, unknown> = {}) {
  return {
    kpi_id: 10,
    component_id: null,
    reporting_year: 2026,
    reporting_month: 0,
    respondent_count: 10,
    mutually_exclusive: true,
    categories: [
      {
        key: "white",
        label: "White",
        count: 4,
        display_order: 0,
        derived_group: "white",
        is_archived: false,
      },
      {
        key: "non-white",
        label: "Non-white audiences",
        count: 5,
        display_order: 1,
        derived_group: "non_white",
        is_archived: false,
      },
      {
        key: "declined",
        label: "Declined",
        count: 1,
        display_order: 2,
        derived_group: null,
        is_archived: false,
      },
    ],
    notes: null,
    source_reference: null,
    ...overrides,
  };
}

describe("strategy domain enums and compile-time inputs", () => {
  it("defines the requested closed vocabularies plus legacy flexible frequency", () => {
    expect(MEASUREMENT_TYPES).toEqual([
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
    expect(STRATEGY_REPORTING_FREQUENCIES).toContain("flexible");
    expect(CONFIGURATION_STATUSES).toEqual([
      "draft",
      "needs_definition",
      "needs_target",
      "ready",
      "active",
      "archived",
    ]);
    expect(GOAL_COMPLETION_RULES).toHaveLength(4);
    expect(GOAL_MEMBERSHIP_ROLES).toEqual(["required", "informational"]);
    expect(TARGET_SCOPES).toEqual(["annual", "full_plan"]);
    expect(PROGRESS_STATES).toEqual([
      "not_started",
      "in_progress",
      "complete",
      "exceeded",
      "target_not_finalized",
      "needs_definition",
    ]);
    expect(BOARD_STATUSES).toContain("at_risk");
    expect(AGGREGATION_METHODS).toEqual([
      "none",
      "average",
      "weighted_average",
      "sum",
      "all_complete",
    ]);
  });

  it("keeps record inputs structurally aligned with the schemas", () => {
    const typedGoal = goal() as StrategicGoalInput;
    const typedMeasurement = measurement() as MeasurementConfigInput;
    const typedTarget = target() as TargetInput;
    const typedComponent = component() as ComponentInput;
    const typedDistribution = distribution() as DistributionInput;

    expect(StrategicGoalInputSchema.safeParse(typedGoal).success).toBe(true);
    expect(MeasurementConfigInputSchema.safeParse(typedMeasurement).success).toBe(true);
    expect(TargetInputSchema.safeParse(typedTarget).success).toBe(true);
    expect(ComponentInputSchema.safeParse(typedComponent).success).toBe(true);
    expect(DistributionInputSchema.safeParse(typedDistribution).success).toBe(true);
  });
});

describe("strategic goal and membership validation", () => {
  it("trims bounded text and rejects whitespace-only values or unknown fields", () => {
    const parsed = StrategicGoalInputSchema.parse(
      goal({ slug: "  visitor-experience  ", name: "  Visitor experience  " }),
    );
    expect(parsed.slug).toBe("visitor-experience");
    expect(parsed.name).toBe("Visitor experience");
    expect(StrategicGoalInputSchema.safeParse(goal({ name: "   " })).success).toBe(false);
    expect(StrategicGoalInputSchema.safeParse(goal({ unexpected: true })).success).toBe(false);
  });

  it("validates threshold-count and manual-status rule parameters", () => {
    expect(
      StrategicGoalInputSchema.safeParse(
        goal({ completion_rule: "threshold_count", threshold_count: 3 }),
      ).success,
    ).toBe(true);
    expect(
      StrategicGoalInputSchema.safeParse(
        goal({
          completion_rule: "threshold_count",
          threshold_count: 3,
          threshold_percentage: 75,
        }),
      ).success,
    ).toBe(false);
    expect(
      StrategicGoalInputSchema.safeParse(
        goal({ completion_rule: "manual_status", manual_status: null }),
      ).success,
    ).toBe(false);
    expect(
      StrategicGoalInputSchema.safeParse(
        goal({ completion_rule: "manual_status", manual_status: "complete" }),
      ).success,
    ).toBe(true);
  });

  it("requires unresolved context and ordered effective-year ranges", () => {
    expect(
      StrategicGoalInputSchema.safeParse(
        goal({ configuration_status: "needs_target", unresolved_question: null }),
      ).success,
    ).toBe(false);
    expect(
      StrategicGoalInputSchema.safeParse(
        goal({
          configuration_status: "needs_target",
          unresolved_question: "What is the 2029 target?",
        }),
      ).success,
    ).toBe(true);
    expect(
      StrategicGoalInputSchema.safeParse(
        goal({ effective_start_year: 2029, effective_end_year: 2025 }),
      ).success,
    ).toBe(false);
  });

  it("accepts required/informational memberships and rejects invalid weights/ranges", () => {
    expect(
      StrategicGoalMembershipInputSchema.safeParse({
        goal_id: 1,
        kpi_id: 2,
        role: "informational",
        weight: null,
        display_order: 1,
        ...effectiveYears,
      }).success,
    ).toBe(true);
    expect(
      StrategicGoalMembershipInputSchema.safeParse({
        goal_id: 1,
        kpi_id: 2,
        role: "required",
        weight: 0,
        display_order: 1,
        ...effectiveYears,
      }).success,
    ).toBe(false);
  });
});

describe("measurement configuration validation", () => {
  it("requires ratio/percentage raw-field definitions when ready or active", () => {
    expect(
      MeasurementConfigInputSchema.safeParse(
        measurement({ measurement_type: "percentage", unit: "%" }),
      ).success,
    ).toBe(false);
    expect(
      MeasurementConfigInputSchema.safeParse(
        measurement({
          measurement_type: "ratio",
          unit: "states",
          numerator_label: "States represented",
          fixed_denominator: 50,
        }),
      ).success,
    ).toBe(true);
    expect(
      MeasurementConfigInputSchema.safeParse(
        measurement({
          measurement_type: "percentage",
          configuration_status: "needs_definition",
          unresolved_question: "Which response denominator applies?",
        }),
      ).success,
    ).toBe(true);
  });

  it("reserves aggregation for multi-component KPIs and explicit frequencies for complete configs", () => {
    expect(
      MeasurementConfigInputSchema.safeParse(
        measurement({ aggregation_method: "sum" }),
      ).success,
    ).toBe(false);
    expect(
      MeasurementConfigInputSchema.safeParse(
        measurement({
          measurement_type: "multi_component",
          aggregation_method: "weighted_average",
        }),
      ).success,
    ).toBe(true);
    expect(
      MeasurementConfigInputSchema.safeParse(
        measurement({ reporting_frequency: "flexible" }),
      ).success,
    ).toBe(false);
  });

  it("rejects non-positive fixed denominators and out-of-range precision", () => {
    expect(
      MeasurementConfigInputSchema.safeParse(
        measurement({ fixed_denominator: 0 }),
      ).success,
    ).toBe(false);
    expect(
      MeasurementConfigInputSchema.safeParse(
        measurement({ calculation_precision: 7 }),
      ).success,
    ).toBe(false);
  });
});

describe("target validation", () => {
  it("preserves a zero target while rejecting a genuinely missing non-binary target", () => {
    const zero = TargetInputSchema.parse(target({ target_value: 0 }));
    expect(zero.target_value).toBe(0);
    expect(
      TargetInputSchema.safeParse(
        target({ target_value: null, target_description: "Target not finalized" }),
      ).success,
    ).toBe(false);
  });

  it("allows a binary target description without a number", () => {
    expect(
      TargetInputSchema.safeParse(
        target({
          measurement_type: "binary",
          target_value: null,
          target_description: "Board adopts the plan by 2027",
          target_year: 2027,
        }),
      ).success,
    ).toBe(true);
  });

  it("accepts decimal percentages and rejects percentages outside 0-100", () => {
    expect(
      TargetInputSchema.safeParse(
        target({ measurement_type: "percentage", target_value: 87.5 }),
      ).success,
    ).toBe(true);
    expect(
      TargetInputSchema.safeParse(
        target({ measurement_type: "percentage", target_value: 100.1 }),
      ).success,
    ).toBe(false);
  });

  it("limits normal target years to 2025-2029 and permits explicit external targets", () => {
    expect(TargetInputSchema.safeParse(target({ target_year: 2030 })).success).toBe(false);
    expect(
      TargetInputSchema.safeParse(
        target({
          target_year: 2030,
          is_external_target: true,
          effective_start_year: 2025,
          effective_end_year: 2030,
        }),
      ).success,
    ).toBe(true);
  });
});

describe("raw average and observation validation", () => {
  it("validates total score against maximum possible unless explicitly allowed", () => {
    const raw = {
      method: "total_score",
      respondent_count: 10,
      total_score: 51,
      average_score: null,
      max_score_per_respondent: 5,
      total_possible_score: 50,
      positive_response_count: null,
      total_response_count: null,
      allow_over_max: false,
    };
    expect(RawAverageInputsSchema.safeParse(raw).success).toBe(false);
    expect(
      RawAverageInputsSchema.safeParse({ ...raw, allow_over_max: true }).success,
    ).toBe(true);
  });

  it("distinguishes average-score and percent-positive inputs", () => {
    expect(
      RawAverageInputsSchema.safeParse({
        method: "average_score",
        respondent_count: 20,
        average_score: 4.2,
        max_score_per_respondent: 5,
      }).success,
    ).toBe(true);
    expect(
      RawAverageInputsSchema.safeParse({
        method: "average_score",
        respondent_count: 20,
        average_score: 5.1,
        max_score_per_respondent: 5,
      }).success,
    ).toBe(false);
    expect(
      RawAverageInputsSchema.safeParse({
        method: "percent_positive",
        positive_response_count: 11,
        total_response_count: 10,
      }).success,
    ).toBe(false);
  });

  it("requires raw numerators/denominators and does not accept stored calculated percentages", () => {
    expect(
      ObservationInputSchema.safeParse(
        observation({
          measurement_type: "percentage",
          numerator: 40,
          denominator: 50,
          value: null,
        }),
      ).success,
    ).toBe(true);
    expect(
      ObservationInputSchema.safeParse(
        observation({
          measurement_type: "percentage",
          numerator: 40,
          denominator: 50,
          value: 80,
        }),
      ).success,
    ).toBe(false);
    expect(
      ObservationInputSchema.safeParse(
        observation({
          measurement_type: "ratio",
          numerator: 20,
          denominator: null,
          fixed_denominator: 50,
          value: null,
        }),
      ).success,
    ).toBe(true);
  });

  it("requires raw average inputs and validates binary values", () => {
    expect(
      ObservationInputSchema.safeParse(
        observation({
          measurement_type: "average",
          value: null,
          average_inputs: {
            method: "total_score",
            respondent_count: 10,
            total_score: 40,
            total_possible_score: 50,
          },
        }),
      ).success,
    ).toBe(true);
    expect(
      ObservationInputSchema.safeParse(
        observation({ measurement_type: "binary", value: 2 }),
      ).success,
    ).toBe(false);
    expect(
      ObservationInputSchema.safeParse(
        observation({ measurement_type: "binary", value: 0 }),
      ).success,
    ).toBe(true);
  });

  it("enforces monthly, quarterly, and annual period conventions", () => {
    expect(
      ObservationInputSchema.safeParse(
        observation({ reporting_frequency: "monthly", reporting_month: null }),
      ).success,
    ).toBe(false);
    expect(
      ObservationInputSchema.safeParse(
        observation({
          reporting_frequency: "quarterly",
          reporting_month: null,
          reporting_quarter: 2,
        }),
      ).success,
    ).toBe(true);
    expect(ObservationInputSchema.safeParse(observation()).success).toBe(true);
    expect(
      ObservationInputSchema.safeParse(
        observation({ reporting_frequency: "annual", reporting_month: 1 }),
      ).success,
    ).toBe(false);
  });
});

describe("component and aggregation validation", () => {
  it("allows qualitative binary targets and requires numeric ready non-binary targets", () => {
    expect(
      ComponentInputSchema.safeParse(
        component({
          measurement_type: "binary",
          target_value: null,
          annual_target_value: null,
          target_description: "Complete the milestone",
        }),
      ).success,
    ).toBe(true);
    expect(
      ComponentInputSchema.safeParse(
        component({
          target_value: null,
          annual_target_value: null,
          target_description: "Target pending",
        }),
      ).success,
    ).toBe(false);
  });

  it("requires compatible units/types for averages and weights for weighted averages", () => {
    const first = component({ weight: 1 });
    const incompatible = component(
      {
        slug: "satisfaction",
        label: "Satisfaction",
        measurement_type: "average",
        unit: "score",
        weight: 1,
        display_order: 1,
      },
      10,
    );
    expect(
      ComponentSetInputSchema.safeParse({
        parent_kpi_id: 10,
        aggregation_method: "average",
        components: [first, incompatible],
      }).success,
    ).toBe(false);

    const second = component({
      slug: "planned-projects",
      label: "Planned projects",
      display_order: 1,
      weight: null,
    });
    expect(
      ComponentSetInputSchema.safeParse({
        parent_kpi_id: 10,
        aggregation_method: "weighted_average",
        components: [first, second],
      }).success,
    ).toBe(false);
    expect(
      ComponentSetInputSchema.safeParse({
        parent_kpi_id: 10,
        aggregation_method: "weighted_average",
        components: [first, { ...second, weight: 2 }],
      }).success,
    ).toBe(true);
  });

  it("preserves component identity and ordering", () => {
    expect(
      ComponentSetInputSchema.safeParse({
        parent_kpi_id: 10,
        aggregation_method: "none",
        components: [
          component(),
          component({ label: "Duplicate", display_order: 0 }),
        ],
      }).success,
    ).toBe(false);
  });
});

describe("distribution validation", () => {
  it("accepts complete mutually exclusive categories including declined responses", () => {
    const parsed = DistributionInputSchema.parse(distribution());
    expect(parsed.categories.reduce((sum, category) => sum + category.count, 0)).toBe(
      parsed.respondent_count,
    );
    expect(parsed.categories.some((category) => category.derived_group === "non_white")).toBe(
      true,
    );
  });

  it("rejects mutually exclusive totals that do not match respondents", () => {
    const value = distribution();
    value.categories[0].count = 3;
    expect(DistributionInputSchema.safeParse(value).success).toBe(false);
  });

  it("allows non-exclusive totals above respondents but no individual category above total", () => {
    const value = distribution({ mutually_exclusive: false });
    value.categories[0].count = 8;
    value.categories[1].count = 9;
    expect(DistributionInputSchema.safeParse(value).success).toBe(true);
    value.categories[1].count = 11;
    expect(DistributionInputSchema.safeParse(value).success).toBe(false);
  });

  it("excludes archived bands from current exclusive totals and rejects duplicate labels/order", () => {
    const withArchived = distribution();
    withArchived.categories.push({
      key: "legacy-band",
      label: "Legacy band",
      count: 99,
      display_order: 3,
      derived_group: null,
      is_archived: true,
    });
    expect(DistributionInputSchema.safeParse(withArchived).success).toBe(true);

    const duplicate = distribution();
    duplicate.categories[1].label = "white";
    duplicate.categories[1].display_order = 0;
    expect(DistributionInputSchema.safeParse(duplicate).success).toBe(false);
  });
});

describe("strategy audit event validation", () => {
  const updateEvent = {
    entity_type: "target",
    entity_id: 7,
    action: "update",
    entity_display_name: "Visitor amenity target",
    parent_priority_id: 1,
    parent_priority_name: "Reimagine Visitor Experience",
    parent_goal_id: 3,
    parent_goal_name: "Improve visitor amenities",
    previous_value: { target_value: 4 },
    new_value: { target_value: 5 },
    actor_id: 2,
    actor_display_name: "Kerry Sautner",
    actor_email: "kerry@easternstate.org",
    occurred_at: "2026-07-09T12:00:00.000Z",
  };

  it("accepts immutable parent, actor, and before/after snapshots", () => {
    expect(StrategyAuditEventInputSchema.safeParse(updateEvent).success).toBe(true);
  });

  it("requires snapshots appropriate to the action", () => {
    expect(
      StrategyAuditEventInputSchema.safeParse({
        ...updateEvent,
        action: "create",
        previous_value: null,
        new_value: null,
      }).success,
    ).toBe(false);
    expect(
      StrategyAuditEventInputSchema.safeParse({
        ...updateEvent,
        action: "delete",
        previous_value: { target_value: 5 },
        new_value: null,
      }).success,
    ).toBe(true);

    for (const action of ["archive", "restore", "status_change"] as const) {
      expect(
        StrategyAuditEventInputSchema.safeParse({
          ...updateEvent,
          action,
          previous_value: null,
        }).success,
      ).toBe(false);
      expect(
        StrategyAuditEventInputSchema.safeParse({
          ...updateEvent,
          action,
          new_value: null,
        }).success,
      ).toBe(false);
      expect(
        StrategyAuditEventInputSchema.safeParse({
          ...updateEvent,
          action,
        }).success,
      ).toBe(true);
    }
  });

  it("accepts every entity type emitted by normalized value-entry mutations", () => {
    for (const entity_type of [
      "kpi_observation",
      "kpi_component_entry",
      "distribution_band",
      "distribution_observation",
    ] as const) {
      expect(
        StrategyAuditEventInputSchema.safeParse({
          ...updateEvent,
          entity_type,
        }).success,
      ).toBe(true);
    }
  });

  it("requires parent snapshot ids and names together", () => {
    expect(
      StrategyAuditEventInputSchema.safeParse({
        ...updateEvent,
        parent_goal_name: null,
      }).success,
    ).toBe(false);
  });
});
