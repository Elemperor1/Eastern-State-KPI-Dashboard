import { describe, expect, it } from "vitest";
import type {
  PersistedMeasurementConfig,
  PersistedTarget,
  StrategyComponentWithTargets,
} from "@/features/strategy";
import type {
  StrategyComponentEntryRecord,
  StrategyDistributionRecord,
  StrategyObservationRecord,
} from "@/features/strategy/server";
import {
  calculateStrategyDistribution,
  calculateStrategyMultiComponent,
  calculateStrategyObservation,
} from "./strategy-actuals";

describe("first-class strategic actual calculations", () => {
  it("recalculates percentage and average results from retained raw inputs", () => {
    const percentage = calculateStrategyObservation(
      observation({
        measurement_type: "percentage",
        numerator: 25,
        denominator: 40,
      }),
      { measurementType: "percentage", precision: 1 },
    );
    const average = calculateStrategyObservation(
      observation({
        measurement_type: "average",
        average_method: "total_score",
        respondent_count: 10,
        total_score: 40,
        total_possible_score: 50,
      }),
      { measurementType: "average", precision: 1 },
    );

    expect(percentage).toMatchObject({
      state: "ok",
      value: 62.5,
      numerator: 25,
      denominator: 40,
    });
    expect(average).toMatchObject({
      state: "ok",
      averageMethod: "total_score",
      value: 80,
      respondentCount: 10,
      numerator: 40,
      denominator: 50,
    });
  });

  it("retains every persisted average formula in the shared result", () => {
    const averageScore = calculateStrategyObservation(
      observation({
        measurement_type: "average",
        average_method: "average_score",
        average_score: 4.2,
        max_score_per_respondent: 5,
      }),
      { measurementType: "average", precision: 1 },
    );
    const percentPositive = calculateStrategyObservation(
      observation({
        measurement_type: "average",
        average_method: "percent_positive",
        positive_response_count: 34,
        total_response_count: 40,
      }),
      { measurementType: "average", precision: 1 },
    );

    expect(averageScore).toMatchObject({
      state: "ok",
      averageMethod: "average_score",
      value: 84,
      numerator: 4.2,
      denominator: 5,
    });
    expect(percentPositive).toMatchObject({
      state: "ok",
      averageMethod: "percent_positive",
      value: 85,
      numerator: 34,
      denominator: 40,
      respondentCount: 40,
    });
  });

  it("uses the shared kernel for milestone and year-over-year results", () => {
    const milestone = calculateStrategyObservation(
      observation({ measurement_type: "milestone", milestone_value: 35 }),
      { measurementType: "milestone", precision: 1 },
    );
    const yearOverYear = calculateStrategyObservation(
      observation({ measurement_type: "year_over_year", scalar_value: 60 }),
      { measurementType: "year_over_year", precision: 1 },
      50,
    );

    expect(milestone).toMatchObject({ value: 35, normalizedPercentage: 35 });
    expect(yearOverYear).toMatchObject({
      value: 20,
      numerator: 10,
      denominator: 50,
    });
  });

  it("uses the configured unit as the explicit direct-ratio scale", () => {
    const percentageRatio = calculateStrategyObservation(
      observation({
        measurement_type: "ratio",
        numerator: 30,
        denominator: 50,
      }),
      { measurementType: "ratio", precision: 1, unit: "%" },
    );
    const unscaledRatio = calculateStrategyObservation(
      observation({
        measurement_type: "ratio",
        numerator: 30,
        denominator: 50,
      }),
      { measurementType: "ratio", precision: 2, unit: "states per state" },
    );

    expect(percentageRatio).toMatchObject({
      state: "ok",
      value: 60,
      normalizedPercentage: 60,
      numerator: 30,
      denominator: 50,
    });
    expect(unscaledRatio).toMatchObject({
      state: "ok",
      value: 0.6,
      normalizedPercentage: null,
    });
  });

  it("preserves cents for direct and component currency inputs", () => {
    const direct = calculateStrategyObservation(
      observation({ measurement_type: "currency", scalar_value: 1.23 }),
      { measurementType: "currency", precision: 1, unit: "USD" },
    );
    const componentResult = calculateStrategyMultiComponent({
      configuration: configuration({ calculation_precision: 1 }),
      components: [
        {
          definition: component(1, "Revenue", {
            measurement_type: "currency",
            unit: "USD",
          }),
          record: componentEntry(1, 1.23),
        },
      ],
    });

    expect(direct).toMatchObject({ state: "ok", precision: 2, value: 1.23 });
    expect(componentResult).toMatchObject({
      state: "ok",
      precision: 1,
      value: 1.2,
    });
    expect(componentResult.components?.[0]?.result).toMatchObject({
      precision: 2,
      value: 1.23,
    });
  });

  it("calculates demographic percentages and only derives explicit non-white bands", () => {
    const result = calculateStrategyDistribution(distribution(), 1);

    expect(result).toMatchObject({
      state: "ok",
      respondentCount: 10,
      distribution: {
        categoryTotal: 10,
        derivedNonWhitePercentage: 40,
      },
    });
    expect(result.distribution?.categories).toEqual([
      expect.objectContaining({ label: "White", percentage: 60 }),
      expect.objectContaining({ label: "People of color", percentage: 40 }),
    ]);
  });

  it("aggregates component raw records through the configured method", () => {
    const result = calculateStrategyMultiComponent({
      configuration: configuration(),
      components: [
        { definition: component(1, "Programs"), record: componentEntry(1, 2) },
        { definition: component(2, "Events"), record: componentEntry(2, 3) },
      ],
    });

    expect(result).toMatchObject({
      state: "ok",
      value: 5,
      aggregationMethod: "sum",
    });
    expect(result.components?.map((item) => item.result.value)).toEqual([2, 3]);
  });

  it("recalculates government support from shared contributed-revenue raw input", () => {
    const result = calculateStrategyMultiComponent({
      configuration: configuration({ aggregation_method: "ratio", unit: "%" }),
      components: [
        {
          definition: component(1, "City government support", {
            measurement_type: "currency",
            unit: "USD",
            aggregation_role: "numerator",
          }),
          record: componentEntry(1, 200.25),
        },
        {
          definition: component(2, "State government support", {
            measurement_type: "currency",
            unit: "USD",
            aggregation_role: "numerator",
          }),
          record: componentEntry(2, 100.25),
        },
        {
          definition: component(3, "Contributed revenue", {
            measurement_type: "currency",
            unit: "USD",
            aggregation_role: "denominator",
          }),
          record: componentEntry(3, 1_200.25),
        },
      ],
    });

    expect(result).toMatchObject({
      state: "ok",
      value: 25,
      normalizedPercentage: 25,
      numerator: 300.5,
      denominator: 1_200.25,
      aggregationMethod: "ratio",
    });
    expect(result.precision).toBe(1);
    expect(result.components?.map((component) => component.result)).toEqual([
      expect.objectContaining({ precision: 2, value: 200.25 }),
      expect.objectContaining({ precision: 2, value: 100.25 }),
      expect.objectContaining({ precision: 2, value: 1_200.25 }),
    ]);
  });

  it("selects the annual component target from a distribution record year", () => {
    const result = calculateStrategyMultiComponent({
      configuration: configuration({ aggregation_method: "none" }),
      components: [
        {
          definition: component(1, "Audience mix", {
            measurement_type: "distribution",
            targets: [
              target({
                id: 2,
                target_scope: "full_plan",
                reporting_year: null,
                target_year: 2029,
                target_value: 90,
              }),
              target({ target_value: 50 }),
            ],
          }),
          record: null,
          distribution: distribution({ component_id: 1, year: 2026 }),
        },
      ],
    });

    expect(result.components?.[0]?.progress).toMatchObject({
      status: "not_started",
      targetValue: 50,
    });
  });

  it("uses the supplied Reporting Year for a KPI Component with no Observation", () => {
    const result = calculateStrategyMultiComponent({
      configuration: configuration({ effective_from_year: 2025 }),
      reportingYear: 2026,
      components: [{
        definition: component(1, "Programs", {
          targets: [
            target({ id: 1, reporting_year: 2025, target_year: 2025, target_value: 5 }),
            target({ id: 2, reporting_year: 2026, target_year: 2026, target_value: 10 }),
          ],
        }),
        record: null,
      }],
    });

    expect(result.components?.[0]?.progress).toMatchObject({
      status: "not_started",
      targetValue: 10,
    });
  });

  it("keeps draft component targets out of progress and resolves active structured targets", () => {
    const draft = calculateStrategyMultiComponent({
      configuration: configuration(),
      components: [
        {
          definition: component(1, "Programs", {
            targets: [target({ target_value: 1, configuration_status: "draft" })],
          }),
          record: componentEntry(1, 2),
        },
      ],
    });
    expect(draft.components?.[0]?.progress).toMatchObject({
      status: "target_not_finalized",
      targetValue: null,
    });

    const structured = calculateStrategyMultiComponent({
      configuration: configuration(),
      components: [
        {
          definition: component(1, "Programs", {
            targets: [
              target({
                target_value: null,
                structured_target: { value: 4 },
                configuration_status: "active",
              }),
            ],
          }),
          record: componentEntry(1, 2),
        },
      ],
    });
    expect(structured.components?.[0]?.progress).toMatchObject({
      targetValue: 4,
      actualProgressPercentage: 50,
    });
  });

  it("does not let an active Target bypass an unresolved KPI Component", () => {
    const result = calculateStrategyMultiComponent({
      configuration: configuration(),
      components: [
        {
          definition: component(1, "Programs", {
            configuration_status: "needs_definition",
            unresolved_question: "Define the component measurement.",
            targets: [target({ target_value: 4, configuration_status: "active" })],
          }),
          record: componentEntry(1, 2),
        },
      ],
    });

    expect(result.components?.[0]?.progress).toMatchObject({
      status: "needs_definition",
      targetValue: 4,
      actualProgressPercentage: null,
    });
  });
});

/** Supports the observation test scenario. */
function observation(
  overrides: Partial<StrategyObservationRecord>,
): StrategyObservationRecord {
  return {
    id: 1,
    kpi_id: 1,
    configuration_id: 1,
    measurement_type: "count",
    reporting_frequency: "annual",
    year: 2026,
    period_type: "annual",
    period_index: 0,
    scalar_value: null,
    numerator: null,
    denominator: null,
    respondent_count: null,
    average_method: null,
    total_score: null,
    average_score: null,
    max_score_per_respondent: null,
    total_possible_score: null,
    positive_response_count: null,
    total_response_count: null,
    boolean_value: null,
    milestone_value: null,
    notes: null,
    source_reference: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Supports the component entry test scenario. */
function componentEntry(
  componentId: number,
  value: number,
): StrategyComponentEntryRecord {
  return {
    ...observation({ id: componentId, scalar_value: value }),
    component_id: componentId,
    component_label: `Component ${componentId}`,
  };
}

/** Supports the configuration test scenario. */
function configuration(
  overrides: Partial<PersistedMeasurementConfig> = {},
): PersistedMeasurementConfig {
  return {
    id: 1,
    kpi_id: 1,
    effective_from_year: 2025,
    effective_to_year: 2029,
    measurement_type: "multi_component",
    unit: "items",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    baseline_value: null,
    reporting_frequency: "annual",
    aggregation_method: "sum",
    board_level_status: "on_track",
    calculation_precision: 1,
    configuration_status: "active",
    unresolved_question: null,
    owner: null,
    due_date: null,
    resolution_notes: null,
    source_reference: null,
    last_reviewed_date: null,
    allow_score_over_max: false,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_by: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Supports the component test scenario. */
function component(
  id: number,
  label: string,
  overrides: Partial<StrategyComponentWithTargets> = {},
): StrategyComponentWithTargets {
  return {
    id,
    kpi_id: 1,
    configuration_id: 1,
    slug: `component-${id}`,
    label,
    measurement_type: "count",
    unit: "items",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    baseline_value: null,
    previous_period_value: null,
    aggregation_role: "value",
    weight: 1,
    display_order: id,
    configuration_status: "active",
    unresolved_question: null,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_by: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    targets: [],
    ...overrides,
  };
}

/** Supports the target test scenario. */
function target(overrides: Partial<PersistedTarget> = {}): PersistedTarget {
  return {
    id: 1,
    kpi_id: null,
    component_id: 1,
    target_scope: "annual",
    reporting_year: 2026,
    target_year: 2026,
    external_target_year: false,
    target_value: null,
    structured_target: null,
    target_description: null,
    baseline_year: null,
    baseline_value: null,
    configuration_status: "active",
    source_reference: null,
    last_reviewed_date: null,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_by: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Supports the distribution test scenario. */
function distribution(
  overrides: Partial<StrategyDistributionRecord> = {},
): StrategyDistributionRecord {
  return {
    id: 1,
    kpi_id: 1,
    component_id: null,
    configuration_id: 1,
    year: 2026,
    period_type: "annual",
    period_index: 0,
    respondent_count: 10,
    mutually_exclusive: true,
    notes: null,
    source_reference: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    bands: [
      {
        id: 1,
        band_id: 1,
        slug: "white",
        current_label: "White",
        label_snapshot: "White",
        count: 6,
        display_order: 0,
        is_unknown: false,
        is_declined: false,
        derived_group: "white",
      },
      {
        id: 2,
        band_id: 2,
        slug: "people-of-color",
        current_label: "People of color",
        label_snapshot: "People of color",
        count: 4,
        display_order: 1,
        is_unknown: false,
        is_declined: false,
        derived_group: "non_white",
      },
    ],
    ...overrides,
  };
}
