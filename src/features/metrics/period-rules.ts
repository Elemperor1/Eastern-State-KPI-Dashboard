import type { ReportingFrequency } from "@/lib/types";

export const ANNUAL_ENTRY_MONTH = 0;
const FIRST_MONTH = 1;
export const LAST_MONTH = 12;
export const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
export const MONTH_FULL = [
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
] as const;

export type CalendarMonth = (typeof MONTH_NUMBERS)[number];

/** Determines whether is annual reporting frequency. */
export function isAnnualReportingFrequency(reportingFrequency: ReportingFrequency): boolean {
  return reportingFrequency !== "monthly";
}

/** Determines whether is monthly reporting frequency. */
export function isMonthlyReportingFrequency(reportingFrequency: ReportingFrequency): boolean {
  return reportingFrequency === "monthly";
}

/** Determines whether is annual entry month. */
export function isAnnualEntryMonth(month: number): boolean {
  return month === ANNUAL_ENTRY_MONTH;
}

/** Determines whether is monthly entry month. */
export function isMonthlyEntryMonth(month: number): month is CalendarMonth {
  return month >= FIRST_MONTH && month <= LAST_MONTH;
}

/** Determines whether is monthly entry through. */
export function isMonthlyEntryThrough(month: number, throughMonth: number): boolean {
  return isMonthlyEntryMonth(month) && month <= throughMonth;
}
