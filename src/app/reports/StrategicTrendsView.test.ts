import { describe, expect, it } from "vitest";
import { resolveStrategicTrendSelection } from "./StrategicTrendsView";

describe("Strategic Trends selection", () => {
  it("keeps a valid choice and replaces a stale choice with a series that has data", () => {
    const series = [
      { kpiId: 20, points: [{ value: null }] },
      { kpiId: 21, points: [{ value: 8 }] },
    ];

    expect(resolveStrategicTrendSelection(series, 20)).toBe(20);
    expect(resolveStrategicTrendSelection(series, 99)).toBe(21);
    expect(resolveStrategicTrendSelection([], 99)).toBe(0);
  });
});
