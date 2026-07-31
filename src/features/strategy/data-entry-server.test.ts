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

vi.mock("@/features/installation/server", () => ({
  /** Supports the get active installation test scenario. */
  getActiveInstallation: () => ({
    plan: { startYear: 2025, endYear: 2029 },
    years: [2025, 2026, 2027, 2028, 2029],
  }),
}));

import { loadStrategicDataEntryPageData } from "./data-entry-server";

/** Supports the ready goal test scenario. */
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

/** Supports the annual observation test scenario. */
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

  it.each(["draft", "needs_definition", "needs_target"])(
    "withholds the entry form for a %s configuration the write path refuses",
    (configurationStatus) => {
      const goal = readyGoal();
      goal.members[0]!.configuration.configuration_status = configurationStatus;
      listStrategicGoalsMock.mockReturnValue([goal]);

      const data = loadStrategicDataEntryPageData({
        reportingYear: 2027,
        reportingPeriod: "monthly:6",
        requestedKpiId: 7,
      });

      expect(data.kpis).toEqual([
        expect.objectContaining({ id: 7, checklistStatus: "needs_attention" }),
      ]);
      expect(data.selectedKpi).toBeNull();
      expect(data.selectedKpiId).toBe(7);
      expect(data.loadError).toBe(
        "Finish this measure's setup before entering results.",
      );
    },
  );

  it("withholds the entry form for a multi-component measure with no components", () => {
    const goal = readyGoal();
    goal.members[0]!.configuration.measurement_type = "multi_component";
    listStrategicGoalsMock.mockReturnValue([goal]);

    const data = loadStrategicDataEntryPageData({
      reportingYear: 2027,
      reportingPeriod: "annual:0",
      requestedKpiId: 7,
    });

    expect(data.selectedKpi).toBeNull();
    expect(data.loadError).toBe(
      "Finish this measure's setup before entering results.",
    );
  });

  it("offers every month plus full year for an annual measure", () => {
    const data = loadStrategicDataEntryPageData({
      reportingYear: 2027,
      reportingPeriod: "monthly:6",
      requestedKpiId: 7,
    });

    expect(data.reportingPeriods).toHaveLength(13);
    expect(data.reportingPeriods[0]).toMatchObject({
      value: "monthly:1",
      label: "January",
    });
    expect(data.reportingPeriods.at(-1)).toMatchObject({
      value: "annual:0",
      label: "Full year",
    });
    expect(data.reportingPeriod).toMatchObject({
      value: "monthly:6",
      label: "June",
    });
    expect(data.selectedKpi).toMatchObject({
      id: 7,
      reportingFrequency: "flexible",
    });
  });
});
