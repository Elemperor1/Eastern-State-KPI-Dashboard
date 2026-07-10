import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedMeasurementConfig } from "@/features/strategy";
import type { StrategyObservationRecord } from "@/features/strategy/server";

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
