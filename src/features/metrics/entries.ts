import { getDb, transaction } from "@/lib/db";
import type {
  MonthlyEntry,
  MonthlyEntryWithMeta,
  ReportingFrequency,
  UnitType,
} from "@/lib/types";
import { asEntry, asEntryWithMeta } from "./records";
import { recordMetricEntryHistory } from "./history";
import {
  isAnnualEntryMonth,
  isAnnualReportingFrequency,
  isMonthlyEntryMonth,
} from "./period-rules";

export class EntryPeriodMismatchError extends Error {
  constructor(reportingFrequency: ReportingFrequency, month: number) {
    const expected = isAnnualReportingFrequency(reportingFrequency)
      ? "month 0"
      : "a month from 1 through 12";
    const article = reportingFrequency === "annual" ? "an" : "a";
    super(
      `Entry month ${month} is invalid for ${article} ${reportingFrequency} KPI; expected ${expected}.`,
    );
    this.name = "EntryPeriodMismatchError";
  }
}

export class EntryKpiNotFoundError extends Error {
  constructor(kpiId: number) {
    super(`KPI ${kpiId} was not found.`);
    this.name = "EntryKpiNotFoundError";
  }
}

export class EntryKpiTypeError extends Error {
  constructor(kpiId: number) {
    super(`KPI ${kpiId} is a breakdown KPI.`);
    this.name = "EntryKpiTypeError";
  }
}

export interface EntryFilter {
  kpi_id?: number;
  kpi_ids?: number[];
  category_id?: number;
  year?: number;
  years?: number[];
}

export function listEntries(filter?: EntryFilter): MonthlyEntryWithMeta[] {
  if (filter?.kpi_ids && filter.kpi_ids.length === 0) return [];

  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter?.kpi_id !== undefined) {
    where.push("e.kpi_id = ?");
    params.push(filter.kpi_id);
  }
  if (filter?.kpi_ids) {
    where.push(`e.kpi_id IN (${filter.kpi_ids.map(() => "?").join(",")})`);
    params.push(...filter.kpi_ids);
  }
  if (filter?.category_id !== undefined) {
    where.push("k.category_id = ?");
    params.push(filter.category_id);
  }
  if (filter?.year !== undefined) {
    where.push("e.year = ?");
    params.push(filter.year);
  }
  if (filter?.years && filter.years.length) {
    where.push(`e.year IN (${filter.years.map(() => "?").join(",")})`);
    params.push(...filter.years);
  }
  const sql = `
    SELECT e.*, k.name as kpi_name, k.unit as kpi_unit, k.unit_type as kpi_unit_type,
           c.id as category_id, c.name as category_name, c.slug as category_slug
    FROM monthly_entries e
    JOIN kpis k ON k.id = e.kpi_id
    JOIN categories c ON c.id = k.category_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY e.year ASC, e.month ASC, k.sort_order ASC
  `;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(asEntryWithMeta);
}

export function upsertEntry(input: {
  kpi_id: number;
  year: number;
  month: number;
  value: number;
  notes?: string | null;
  updated_by?: number | null;
}): MonthlyEntry {
  // The whole upsert+readback+history sequence runs in a single transaction
  // so a crash or concurrent writer cannot produce a torn audit row. The
  // post-write read uses the natural unique key (kpi_id, year, month), not
  // `result.lastInsertRowid`; on ON CONFLICT DO UPDATE it is not guaranteed to
  // point at the row we just changed. A key match is asserted before history.
  return transaction(() => {
    const db = getDb();
    const kpi = db
      .prepare(
        "SELECT reporting_frequency, unit_type FROM kpis WHERE id = ?",
      )
      .get(input.kpi_id) as
      | { reporting_frequency: ReportingFrequency; unit_type: UnitType }
      | undefined;
    if (!kpi) {
      throw new EntryKpiNotFoundError(input.kpi_id);
    }
    if (kpi.unit_type === "breakdown") {
      throw new EntryKpiTypeError(input.kpi_id);
    }
    const validMonth = isAnnualReportingFrequency(kpi.reporting_frequency)
      ? isAnnualEntryMonth(input.month)
      : isMonthlyEntryMonth(input.month);
    if (!validMonth) {
      throw new EntryPeriodMismatchError(
        kpi.reporting_frequency,
        input.month,
      );
    }
    const prior = db
      .prepare(
        "SELECT id, value, notes FROM monthly_entries WHERE kpi_id = ? AND year = ? AND month = ?",
      )
      .get(input.kpi_id, input.year, input.month) as
      | { id: number; value: number; notes: string | null }
      | undefined;
    db.prepare(
      `INSERT INTO monthly_entries (kpi_id, year, month, value, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(kpi_id, year, month) DO UPDATE SET
         value = excluded.value,
         notes = excluded.notes,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    ).run(
      input.kpi_id,
      input.year,
      input.month,
      input.value,
      input.notes ?? null,
      input.updated_by ?? null,
    );
    const row = db
      .prepare(
        "SELECT * FROM monthly_entries WHERE kpi_id = ? AND year = ? AND month = ?",
      )
      .get(input.kpi_id, input.year, input.month) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new Error(
        `upsertEntry: row not found after upsert for kpi_id=${input.kpi_id} year=${input.year} month=${input.month}`,
      );
    }
    if (
      Number(row.kpi_id) !== input.kpi_id ||
      Number(row.year) !== input.year ||
      Number(row.month) !== input.month
    ) {
      throw new Error(
        `upsertEntry: read-back key mismatch (expected kpi=${input.kpi_id} year=${input.year} month=${input.month}, got kpi=${row.kpi_id} year=${row.year} month=${row.month})`,
      );
    }
    const entry = asEntry(row);
    recordMetricEntryHistory({
      entry_type: "monthly",
      entry_id: entry.id,
      kpi_id: entry.kpi_id,
      year: entry.year,
      month_or_label: String(entry.month),
      prev_value: prior?.value ?? null,
      new_value: entry.value,
      prev_notes: prior?.notes ?? null,
      new_notes: entry.notes,
      changed_by: input.updated_by ?? null,
    });
    return entry;
  });
}

export function deleteEntry(id: number, changedBy?: number | null): void {
  const db = getDb();
  const prior = db
    .prepare(
      "SELECT id, kpi_id, year, month, value, notes FROM monthly_entries WHERE id = ?",
    )
    .get(id) as
    | { id: number; kpi_id: number; year: number; month: number; value: number; notes: string | null }
    | undefined;
  db.prepare("DELETE FROM monthly_entries WHERE id = ?").run(id);
  if (prior) {
    recordMetricEntryHistory({
      entry_type: "monthly",
      entry_id: prior.id,
      kpi_id: prior.kpi_id,
      year: prior.year,
      month_or_label: String(prior.month),
      prev_value: prior.value,
      new_value: null,
      prev_notes: prior.notes,
      new_notes: null,
      changed_by: changedBy ?? null,
    });
  }
}
