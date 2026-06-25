export type Role = "admin" | "viewer";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  created_at: string;
}

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface KPI {
  id: number;
  category_id: number;
  slug: string;
  name: string;
  unit: string;            // e.g. "visits", "USD", "%", "members"
  format: "number" | "currency" | "percent";
  description: string | null;
  sort_order: number;
  is_active: number;       // sqlite boolean
  created_at: string;
}

export interface MonthlyEntry {
  id: number;
  kpi_id: number;
  year: number;
  month: number;           // 1-12
  value: number;
  notes: string | null;
  updated_by: number | null;
  updated_at: string;
}

export interface MonthlyEntryWithMeta extends MonthlyEntry {
  kpi_name: string;
  kpi_unit: string;
  kpi_format: "number" | "currency" | "percent";
  category_id: number;
  category_name: string;
  category_slug: string;
}

export interface ComparisonPoint {
  label: string;           // e.g. "Jan", "Feb"
  month: number;
  value?: number;
  [yearKey: string]: number | string | null | undefined;
}

export interface KPIWithCategory extends KPI {
  category_name: string;
  category_slug: string;
}

export interface YearSummary {
  year: number;
  ytdValue: number;
  fullYearValue: number;
  monthlyValues: Record<number, number>;
}

export interface KPIAnalytics {
  kpi: KPIWithCategory;
  years: YearSummary[];
  monthlyComparison: {
    currentValue: number;
    compareValue: number;
    delta: number;
    pctChange: number | null;
    currentYear: number;
    compareYear: number;
    currentMonth: number;
  };
  ytdComparison: {
    currentValue: number;
    compareValue: number;
    delta: number;
    pctChange: number | null;
    currentYear: number;
    compareYear: number;
    throughMonth: number;
  };
}
