import { describe, expect, it } from "vitest";
import {
  ANNUAL_ENTRY_MONTH,
  LAST_MONTH,
  MONTH_NUMBERS,
  isAnnualEntryMonth,
  isAnnualReportingFrequency,
  isMonthlyEntryMonth,
  isMonthlyEntryThrough,
  isMonthlyReportingFrequency,
} from "./period-rules";

describe("metric period rules", () => {
  it("classifies reporting frequencies explicitly", () => {
    expect(isMonthlyReportingFrequency("monthly")).toBe(true);
    expect(isAnnualReportingFrequency("monthly")).toBe(false);
    expect(isAnnualReportingFrequency("annual")).toBe(true);
    expect(isAnnualReportingFrequency("flexible")).toBe(true);
  });

  it("reserves month 0 for annual full-year entries", () => {
    expect(ANNUAL_ENTRY_MONTH).toBe(0);
    expect(isAnnualEntryMonth(0)).toBe(true);
    expect(isAnnualEntryMonth(1)).toBe(false);
  });

  it("limits monthly entry months to calendar months 1 through 12", () => {
    expect(MONTH_NUMBERS).toHaveLength(12);
    expect(MONTH_NUMBERS[0]).toBe(1);
    expect(MONTH_NUMBERS[LAST_MONTH - 1]).toBe(12);
    expect(isMonthlyEntryMonth(0)).toBe(false);
    expect(isMonthlyEntryMonth(1)).toBe(true);
    expect(isMonthlyEntryMonth(12)).toBe(true);
    expect(isMonthlyEntryMonth(13)).toBe(false);
  });

  it("classifies monthly entries through a selected reporting month", () => {
    expect(isMonthlyEntryThrough(0, 6)).toBe(false);
    expect(isMonthlyEntryThrough(5, 6)).toBe(true);
    expect(isMonthlyEntryThrough(6, 6)).toBe(true);
    expect(isMonthlyEntryThrough(7, 6)).toBe(false);
  });
});
