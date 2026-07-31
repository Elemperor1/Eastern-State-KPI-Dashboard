import type {
  StrategicBoardKpiViewModel,
  StrategicBoardPriorityViewModel,
  StrategicBoardReportViewModel,
} from "./strategic-board-report";
import type { StrategicAuditEvent } from "@/features/strategy";
import type { StrategicCalculatedActual } from "./strategy-actuals";
import type { PeriodTrendSeries } from "./period-trend";

export interface ReportingPlanContext {
  id: number;
  slug: string;
  name: string;
  startYear: number;
  endYear: number;
  lifecycleState: "active" | "archived";
  years: number[];
}

export interface BoardReportPageData {
  years: number[];
  sampleData: boolean;
  report: StrategicBoardReportViewModel;
  boardScopeReviewStatus:
    | "needs_review"
    | "approved"
    | "intentional_empty";
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
  excludedMeasures: Array<{
    kpiId: number;
    kpiName: string;
    priorityName: string;
    reason: "archived";
  }>;
  series: Array<{
    kpiId: number;
    kpiName: string;
    priorityName: string;
    unit: string | null;
    restoredWithHiddenData: boolean;
    points: Array<{ year: number; value: number | null }>;
    /**
     * Within-year detail for measures reported monthly or quarterly, scoped by
     * the same reporting cutoff as `points`. `null` when the measure reports
     * once a year and has no shape inside it to chart.
     */
    periodTrend: PeriodTrendSeries | null;
  }>;
}
