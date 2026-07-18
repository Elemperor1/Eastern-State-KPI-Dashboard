import type {
  StrategicBoardKpiViewModel,
  StrategicBoardPriorityViewModel,
  StrategicBoardReportViewModel,
} from "./strategic-board-report";
import type { StrategicAuditEvent } from "@/features/strategy";
import type { StrategicCalculatedActual } from "./strategy-actuals";

export interface BoardReportPageData {
  years: number[];
  sampleData: boolean;
  report: StrategicBoardReportViewModel;
}

export interface StrategicPriorityPageData {
  years: number[];
  sampleData: boolean;
  selectedYear: number;
  prioritySlug: string;
  priority: StrategicBoardPriorityViewModel;
  kpiSlugs: Record<string, string>;
}

export interface StrategicMetricPageData {
  years: number[];
  sampleData: boolean;
  selectedYear: number;
  priorityName: string;
  prioritySlug: string;
  goalId: number;
  goalName: string;
  kpi: StrategicBoardKpiViewModel;
  actuals: StrategicCalculatedActual[];
  strategicAuditEvents: StrategicAuditEvent[];
}

export interface StrategicTrendReportData {
  organizationSlug: string;
  years: number[];
  series: Array<{
    kpiId: number;
    kpiName: string;
    priorityName: string;
    unit: string | null;
    points: Array<{ year: number; value: number | null }>;
  }>;
}
