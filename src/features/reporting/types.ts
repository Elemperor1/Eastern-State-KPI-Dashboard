import type {
  BreakdownEntryWithMeta,
  Category,
  ComparisonPoint,
  KPIAnalytics,
  KPIWithCategory,
  KpiGoalWithMeta,
  MonthlyEntryWithMeta,
} from "@/lib/types";
import type { StrategicDashboardSummary } from "./strategy-summary";
import type { StrategicBoardReportViewModel } from "./strategic-board-report";
import type { StrategicAuditEvent } from "@/features/strategy";
import type { StrategicCalculatedActual } from "./strategy-actuals";

export interface ReportingData {
  categories: Category[];
  kpis: KPIWithCategory[];
  entries: MonthlyEntryWithMeta[];
  breakdowns: BreakdownEntryWithMeta[];
}

export interface ComparePeriod {
  currentYear: number;
  compareYear: number;
  currentMonth: number;
}

export type DashboardCompareState = ComparePeriod;

export interface DashboardData extends ReportingData {
  goals: KpiGoalWithMeta[];
  years: number[];
  sampleData: boolean;
  strategicSummary: StrategicDashboardSummary;
  strategicBoardReport: StrategicBoardReportViewModel;
  strategicActuals?: StrategicCalculatedActual[];
  strategicAuditEvents?: StrategicAuditEvent[];
}

export interface CategoryMetricMovement {
  kpi: KPIWithCategory;
  pct: number | null;
  favorable: boolean;
  delta: number;
}

export interface CategoryOverviewSummary {
  category: Category;
  metrics: CategoryMetricMovement[];
  improving: number;
  declining: number;
  flat: number;
  total: number;
  comparisonMetricCount: number;
  pctImproving: number;
  topMover: CategoryMetricMovement | null;
  goalCount: number;
  averageGoalProgress: number | null;
  completedStrategicGoals: number;
  eligibleStrategicGoals: number;
  strategicGoalCompletionPercentage: number | null;
  excludedStrategicGoals: number;
}

export interface CategoryMetricCardModel {
  kpi: KPIWithCategory;
  analytics: KPIAnalytics;
  goal: KpiGoalWithMeta | null;
  strategic: StrategicBoardReportViewModel["priorities"][number]["goals"][number]["kpis"][number] | null;
  strategicGoalName?: string | null;
}

export interface CategoryMetricGroupModel {
  goal: string;
  metrics: CategoryMetricCardModel[];
}

export interface CategoryBreakdownModel {
  kpi: KPIWithCategory;
  breakdowns: BreakdownEntryWithMeta[];
}

export interface CategoryPageModel {
  category: Category | null;
  metricCards: CategoryMetricCardModel[];
  metricGroups: CategoryMetricGroupModel[];
  monthlyBreakdowns: CategoryBreakdownModel[];
  annualBreakdowns: CategoryBreakdownModel[];
}

export interface MetricValueRow {
  period: string;
  value: number | undefined;
  notes: string | null;
  compare?: number | undefined;
}

export type MetricDetailBreakdownModel =
  | {
      kind: "donor-conversion";
      breakdowns: BreakdownEntryWithMeta[];
    }
  | {
      kind: "annual-breakdown";
      breakdowns: BreakdownEntryWithMeta[];
    };

export interface MetricDetailModel {
  kpi: KPIWithCategory | null;
  category: Category | null;
  entries: MonthlyEntryWithMeta[];
  analytics: KPIAnalytics | null;
  isAnnual: boolean;
  isBreakdown: boolean;
  trendYears: number[];
  trendPoints: ComparisonPoint[];
  ytdBar: Array<Record<string, string | number>>;
  favorableMonthly: boolean;
  favorableYtd: boolean;
  goal: KpiGoalWithMeta | null;
  goalIsAnnual: boolean;
  tableRows: MetricValueRow[];
  directionLabel: string;
  breakdown: MetricDetailBreakdownModel | null;
}
