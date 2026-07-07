import {
  calculateGoalComputedValues,
  type GoalComputedValues,
  type GoalDefinition,
} from "./calculations";
import { asGoal, type GoalRow } from "./records";
import {
  ANNUAL_ENTRY_MONTH,
  FIRST_MONTH,
  isAnnualReportingFrequency,
} from "@/features/metrics";
import { getDb } from "@/lib/db";
import type {
  Direction,
  KpiGoalWithMeta,
  ReportingFrequency,
  UnitType,
} from "@/lib/types";

function goalYtdValue(
  kpiId: number,
  year: number,
  reportingFrequency: ReportingFrequency,
  throughMonth: number,
): number | null {
  const db = getDb();
  if (isAnnualReportingFrequency(reportingFrequency)) {
    const row = db
      .prepare(
        `SELECT value as total FROM monthly_entries
         WHERE kpi_id = ? AND year = ? AND month = ?`,
      )
      .get(kpiId, year, ANNUAL_ENTRY_MONTH) as { total: number | null } | undefined;
    if (!row || row.total == null) return null;
    return row.total;
  }
  const row = db
    .prepare(
      `SELECT SUM(value) as total, COUNT(*) as cnt FROM monthly_entries
       WHERE kpi_id = ? AND year = ? AND month >= ? AND month <= ?`,
    )
    .get(kpiId, year, FIRST_MONTH, throughMonth) as { total: number | null; cnt: number } | undefined;
  if (!row || row.cnt === 0) return null;
  return row.total ?? 0;
}

function goalFullYearValue(
  kpiId: number,
  year: number,
  reportingFrequency: ReportingFrequency,
): number | null {
  const db = getDb();
  if (isAnnualReportingFrequency(reportingFrequency)) {
    const row = db
      .prepare(
        `SELECT value as total FROM monthly_entries
         WHERE kpi_id = ? AND year = ? AND month = ?`,
      )
      .get(kpiId, year, ANNUAL_ENTRY_MONTH) as { total: number | null } | undefined;
    if (!row || row.total == null) return null;
    return row.total;
  }
  const row = db
    .prepare(
      `SELECT SUM(value) as total, COUNT(*) as cnt FROM monthly_entries
       WHERE kpi_id = ? AND year = ? AND month >= ?`,
    )
    .get(kpiId, year, FIRST_MONTH) as { total: number | null; cnt: number } | undefined;
  if (!row || row.cnt === 0) return null;
  return row.total ?? 0;
}

function computeGoalValues(
  goal: GoalDefinition,
  kpiId: number,
  targetYear: number,
  reportingFrequency: ReportingFrequency,
  direction: Direction,
  throughMonth: number,
): GoalComputedValues {
  const baselineValue = goalFullYearValue(kpiId, targetYear - 1, reportingFrequency);
  const fullYearValue = goalFullYearValue(kpiId, targetYear, reportingFrequency);
  const ytdValue = goalYtdValue(kpiId, targetYear, reportingFrequency, throughMonth);
  return calculateGoalComputedValues({
    goal,
    reportingFrequency,
    direction,
    throughMonth,
    baselineValue,
    ytdValue,
    fullYearValue,
  });
}

function buildGoalWithMeta(
  row: Record<string, unknown>,
  g: GoalRow,
  throughMonth: number,
): KpiGoalWithMeta {
  const frequency = String(row.kpi_reporting_frequency) as ReportingFrequency;
  const direction = String(row.kpi_direction) as Direction;
  const computed = computeGoalValues(
    g,
    g.kpi_id,
    g.target_year,
    frequency,
    direction,
    throughMonth,
  );
  return {
    ...g,
    enabled: g.enabled === 1,
    kpi_name: String(row.kpi_name),
    kpi_slug: String(row.kpi_slug),
    kpi_unit: String(row.kpi_unit ?? ""),
    kpi_unit_type: String(row.kpi_unit_type) as UnitType,
    category_id: Number(row.category_id),
    category_name: String(row.category_name),
    category_slug: String(row.category_slug),
    direction,
    reporting_frequency: frequency,
    ...computed,
    current_value: computed.full_year_value,
    goal_target: computed.full_year_target,
    progress_pct: computed.full_year_progress_pct,
  };
}

export function listGoals(
  opts?: { enabledOnly?: boolean; year?: number; throughMonth?: number },
): KpiGoalWithMeta[] {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts?.enabledOnly) {
    where.push("g.enabled = 1");
  }
  if (opts?.year !== undefined) {
    where.push("g.target_year = ?");
    params.push(opts.year);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const throughMonth = opts?.throughMonth ?? 12;
  const rows = db
    .prepare(
      `SELECT g.*, k.name as kpi_name, k.slug as kpi_slug, k.unit as kpi_unit,
              k.unit_type as kpi_unit_type, k.reporting_frequency as kpi_reporting_frequency,
              k.direction as kpi_direction,
              c.id as category_id, c.name as category_name,
              c.slug as category_slug
       FROM kpi_goals g
       JOIN kpis k ON k.id = g.kpi_id
       JOIN categories c ON c.id = k.category_id
       ${clause}
       ORDER BY g.target_year DESC, c.sort_order ASC, k.sort_order ASC`,
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map((row) => buildGoalWithMeta(row, asGoal(row), throughMonth));
}

export function getGoalByKpiAndYear(
  kpiId: number,
  year: number,
  throughMonth?: number,
): KpiGoalWithMeta | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT g.*, k.name as kpi_name, k.slug as kpi_slug, k.unit as kpi_unit,
              k.unit_type as kpi_unit_type, k.reporting_frequency as kpi_reporting_frequency,
              k.direction as kpi_direction,
              c.id as category_id, c.name as category_name,
              c.slug as category_slug
       FROM kpi_goals g
       JOIN kpis k ON k.id = g.kpi_id
       JOIN categories c ON c.id = k.category_id
       WHERE g.kpi_id = ? AND g.target_year = ?`,
    )
    .get(kpiId, year) as Record<string, unknown> | undefined;
  if (!row) return null;
  return buildGoalWithMeta(row, asGoal(row), throughMonth ?? 12);
}
