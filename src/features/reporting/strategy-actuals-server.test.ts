import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PersistedMeasurementConfig,
  StrategyComponentWithTargets,
} from "@/features/strategy";
import type {
  StrategyComponentEntryRecord,
  StrategyObservationRecord,
} from "@/features/strategy/server";

const {
  listComponentsForConfigurationMock,
  listEffectiveMeasurementConfigsMock,
  listStrategyComponentEntriesMock,
  listStrategyDistributionsMock,
  listStrategyObservationsMock,
} = vi.hoisted(() => ({
  listComponentsForConfigurationMock: vi.fn(),
  listEffectiveMeasurementConfigsMock: vi.fn(),
  listStrategyComponentEntriesMock: vi.fn(),
  listStrategyDistributionsMock: vi.fn(),
  listStrategyObservationsMock: vi.fn(),
}));

vi.mock("@/features/strategy/server", () => ({
  listComponentsForConfiguration: listComponentsForConfigurationMock,
  listEffectiveMeasurementConfigs: listEffectiveMeasurementConfigsMock,
  listStrategyComponentEntries: listStrategyComponentEntriesMock,
  listStrategyDistributions: listStrategyDistributionsMock,
  listStrategyObservations: listStrategyObservationsMock,
}));

import { listCalculatedStrategyActuals } from "./strategy-actuals-server";

describe("strategy actual server adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listComponentsForConfigurationMock.mockReturnValue([]);
    listStrategyComponentEntriesMock.mockReturnValue([]);
    listStrategyDistributionsMock.mockReturnValue([]);
    listStrategyObservationsMock.mockReturnValue([]);
  });

  it("loads every plan year through the selection and recalculates raw percentages", () => {
    listEffectiveMeasurementConfigsMock.mockImplementation((year: number) =>
      year === 2026 ? [configuration({ measurement_type: "percentage" })] : [],
    );
    listStrategyObservationsMock.mockReturnValue([
      observation({
        measurement_type: "percentage",
        numerator: 25,
        denominator: 40,
      }),
    ]);

    const actuals = listCalculatedStrategyActuals({
      kpiIds: [1],
      throughYear: 2026,
    });

    expect(listEffectiveMeasurementConfigsMock).toHaveBeenCalledTimes(2);
    expect(listEffectiveMeasurementConfigsMock).toHaveBeenNthCalledWith(1, 2025);
    expect(listEffectiveMeasurementConfigsMock).toHaveBeenNthCalledWith(2, 2026);
    expect(actuals).toHaveLength(1);
    expect(actuals[0]).toMatchObject({
      kpiId: 1,
      year: 2026,
      value: 62.5,
      calculation: { numerator: 25, denominator: 40 },
    });
  });

  it("carries the configured percent unit into direct ratio calculation", () => {
    listEffectiveMeasurementConfigsMock.mockImplementation((year: number) =>
      year === 2026
        ? [configuration({
            measurement_type: "ratio",
            unit: "%",
            fixed_denominator: 50,
          })]
        : [],
    );
    listStrategyObservationsMock.mockReturnValue([
      observation({
        measurement_type: "ratio",
        numerator: 30,
        denominator: null,
      }),
    ]);

    const actuals = listCalculatedStrategyActuals({
      kpiIds: [1],
      throughYear: 2026,
    });

    expect(actuals[0]).toMatchObject({
      value: 60,
      calculation: {
        value: 60,
        normalizedPercentage: 60,
        numerator: 30,
        denominator: 50,
      },
    });
  });

  it("preserves cents when loading direct currency actuals", () => {
    listEffectiveMeasurementConfigsMock.mockImplementation((year: number) =>
      year === 2026
        ? [configuration({
            measurement_type: "currency",
            unit: "USD",
            calculation_precision: 1,
          })]
        : [],
    );
    listStrategyObservationsMock.mockReturnValue([
      observation({ measurement_type: "currency", scalar_value: 1.23 }),
    ]);

    const actuals = listCalculatedStrategyActuals({
      kpiIds: [1],
      throughYear: 2026,
    });

    expect(actuals[0]).toMatchObject({
      value: 1.23,
      calculation: { precision: 2, value: 1.23 },
    });
  });

  it("keeps successive first-class years available for cumulative plan progress", () => {
    listEffectiveMeasurementConfigsMock.mockImplementation((year: number) =>
      year === 2025 || year === 2026
        ? [configuration({ measurement_type: "cumulative" })]
        : [],
    );
    listStrategyObservationsMock.mockImplementation(
      ({ reporting_year }: { reporting_year: number }) => [
        observation({
          year: reporting_year,
          measurement_type: "cumulative",
          scalar_value: reporting_year === 2025 ? 2 : 3,
        }),
      ],
    );

    const actuals = listCalculatedStrategyActuals({
      kpiIds: [1],
      throughYear: 2026,
    });

    expect(actuals.map((actual) => [actual.year, actual.value])).toEqual([
      [2025, 2],
      [2026, 3],
    ]);
  });

  it("compares monthly year-over-year Observations with the same prior-year month", () => {
    listEffectiveMeasurementConfigsMock.mockImplementation((year: number) =>
      year === 2025 || year === 2026
        ? [configuration({
            measurement_type: "year_over_year",
            reporting_frequency: "monthly",
          })]
        : [],
    );
    listStrategyObservationsMock.mockImplementation(
      ({ reporting_year }: { reporting_year: number }) => [
        observation({
          id: reporting_year * 10 + 1,
          year: reporting_year,
          measurement_type: "year_over_year",
          reporting_frequency: "monthly",
          period_type: "monthly",
          period_index: 1,
          scalar_value: reporting_year === 2025 ? 100 : 110,
        }),
        observation({
          id: reporting_year * 10 + 2,
          year: reporting_year,
          measurement_type: "year_over_year",
          reporting_frequency: "monthly",
          period_type: "monthly",
          period_index: 2,
          scalar_value: reporting_year === 2025 ? 200 : 300,
        }),
      ],
    );

    const actuals = listCalculatedStrategyActuals({
      kpiIds: [1],
      throughYear: 2026,
    }).filter((actual) => actual.year === 2026);

    expect(actuals.map((actual) => [actual.periodIndex, actual.value])).toEqual([
      [1, 10],
      [2, 50],
    ]);
  });

  it("does not invent a year-over-year base when no strategic prior exists", () => {
    listEffectiveMeasurementConfigsMock.mockImplementation((year: number) =>
      year === 2027
        ? [configuration({
            measurement_type: "year_over_year",
            unit: "%",
            reporting_frequency: "annual",
          })]
        : [],
    );
    listStrategyObservationsMock.mockReturnValue([
      observation({
        year: 2027,
        measurement_type: "year_over_year",
        scalar_value: 5,
      }),
    ]);

    const actuals = listCalculatedStrategyActuals({
      kpiIds: [1],
      throughYear: 2027,
    });

    expect(actuals[0]).toMatchObject({
      value: null,
      calculation: {
        state: "missing",
        issues: [expect.objectContaining({
          code: "MISSING_VALUE",
          field: "previousPeriodValue",
        })],
      },
    });
  });

  it("compares quarterly year-over-year Component Entries with the same prior-year quarter", () => {
    listEffectiveMeasurementConfigsMock.mockImplementation((year: number) =>
      year === 2025 || year === 2026
        ? [configuration({
            measurement_type: "multi_component",
            reporting_frequency: "quarterly",
            aggregation_method: "none",
          })]
        : [],
    );
    listComponentsForConfigurationMock.mockReturnValue([
      component({ measurement_type: "year_over_year" }),
    ]);
    listStrategyComponentEntriesMock.mockImplementation(
      ({ reporting_year }: { reporting_year: number }) => [
        componentEntry({
          id: reporting_year * 10 + 1,
          year: reporting_year,
          period_index: 1,
          scalar_value: reporting_year === 2025 ? 100 : 120,
        }),
        componentEntry({
          id: reporting_year * 10 + 2,
          year: reporting_year,
          period_index: 2,
          scalar_value: reporting_year === 2025 ? 200 : 300,
        }),
      ],
    );

    const actuals = listCalculatedStrategyActuals({
      kpiIds: [1],
      throughYear: 2026,
    }).filter((actual) => actual.year === 2026);

    expect(
      actuals.map((actual) => [
        actual.periodIndex,
        actual.calculation.components?.[0]?.result.value,
      ]),
    ).toEqual([
      [1, 20],
      [2, 50],
    ]);
  });

  it("does not query strategic storage when no selected goal uses a KPI", () => {
    expect(
      listCalculatedStrategyActuals({ kpiIds: [], throughYear: 2026 }),
    ).toEqual([]);
    expect(listEffectiveMeasurementConfigsMock).not.toHaveBeenCalled();
  });
});

function configuration(
  overrides: Partial<PersistedMeasurementConfig> = {},
): PersistedMeasurementConfig {
  return {
    id: 1,
    kpi_id: 1,
    effective_from_year: 2025,
    effective_to_year: 2029,
    measurement_type: "count",
    unit: "items",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    baseline_value: null,
    reporting_frequency: "annual",
    aggregation_method: "none",
    board_level_status: "not_reported",
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

function observation(
  overrides: Partial<StrategyObservationRecord> = {},
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

function component(
  overrides: Partial<StrategyComponentWithTargets> = {},
): StrategyComponentWithTargets {
  return {
    id: 11,
    kpi_id: 1,
    configuration_id: 1,
    slug: "placement-growth",
    label: "Placement growth",
    measurement_type: "year_over_year",
    unit: "%",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    baseline_value: null,
    previous_period_value: null,
    aggregation_role: "value",
    weight: 1,
    display_order: 1,
    configuration_status: "active",
    unresolved_question: null,
    archived_at: null,
    created_by: null,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_by: null,
    updated_at: "2025-01-01T00:00:00.000Z",
    targets: [],
    ...overrides,
  };
}

function componentEntry(
  overrides: Partial<StrategyComponentEntryRecord> = {},
): StrategyComponentEntryRecord {
  return {
    ...observation({
      measurement_type: "year_over_year",
      reporting_frequency: "quarterly",
      period_type: "quarterly",
      period_index: 1,
    }),
    component_id: 11,
    component_label: "Component 11",
    ...overrides,
  };
}
