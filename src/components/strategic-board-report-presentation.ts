import type {
  StrategicBoardReportViewModel,
  TargetProgressViewModel,
} from "@/features/reporting/strategic-board-report";

export interface StrategicBoardReportStructureCounts {
  priorities: number;
  goals: number;
  kpis: number;
}

/** Calculates strategic board report structure. */
export function countStrategicBoardReportStructure(
  report: StrategicBoardReportViewModel,
): StrategicBoardReportStructureCounts {
  let goals = 0;
  let kpis = 0;
  for (const priority of report.priorities) {
    goals += priority.goals.length;
    for (const goal of priority.goals) kpis += goal.kpis.length;
  }
  return { priorities: report.priorities.length, goals, kpis };
}

/** Formats board report token. */
export function formatBoardReportToken(value: string): string {
  return value
    .trim()
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toLocaleUpperCase());
}

/** Formats board report number. */
export function formatBoardReportNumber(value: number | null): string {
  if (value === null) return "Not reported";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

/** Formats board report percentage. */
export function formatBoardReportPercentage(value: number | null): string {
  if (value === null) return "Not reported";
  return `${formatBoardReportNumber(value)}%`;
}

/** Formats board report currency. */
export function formatBoardReportCurrency(value: number | null): string {
  if (value === null) return "Not reported";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Formats board report metric value. */
export function formatBoardReportMetricValue(
  value: number | null,
  unit: string | null,
): string {
  if (value === null) return "Not reported";
  const normalizedUnit = unit?.trim().toLocaleLowerCase() ?? "";
  if (["usd", "$", "currency", "dollars"].includes(normalizedUnit)) {
    return formatBoardReportCurrency(value);
  }
  if (["%", "percent", "percentage"].includes(normalizedUnit)) {
    return formatBoardReportPercentage(value);
  }
  const number = formatBoardReportNumber(value);
  return unit?.trim() ? `${number} ${unit.trim()}` : number;
}

/** Formats board report target. */
export function formatBoardReportTarget(
  progress: TargetProgressViewModel | null,
  unit: string | null,
): string {
  if (progress === null) return "No target record";
  if (!progress.hasTarget) return "Target not finalized";
  return formatBoardReportMetricValue(progress.targetValue, unit);
}

/** Implements the board report progress aria text operation. */
export function boardReportProgressAriaText(
  progress: TargetProgressViewModel,
): string {
  const percentage = formatBoardReportPercentage(
    progress.actualProgressPercentage,
  );
  return `${percentage} progress; ${formatBoardReportToken(progress.status)}`;
}
