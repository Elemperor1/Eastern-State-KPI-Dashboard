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
      value: 80,
      respondentCount: 10,
      numerator: 40,
      denominator: 50,
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
});

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

function componentEntry(
  componentId: number,
  value: number,
): StrategyComponentEntryRecord {
  return {
    ...observation({ id: componentId, scalar_value: value }),
    component_id: componentId,
  };
}

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
