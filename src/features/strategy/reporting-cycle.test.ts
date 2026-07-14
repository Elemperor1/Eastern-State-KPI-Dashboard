import { describe, expect, it } from "vitest";
import {
  buildReportingCycleOptions,
  isReportingItemComplete,
  reportingCycleForSelection,
  reportingCycleMatchesFrequency,
  reportingRecordMatchesCycle,
} from "./reporting-cycle";

describe("reporting cycle", () => {
  it("builds one clear selection list for the frequencies that are due", () => {
    const options = buildReportingCycleOptions(
      ["monthly", "quarterly", "annual", "flexible"],
      2027,
    );

    expect(options).toHaveLength(17);
    expect(options[0]).toMatchObject({ value: "monthly:1", label: "January" });
    expect(options[12]).toMatchObject({ value: "quarterly:1", label: "Q1" });
    expect(options.at(-1)).toMatchObject({ value: "annual:0", label: "Full year" });
  });

  it("names cumulative and one-time reporting cycles without technical codes", () => {
    const options = buildReportingCycleOptions(["cumulative", "one_time"], 2028);
    expect(options).toEqual([
      {
        value: "cumulative:0",
        label: "Cumulative through 2028",
        periodType: "cumulative",
        periodIndex: 0,
      },
      {
        value: "one_time:0",
        label: "One-time result (2028)",
        periodType: "one_time",
        periodIndex: 0,
      },
    ]);
  });

  it("uses a valid requested cycle and falls back without exposing storage zero", () => {
    const options = buildReportingCycleOptions(["monthly", "annual"], 2027);
    expect(reportingCycleForSelection("monthly:6", options)).toMatchObject({
      periodType: "monthly",
      periodIndex: 6,
      label: "June",
    });
    expect(reportingCycleForSelection("annual:0", options).label).toBe("Full year");
    expect(reportingCycleForSelection("bad", options).value).toBe("annual:0");
    expect(reportingCycleForSelection("bad", options.slice(0, 1)).value).toBe("monthly:1");
    expect(reportingCycleForSelection(undefined, []).value).toBe("annual:0");
  });

  it("shows measures only in a compatible cycle", () => {
    expect(reportingCycleMatchesFrequency("monthly", "monthly")).toBe(true);
    expect(reportingCycleMatchesFrequency("quarterly", "monthly")).toBe(false);
    expect(reportingCycleMatchesFrequency("flexible", "monthly")).toBe(true);
    expect(reportingCycleMatchesFrequency("flexible", "annual")).toBe(true);
    expect(reportingCycleMatchesFrequency("flexible", "quarterly")).toBe(false);
    expect(reportingCycleMatchesFrequency(null, "annual")).toBe(true);
  });

  it("matches durable records to the exact selected period", () => {
    const cycle = reportingCycleForSelection(
      "monthly:4",
      buildReportingCycleOptions(["monthly"], 2027),
    );
    expect(
      reportingRecordMatchesCycle({ period_type: "monthly", period_index: 4 }, cycle),
    ).toBe(true);
    expect(
      reportingRecordMatchesCycle({ period_type: "monthly", period_index: 3 }, cycle),
    ).toBe(false);
  });

  it("requires every active component before a multi-component item is complete", () => {
    const cycle = reportingCycleForSelection(
      "annual:0",
      buildReportingCycleOptions(["annual"], 2027),
    );
    const saved = { period_type: "annual" as const, period_index: 0 };

    expect(
      isReportingItemComplete({
        measurementType: "multi_component",
        cycle,
        records: [],
        components: [
          { id: 1, records: [saved] },
          { id: 2, records: [] },
        ],
      }),
    ).toBe(false);
    expect(
      isReportingItemComplete({
        measurementType: "multi_component",
        cycle,
        records: [],
        components: [
          { id: 1, records: [saved] },
          { id: 2, records: [saved] },
        ],
      }),
    ).toBe(true);
  });

  it("marks a single-input item complete only for the selected cycle", () => {
    const cycle = reportingCycleForSelection(
      "quarterly:2",
      buildReportingCycleOptions(["quarterly"], 2027),
    );
    expect(
      isReportingItemComplete({
        measurementType: "count",
        cycle,
        records: [{ period_type: "quarterly", period_index: 2 }],
        components: [],
      }),
    ).toBe(true);
    expect(
      isReportingItemComplete({
        measurementType: "count",
        cycle,
        records: [{ period_type: "quarterly", period_index: 1 }],
        components: [],
      }),
    ).toBe(false);
  });
});
