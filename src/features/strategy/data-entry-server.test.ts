import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listEffectiveDistributionBandsMock,
  listStrategicGoalsMock,
  listStrategyComponentEntriesMock,
  listStrategyDistributionsMock,
  listStrategyObservationsMock,
} = vi.hoisted(() => ({
  listEffectiveDistributionBandsMock: vi.fn(),
  listStrategicGoalsMock: vi.fn(),
  listStrategyComponentEntriesMock: vi.fn(),
  listStrategyDistributionsMock: vi.fn(),
  listStrategyObservationsMock: vi.fn(),
}));

vi.mock("./server", () => ({
  listEffectiveDistributionBands: listEffectiveDistributionBandsMock,
  listStrategicGoals: listStrategicGoalsMock,
  listStrategyComponentEntries: listStrategyComponentEntriesMock,
  listStrategyDistributions: listStrategyDistributionsMock,
  listStrategyObservations: listStrategyObservationsMock,
}));

import { loadStrategicDataEntryPageData } from "./data-entry-server";

function readyGoal() {
  return {
    id: 1,
    name: "Broaden programming",
    priority_name: "Reimagine Visitor Experience",
    members: [{
      id: 2,
      kpi_id: 7,
      kpi: {
        id: 7,
        slug: "visitor-reach",
        name: "Visitor reach",
        unit: "visits",
      },
      configuration: {
        id: 3,
        measurement_type: "count",
        reporting_frequency: "annual",
        configuration_status: "ready",
        unit: "visits",
        numerator_label: null,
        denominator_label: null,
        fixed_denominator: null,
        calculation_precision: 0,
      },
      components: [],
    }],
  };
}

function annualObservation() {
  return {
    id: 9,
    kpi_id: 7,
    year: 2027,
    period_type: "annual",
    period_index: 0,
    measurement_type: "count",
    reporting_frequency: "annual",
    scalar_value: 12,
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
  };
}

describe("strategic Data Entry server model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listStrategicGoalsMock.mockReturnValue([readyGoal()]);
    listEffectiveDistributionBandsMock.mockReturnValue([]);
    listStrategyComponentEntriesMock.mockReturnValue([]);
    listStrategyDistributionsMock.mockReturnValue([]);
    listStrategyObservationsMock.mockReturnValue([]);
  });

  it("keeps a ready measure available but not started before a record exists", () => {
    const data = loadStrategicDataEntryPageData({
      reportingYear: 2027,
      reportingPeriod: "annual:0",
      requestedKpiId: 7,
    });

    expect(data.selectedKpi).toMatchObject({
      id: 7,
      configurationStatus: "ready",
    });
    expect(data.kpis).toEqual([
      expect.objectContaining({ id: 7, checklistStatus: "not_started" }),
    ]);
  });

  it("marks a ready measure complete after its selected-cycle record exists", () => {
    listStrategyObservationsMock.mockReturnValue([annualObservation()]);

    const data = loadStrategicDataEntryPageData({
      reportingYear: 2027,
      reportingPeriod: "annual:0",
      requestedKpiId: 7,
    });

    expect(data.kpis).toEqual([
      expect.objectContaining({ id: 7, checklistStatus: "complete" }),
    ]);
  });
});
