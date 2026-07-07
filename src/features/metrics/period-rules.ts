import type { ReportingFrequency } from "@/lib/types";

export const ANNUAL_ENTRY_MONTH = 0;
export const FIRST_MONTH = 1;
export const LAST_MONTH = 12;
export const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export type CalendarMonth = (typeof MONTH_NUMBERS)[number];

export function isAnnualReportingFrequency(reportingFrequency: ReportingFrequency): boolean {
  return reportingFrequency !== "monthly";
}

export function isMonthlyReportingFrequency(reportingFrequency: ReportingFrequency): boolean {
  return reportingFrequency === "monthly";
}

export function isAnnualEntryMonth(month: number): boolean {
  return month === ANNUAL_ENTRY_MONTH;
}

export function isMonthlyEntryMonth(month: number): month is CalendarMonth {
  return month >= FIRST_MONTH && month <= LAST_MONTH;
}

export function isMonthlyEntryThrough(month: number, throughMonth: number): boolean {
  return isMonthlyEntryMonth(month) && month <= throughMonth;
}
