import { describe, expect, it } from "vitest";
import {
  FLEXIBLE_PERIOD_MODES,
  STRATEGY_MONTH_LABELS,
  STRATEGY_QUARTER_LABELS,
  allowedReportingPeriodOptions,
  defaultReportingPeriod,
  reportingPeriodElapsedFraction,
  reportingPeriodForYear,
  reportingPeriodLabel,
  reportingPeriodStorageIndex,
  validateReportingPeriod,
  type StrategyReportingPeriod,
} from "./periods";

const NOW = new Date(2027, 6, 15, 12, 0, 0);

function valid(input: unknown): StrategyReportingPeriod {
  const result = validateReportingPeriod(input);
  expect(result.success, JSON.stringify(result.issues)).toBe(true);
  if (!result.success) throw new Error("Expected a valid reporting period.");
  return result.period;
}

function issueCodes(input: unknown): string[] {
  const result = validateReportingPeriod(input);
  expect(result.success).toBe(false);
  return result.success ? [] : result.issues.map((issue) => issue.code);
}

describe("strategic reporting periods", () => {
  describe("monthly periods", () => {
    it("exposes all twelve calendar labels and storage indexes", () => {
      expect(STRATEGY_MONTH_LABELS).toEqual([
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ]);
      expect(allowedReportingPeriodOptions({ reportingFrequency: "monthly" }, 2027)).toEqual(
        STRATEGY_MONTH_LABELS.map((label, index) => ({
          value: index + 1,
          storageIndex: index + 1,
          label,
        })),
      );
    });

    it("validates named and generic month input, labels it, and calculates elapsed time", () => {
      const named = valid({
        reportingFrequency: "monthly",
        reportingYear: 2027,
        reportingMonth: 3,
      });
      const generic = valid({
        reportingFrequency: "monthly",
        reportingYear: 2027,
        periodIndex: 3,
      });

      expect(named).toEqual(generic);
      expect(reportingPeriodLabel(named)).toBe("March 2027");
      expect(reportingPeriodStorageIndex(named)).toBe(3);
      expect(reportingPeriodElapsedFraction(named)).toBe(0.25);
    });

    it("defaults past/current/future selected years to December/current month/January", () => {
      expect(
        defaultReportingPeriod(
          { reportingFrequency: "monthly", reportingYear: 2026 },
          NOW,
        ).periodIndex,
      ).toBe(12);
      expect(
        defaultReportingPeriod(
          { reportingFrequency: "monthly", reportingYear: 2027 },
          NOW,
        ).periodIndex,
      ).toBe(7);
      expect(
        defaultReportingPeriod(
          { reportingFrequency: "monthly", reportingYear: 2028 },
          NOW,
        ).periodIndex,
      ).toBe(1);
    });
  });

  describe("quarterly periods", () => {
    it("exposes Q1-Q4, validates selection, and maps elapsed fractions", () => {
      expect(STRATEGY_QUARTER_LABELS).toEqual(["Q1", "Q2", "Q3", "Q4"]);
      expect(
        allowedReportingPeriodOptions({ reportingFrequency: "quarterly" }, 2027),
      ).toEqual([
        { value: 1, storageIndex: 1, label: "Q1" },
        { value: 2, storageIndex: 2, label: "Q2" },
        { value: 3, storageIndex: 3, label: "Q3" },
        { value: 4, storageIndex: 4, label: "Q4" },
      ]);

      const period = valid({
        reportingFrequency: "quarterly",
        reportingYear: 2027,
        reportingQuarter: 3,
      });
      expect(reportingPeriodLabel(period)).toBe("Q3 2027");
      expect(reportingPeriodStorageIndex(period)).toBe(3);
      expect(reportingPeriodElapsedFraction(period)).toBe(0.75);
    });

    it("defaults past/current/future selected years to Q4/current quarter/Q1", () => {
      expect(
        defaultReportingPeriod(
          { reportingFrequency: "quarterly", reportingYear: 2026 },
          NOW,
        ).periodIndex,
      ).toBe(4);
      expect(
        defaultReportingPeriod(
          { reportingFrequency: "quarterly", reportingYear: 2027 },
          NOW,
        ).periodIndex,
      ).toBe(3);
      expect(
        defaultReportingPeriod(
          { reportingFrequency: "quarterly", reportingYear: 2028 },
          NOW,
        ).periodIndex,
      ).toBe(1);
    });
  });

  describe("single-period frequencies", () => {
    it.each([
      ["annual", "Full year 2027", "Full year"],
      ["cumulative", "Cumulative through 2027", "Cumulative through 2027"],
      ["one_time", "One-time result (2027)", "One-time result (2027)"],
    ] as const)(
      "uses one semantic option and internal storage mapping for %s",
      (reportingFrequency, selectionLabel, optionLabel) => {
        const period = defaultReportingPeriod(
          { reportingFrequency, reportingYear: 2027 },
          NOW,
        );
        expect(period.periodIndex).toBe(0);
        expect(reportingPeriodStorageIndex(period)).toBe(0);
        expect(reportingPeriodElapsedFraction(period)).toBe(1);
        expect(reportingPeriodLabel(period)).toBe(selectionLabel);
        expect(
          allowedReportingPeriodOptions({ reportingFrequency }, 2027),
        ).toEqual([{ value: 0, storageIndex: 0, label: optionLabel }]);
      },
    );

    it("keeps cumulative labels tied to the selected reporting year", () => {
      const period2026 = defaultReportingPeriod(
        { reportingFrequency: "cumulative", reportingYear: 2026 },
        NOW,
      );
      const period2029 = reportingPeriodForYear(period2026, 2029, NOW);
      expect(reportingPeriodLabel(period2026)).toBe("Cumulative through 2026");
      expect(reportingPeriodLabel(period2029)).toBe("Cumulative through 2029");
    });

    it("accepts the internal single-period index while rejecting calendar fields", () => {
      expect(
        validateReportingPeriod({
          reportingFrequency: "annual",
          reportingYear: 2027,
          periodIndex: 0,
        }).success,
      ).toBe(true);
      expect(
        issueCodes({
          reportingFrequency: "annual",
          reportingYear: 2027,
          reportingMonth: 1,
        }),
      ).toContain("MIXED_PERIOD_INPUT");
      expect(
        issueCodes({
          reportingFrequency: "one_time",
          reportingYear: 2027,
          periodIndex: 1,
        }),
      ).toContain("INVALID_PERIOD");
    });
  });

  describe("legacy flexible frequency", () => {
    it("requires an explicit compatibility mode", () => {
      expect(FLEXIBLE_PERIOD_MODES).toEqual(["monthly", "annual"]);
      expect(
        issueCodes({
          reportingFrequency: "flexible",
          reportingYear: 2027,
          periodIndex: 7,
        }),
      ).toContain("FLEXIBLE_MODE_REQUIRED");
      expect(
        issueCodes({
          reportingFrequency: "flexible",
          reportingYear: 2027,
          flexibleMode: "quarterly",
          periodIndex: 3,
        }),
      ).toContain("INVALID_FLEXIBLE_MODE");
    });

    it("resolves monthly mode without losing its legacy identity", () => {
      const period = valid({
        reportingFrequency: "flexible",
        reportingYear: 2027,
        flexibleMode: "monthly",
        reportingMonth: 7,
      });
      expect(period).toMatchObject({
        reportingFrequency: "flexible",
        resolvedFrequency: "monthly",
        flexibleMode: "monthly",
        periodIndex: 7,
      });
      expect(reportingPeriodLabel(period)).toBe("July 2027");
      expect(reportingPeriodElapsedFraction(period)).toBeCloseTo(7 / 12);
      expect(
        allowedReportingPeriodOptions(
          { reportingFrequency: "flexible", flexibleMode: "monthly" },
          2027,
        ),
      ).toHaveLength(12);
    });

    it("resolves annual mode to the semantic full-year period", () => {
      const period = defaultReportingPeriod(
        {
          reportingFrequency: "flexible",
          flexibleMode: "annual",
          reportingYear: 2027,
        },
        NOW,
      );
      expect(period).toMatchObject({
        reportingFrequency: "flexible",
        resolvedFrequency: "annual",
        flexibleMode: "annual",
        periodIndex: 0,
      });
      expect(reportingPeriodLabel(period)).toBe("Full year 2027");
      expect(
        allowedReportingPeriodOptions(
          { reportingFrequency: "flexible", flexibleMode: "annual" },
          2027,
        ),
      ).toEqual([{ value: 0, storageIndex: 0, label: "Full year" }]);
    });

    it("rejects flexible mode on explicit frequencies", () => {
      expect(
        issueCodes({
          reportingFrequency: "monthly",
          reportingYear: 2027,
          flexibleMode: "monthly",
          periodIndex: 7,
        }),
      ).toContain("FLEXIBLE_MODE_NOT_ALLOWED");
    });
  });

  describe("year switching", () => {
    it("re-resolves monthly and quarterly defaults for each selected year", () => {
      const currentMonth = defaultReportingPeriod(
        { reportingFrequency: "monthly", reportingYear: 2027 },
        NOW,
      );
      expect(reportingPeriodForYear(currentMonth, 2026, NOW).periodIndex).toBe(12);
      expect(reportingPeriodForYear(currentMonth, 2027, NOW).periodIndex).toBe(7);
      expect(reportingPeriodForYear(currentMonth, 2028, NOW).periodIndex).toBe(1);

      const currentQuarter = defaultReportingPeriod(
        { reportingFrequency: "quarterly", reportingYear: 2027 },
        NOW,
      );
      expect(reportingPeriodForYear(currentQuarter, 2026, NOW).periodIndex).toBe(4);
      expect(reportingPeriodForYear(currentQuarter, 2027, NOW).periodIndex).toBe(3);
      expect(reportingPeriodForYear(currentQuarter, 2028, NOW).periodIndex).toBe(1);
    });

    it("preserves flexible mode across year changes", () => {
      const annual = defaultReportingPeriod(
        {
          reportingFrequency: "flexible",
          flexibleMode: "annual",
          reportingYear: 2026,
        },
        NOW,
      );
      expect(reportingPeriodForYear(annual, 2029, NOW)).toMatchObject({
        reportingFrequency: "flexible",
        resolvedFrequency: "annual",
        flexibleMode: "annual",
        reportingYear: 2029,
        periodIndex: 0,
      });
    });
  });

  describe("invalid and mixed runtime input", () => {
    it.each([null, undefined, [], "monthly", 7])(
      "rejects non-object input: %j",
      (input) => {
        expect(issueCodes(input)).toEqual(["INVALID_INPUT"]);
      },
    );

    it.each([
      ["missing", 2027, "INVALID_FREQUENCY"],
      ["monthly", "2027", "INVALID_YEAR"],
      ["monthly", 1899, "INVALID_YEAR"],
      ["monthly", 2101, "INVALID_YEAR"],
      ["monthly", 2027.5, "INVALID_YEAR"],
    ])("rejects frequency/year input %j %j", (reportingFrequency, reportingYear, code) => {
      expect(
        issueCodes({ reportingFrequency, reportingYear, periodIndex: 1 }),
      ).toContain(code);
    });

    it.each([
      ["monthly", 0],
      ["monthly", 13],
      ["monthly", 1.5],
      ["monthly", "1"],
      ["quarterly", 0],
      ["quarterly", 5],
      ["quarterly", 1.5],
      ["quarterly", "1"],
    ])("rejects invalid %s period %j", (reportingFrequency, periodIndex) => {
      expect(
        issueCodes({ reportingFrequency, reportingYear: 2027, periodIndex }),
      ).toContain("INVALID_PERIOD");
    });

    it("requires monthly and quarterly selections", () => {
      expect(
        issueCodes({ reportingFrequency: "monthly", reportingYear: 2027 }),
      ).toContain("PERIOD_REQUIRED");
      expect(
        issueCodes({ reportingFrequency: "quarterly", reportingYear: 2027 }),
      ).toContain("PERIOD_REQUIRED");
    });

    it("rejects duplicate or cross-frequency period fields", () => {
      expect(
        issueCodes({
          reportingFrequency: "monthly",
          reportingYear: 2027,
          periodIndex: 3,
          reportingMonth: 3,
        }),
      ).toContain("MIXED_PERIOD_INPUT");
      expect(
        issueCodes({
          reportingFrequency: "monthly",
          reportingYear: 2027,
          reportingQuarter: 2,
        }),
      ).toContain("MIXED_PERIOD_INPUT");
      expect(
        issueCodes({
          reportingFrequency: "quarterly",
          reportingYear: 2027,
          reportingMonth: 6,
        }),
      ).toContain("MIXED_PERIOD_INPUT");
      expect(
        issueCodes({
          reportingFrequency: "quarterly",
          reportingYear: 2027,
          reportingMonth: 3,
          reportingQuarter: 1,
        }),
      ).toContain("MIXED_PERIOD_INPUT");
    });

    it("throws from typed helpers when runtime objects are corrupted", () => {
      const corrupt = {
        reportingFrequency: "monthly",
        resolvedFrequency: "monthly",
        reportingYear: 2027,
        periodIndex: 99,
        flexibleMode: null,
      } as StrategyReportingPeriod;
      expect(() => reportingPeriodLabel(corrupt)).toThrow(RangeError);
      expect(() => reportingPeriodStorageIndex(corrupt)).toThrow(RangeError);
      expect(() => reportingPeriodElapsedFraction(corrupt)).toThrow(RangeError);
      expect(() => reportingPeriodForYear(corrupt, 2028, NOW)).toThrow(RangeError);
      expect(() =>
        defaultReportingPeriod(
          { reportingFrequency: "annual", reportingYear: 2200 },
          NOW,
        ),
      ).toThrow(RangeError);
      expect(() =>
        defaultReportingPeriod(
          { reportingFrequency: "annual", reportingYear: 2027 },
          new Date(Number.NaN),
        ),
      ).toThrow(RangeError);
      expect(() =>
        allowedReportingPeriodOptions({ reportingFrequency: "annual" }, 2200),
      ).toThrow(RangeError);
    });
  });

  it("never exposes the internal annual sentinel as user-facing month text", () => {
    const labels = [
      ...allowedReportingPeriodOptions({ reportingFrequency: "monthly" }, 2027),
      ...allowedReportingPeriodOptions({ reportingFrequency: "quarterly" }, 2027),
      ...allowedReportingPeriodOptions({ reportingFrequency: "annual" }, 2027),
      ...allowedReportingPeriodOptions({ reportingFrequency: "cumulative" }, 2027),
      ...allowedReportingPeriodOptions({ reportingFrequency: "one_time" }, 2027),
    ].map((option) => option.label);
    labels.push(
      reportingPeriodLabel(
        defaultReportingPeriod(
          { reportingFrequency: "annual", reportingYear: 2027 },
          NOW,
        ),
      ),
    );

    expect(labels.join(" ")).not.toMatch(/month\s*0/i);
    expect(labels).toContain("Full year");
  });
});
