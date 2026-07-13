import { describe, expect, it } from "vitest";
import { strategicHistoryPeriodLabel } from "./strategic-history-model";

describe("strategic history labels", () => {
  it.each([
    ["monthly", 2, "February 2026"],
    ["quarterly", 3, "Q3 2026"],
    ["annual", 0, "Annual · 2026"],
    ["cumulative", 0, "Cumulative through 2026"],
    ["one_time", 0, "One-time result · 2026"],
  ] as const)("labels %s observations without exposing storage periods", (periodType, periodIndex, label) => {
    expect(strategicHistoryPeriodLabel({
      year: 2026,
      periodType,
      periodIndex,
    })).toBe(label);
  });

  it("does not turn invalid month zero into January", () => {
    expect(strategicHistoryPeriodLabel({
      year: 2026,
      periodType: "monthly",
      periodIndex: 0,
    })).toBe("Invalid monthly period · 2026");
  });
});
