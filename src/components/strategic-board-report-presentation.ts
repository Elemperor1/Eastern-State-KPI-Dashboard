import type {
  StrategicBoardReportViewModel,
  TargetProgressViewModel,
} from "@/features/reporting/strategic-board-report";

export interface StrategicBoardReportStructureCounts {
  priorities: number;
  goals: number;
  kpis: number;
}

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

export function formatBoardReportToken(value: string): string {
  return value
    .trim()
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toLocaleUpperCase());
}

export function formatBoardReportNumber(value: number | null): string {
  if (value === null) return "Not reported";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatBoardReportPercentage(value: number | null): string {
  if (value === null) return "Not reported";
  return `${formatBoardReportNumber(value)}%`;
}

export function formatBoardReportCurrency(value: number | null): string {
  if (value === null) return "Not reported";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

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

export function formatBoardReportTarget(
  progress: TargetProgressViewModel | null,
  unit: string | null,
): string {
  if (progress === null) return "No target record";
  if (!progress.hasTarget) return "Target not finalized";
  return formatBoardReportMetricValue(progress.targetValue, unit);
}

export function boardReportProgressAriaText(
  progress: TargetProgressViewModel,
): string {
  const percentage = formatBoardReportPercentage(
    progress.actualProgressPercentage,
  );
  return `${percentage} progress; ${formatBoardReportToken(progress.status)}`;
}
