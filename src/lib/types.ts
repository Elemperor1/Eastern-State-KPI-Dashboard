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

/** Unit type drives how a value is stored, formatted, and compared. */
export type UnitType =
  | "count"
  | "percent"
  | "currency"
  | "attendance"
  | "note"
  | "breakdown";

export type ReportingFrequency = "monthly" | "annual" | "flexible";

/** Whether an increase is good (higher), bad (lower), or neither (neutral). */
export type Direction = "higher" | "lower" | "neutral";

export interface KPI {
  id: number;
  category_id: number;
  parent_id: number | null; // set when this KPI is a component of a breakdown parent
  slug: string;
  name: string;
  unit: string; // human label, e.g. "views", "USD", "%", "attendees"
  unit_type: UnitType;
  reporting_frequency: ReportingFrequency;
  direction: Direction;
  description: string | null;
  sort_order: number;
  is_active: number; // sqlite boolean
  created_at: string;
}

export interface MonthlyEntry {
  id: number;
  kpi_id: number;
  year: number;
  month: number; // 1-12 for monthly, 0 for annual full-year snapshot
  value: number;
  notes: string | null;
  updated_by: number | null;
  updated_at: string;
}

export interface MonthlyEntryWithMeta extends MonthlyEntry {
  kpi_name: string;
  kpi_unit: string;
  kpi_unit_type: UnitType;
  category_id: number;
  category_name: string;
  category_slug: string;
}

export interface BreakdownEntry {
  id: number;
  kpi_id: number;
  year: number;
  label: string;
  value: number;
  sort_order: number;
  notes: string | null;
  updated_by: number | null;
  updated_at: string;
}

export interface BreakdownEntryWithMeta extends BreakdownEntry {
  kpi_name: string;
  kpi_unit: string;
  category_id: number;
  category_name: string;
  category_slug: string;
}

export interface ComparisonPoint {
  label: string;
  month: number;
  value?: number;
  [yearKey: string]: number | string | null | undefined;
}

/** Audit-trail row written whenever a monthly or breakdown entry is changed. */
export interface EntryHistory {
  id: number;
  entry_type: "monthly" | "breakdown";
  entry_id: number | null;
  kpi_id: number;
  year: number;
  /** Month (1-12) for monthly entries; 0 for annual; label text for breakdowns. */
  month_or_label: string;
  prev_value: number | null;
  new_value: number | null;
  prev_notes: string | null;
  new_notes: string | null;
  changed_by: number | null;
  changed_at: string;
}

/** A history row joined with the KPI + category for display on /admin/history. */
export interface EntryHistoryWithMeta extends EntryHistory {
  kpi_name: string;
  kpi_slug: string;
  category_id: number;
  category_name: string;
  category_slug: string;
  changed_by_email: string | null;
}

export interface KPIWithCategory extends KPI {
  category_name: string;
  category_slug: string;
  children?: KPIWithCategory[]; // populated for breakdown parents
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
    ptsChange: number | null; // for percent unit types
    currentYear: number;
    compareYear: number;
    currentMonth: number;
    isAnnual: boolean;
    /** True when both years lack any underlying entry for the queried period.
     *  Surfaces a "No data" badge instead of a misleading ±0% delta. */
    isEmpty: boolean;
  };
  ytdComparison: {
    currentValue: number;
    compareValue: number;
    delta: number;
    pctChange: number | null;
    ptsChange: number | null;
    currentYear: number;
    compareYear: number;
    throughMonth: number;
    isAnnual: boolean;
    /** True when both years lack any underlying entry at or before the through-month. */
    isEmpty: boolean;
  };
}
