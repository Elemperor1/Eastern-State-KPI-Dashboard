export type Role = "admin" | "viewer";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  created_at: string;
  /** SQLite boolean (0/1). True when the account holds a temporary
   *  credential that must be rotated before normal app use. */
  must_change_password: boolean;
  /** SQLite boolean (0/1). True when an admin has disabled the
   *  account. A disabled account cannot log in and any session
   *  cookie that predates the disablement is rejected on the next
   *  protected request (D8AD-CAN-003). */
  disabled: boolean;
  /** Per-user session-revocation watermark (D8AD-CAN-003). Unix-ms
   *  timestamp bumped to Date.now() on every security-sensitive
   *  account change: bootstrap seed, admin reset, self-service
   *  rotation, operator setup:admin, role change, and account
   *  disable/enable. A session whose `issuedAt` is older than this
   *  value is invalid — see src/lib/session.ts::getCurrentUser.
   *  Deletion needs no bump: a deleted row is simply absent, so
   *  findUserById returns null and the session is rejected outright. */
  sessions_valid_after: number;
}

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  /** True when the logged-in account must rotate its password before
   *  normal app use (bootstrap / admin-issued temp credentials). */
  must_change_password: boolean;
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
  month: number;
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

export type GoalType = "pct" | "number";

export interface KpiGoal {
  id: number;
  kpi_id: number;
  target_year: number;
  goal_type: GoalType;
  target_value: number;
  enabled: boolean;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
}

export interface KpiGoalWithMeta extends KpiGoal {
  kpi_name: string;
  kpi_slug: string;
  kpi_unit: string;
  kpi_unit_type: UnitType;
  category_id: number;
  category_name: string;
  category_slug: string;
  /** Direction of the KPI — used to interpret progress for "lower is better" metrics. */
  direction: Direction;
  /** Reporting frequency — annual goals have identical YTD and full-year values. */
  reporting_frequency: ReportingFrequency;

  /** Actual value through the selected month (YTD for monthly KPIs, annual for annual KPIs). */
  ytd_value: number | null;
  /** Target value through the selected month (prorated from the annual target for monthly KPIs). */
  ytd_target: number | null;
  /** YTD pacing percentage (0–100). Compares actual-through-month vs target-through-month. Null when target is unavailable. */
  ytd_progress_pct: number | null;

  /** Actual value for the full year (sum of all months, or the annual month-0 value). */
  full_year_value: number | null;
  /** Full-year target (baseline + target_value). Null when baseline is unavailable. */
  full_year_target: number | null;
  /** Full-year completion percentage (0–100). Compares full-year actual vs full-year target. Null when target is unavailable. */
  full_year_progress_pct: number | null;

  /**
   * @deprecated Use ytd_progress_pct or full_year_progress_pct instead.
   * Kept for backward compat during migration — equals full_year_progress_pct.
   */
  current_value: number | null;
  /** @deprecated Use full_year_target instead. */
  goal_target: number | null;
  /** @deprecated Use ytd_progress_pct or full_year_progress_pct instead. */
  progress_pct: number | null;
}

/**
 * A history row joined with the KPI + category for display on /admin/history.
 *
 * D8AD-CAN-005: the historical label fields (`kpi_name`, `kpi_slug`,
 * `kpi_unit`, `category_id`, `category_name`, `category_slug`,
 * `changed_by_email`) are IMMUTABLE SNAPSHOT columns captured at the
 * moment the change was recorded. They never change when the live
 * KPI/category/user is later renamed or deleted, so the audit trail
 * reflects what was true at the time of the edit, not what is true now.
 *
 * The `*_current_*` fields come from a LEFT JOIN to the live tables and
 * are null when the metadata has been deleted. `metadata_deleted` is
 * true when the KPI (or its category) no longer exists; `metadata_renamed`
 * is true when the live KPI still exists but its name/slug differs from
 * the snapshot. Together they let the UI clearly represent deleted and
 * renamed metadata without retroactively rewriting the historical label.
 */
export interface EntryHistoryWithMeta extends EntryHistory {
  /** Immutable snapshot of the KPI's human label at change time. */
  kpi_name: string | null;
  /** Immutable snapshot of the KPI's slug at change time. */
  kpi_slug: string | null;
  /** Immutable snapshot of the KPI's unit label at change time. */
  kpi_unit: string | null;
  /** Immutable snapshot of the category id at change time (null = tombstone). */
  category_id: number | null;
  /** Immutable snapshot of the category's human label at change time. */
  category_name: string | null;
  /** Immutable snapshot of the category's slug at change time. */
  category_slug: string | null;
  /** Immutable snapshot of the actor's email at change time (null = seed/system or deleted-before-snapshot). */
  changed_by_email: string | null;
  /** Live KPI name from a LEFT JOIN, or null when the KPI has been deleted. */
  kpi_current_name: string | null;
  /** Live KPI slug, or null when the KPI has been deleted. */
  kpi_current_slug: string | null;
  /** Live category name, or null when the category has been deleted. */
  category_current_name: string | null;
  /** Live category slug, or null when the category has been deleted. */
  category_current_slug: string | null;
  /** True when the live KPI (or its category) no longer exists. */
  metadata_deleted: boolean;
  /** True when the live KPI still exists but its name/slug differs from the snapshot. */
  metadata_renamed: boolean;
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
