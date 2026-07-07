import { describe, expect, it } from "vitest";
import { parseThroughMonth, resolveDashboardCompareState } from "./period";

describe("reporting period selection", () => {
  it("accepts valid explicit through-month values", () => {
    expect(parseThroughMonth("3", 2026, new Date("2026-07-07T12:00:00Z"))).toBe(3);
    expect(parseThroughMonth(["11"], 2026, new Date("2026-07-07T12:00:00Z"))).toBe(11);
  });

  it("falls back to the current real-world month for the current year", () => {
    expect(parseThroughMonth(undefined, 2026, new Date("2026-07-07T12:00:00Z"))).toBe(7);
  });

  it("falls back to December for prior or future years", () => {
    const now = new Date("2026-07-07T12:00:00Z");
    expect(parseThroughMonth(undefined, 2025, now)).toBe(12);
    expect(parseThroughMonth("not-a-month", 2027, now)).toBe(12);
  });

  it("resolves dashboard year/month state from URL params and available data years", () => {
    expect(
      resolveDashboardCompareState(
        { currentYear: "2025", compareYear: "2024", currentMonth: "6" },
        [2024, 2025, 2026],
        new Date("2026-07-07T12:00:00Z"),
      ),
    ).toEqual({ currentYear: 2025, compareYear: 2024, currentMonth: 6 });
  });

  it("uses latest data years and a current-year month fallback when URL params are missing", () => {
    expect(
      resolveDashboardCompareState(
        {},
        [2024, 2025, 2026],
        new Date("2026-07-07T12:00:00Z"),
      ),
    ).toEqual({ currentYear: 2026, compareYear: 2025, currentMonth: 7 });
  });
});
