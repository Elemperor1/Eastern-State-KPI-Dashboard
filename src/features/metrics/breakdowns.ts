import {
  ANNUAL_ENTRY_MONTH,
  isAnnualEntryMonth,
  isAnnualReportingFrequency,
  isMonthlyEntryMonth,
} from "./period-rules";
import { asBreakdown, asBreakdownWithMeta } from "./records";
import { recordMetricEntryHistory } from "./history";
import { getDb, transaction } from "@/lib/db";
import type {
  BreakdownEntry,
  BreakdownEntryWithMeta,
  ReportingFrequency,
  UnitType,
} from "@/lib/types";

export interface BreakdownFilter {
  kpi_id?: number;
  category_id?: number;
  year?: number;
  years?: number[];
  month?: number;
}

export class BreakdownEntryNotFoundError extends Error {
  constructor(id: number) {
    super(`Breakdown entry ${id} was not found.`);
    this.name = "BreakdownEntryNotFoundError";
  }
}

export class BreakdownEntryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BreakdownEntryConflictError";
  }
}

export class BreakdownKpiNotFoundError extends Error {
  constructor(kpiId: number) {
    super(`KPI ${kpiId} was not found.`);
    this.name = "BreakdownKpiNotFoundError";
  }
}

export class BreakdownKpiTypeError extends Error {
  constructor(kpiId: number) {
    super(`KPI ${kpiId} is not a breakdown KPI.`);
    this.name = "BreakdownKpiTypeError";
  }
}

export class BreakdownPeriodMismatchError extends Error {
  constructor(reportingFrequency: ReportingFrequency, month: number) {
    const expected = isAnnualReportingFrequency(reportingFrequency)
      ? "month 0"
      : "a month from 1 through 12";
    const article = reportingFrequency === "annual" ? "an" : "a";
    super(
      `Breakdown month ${month} is invalid for ${article} ${reportingFrequency} KPI; expected ${expected}.`,
    );
    this.name = "BreakdownPeriodMismatchError";
  }
}

export class BreakdownLabelError extends Error {
  constructor() {
    super("Breakdown labels cannot be empty.");
    this.name = "BreakdownLabelError";
  }
}

export function listBreakdowns(
  filter?: BreakdownFilter,
): BreakdownEntryWithMeta[] {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter?.kpi_id !== undefined) {
    where.push("b.kpi_id = ?");
    params.push(filter.kpi_id);
  }
  if (filter?.category_id !== undefined) {
    where.push("k.category_id = ?");
    params.push(filter.category_id);
  }
  if (filter?.year !== undefined) {
    where.push("b.year = ?");
    params.push(filter.year);
  }
  if (filter?.years && filter.years.length) {
    where.push(`b.year IN (${filter.years.map(() => "?").join(",")})`);
    params.push(...filter.years);
  }
  if (filter?.month !== undefined) {
    where.push("b.month = ?");
    params.push(filter.month);
  }
  const sql = `
    SELECT b.*, k.name as kpi_name, k.unit as kpi_unit,
           c.id as category_id, c.name as category_name, c.slug as category_slug
    FROM breakdown_entries b
    JOIN kpis k ON k.id = b.kpi_id
    JOIN categories c ON c.id = k.category_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY b.year ASC, b.month ASC, b.sort_order ASC, b.label ASC
  `;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(asBreakdownWithMeta);
}

export function upsertBreakdown(input: {
  id?: number | null;
  kpi_id: number;
  year: number;
  month?: number;
  label: string;
  value: number;
  sort_order?: number;
  notes?: string | null;
  updated_by?: number | null;
}): BreakdownEntry {
  // New rows use the natural key. Existing admin drafts carry a durable row
  // id so editing a label updates that row instead of inserting a duplicate.
  return transaction(() => {
    const db = getDb();
    const month = input.month ?? ANNUAL_ENTRY_MONTH;
    const label = input.label.trim();
    if (!label) {
      throw new BreakdownLabelError();
    }
    const kpi = db
      .prepare("SELECT reporting_frequency, unit_type FROM kpis WHERE id = ?")
      .get(input.kpi_id) as
      | { reporting_frequency: ReportingFrequency; unit_type: UnitType }
      | undefined;
    if (!kpi) {
      throw new BreakdownKpiNotFoundError(input.kpi_id);
    }
    if (kpi.unit_type !== "breakdown") {
      throw new BreakdownKpiTypeError(input.kpi_id);
    }
    const validMonth = isAnnualReportingFrequency(kpi.reporting_frequency)
      ? isAnnualEntryMonth(month)
      : isMonthlyEntryMonth(month);
    if (!validMonth) {
      throw new BreakdownPeriodMismatchError(kpi.reporting_frequency, month);
    }
    const requestedId = input.id ?? null;
    const prior = (
      requestedId === null
        ? db
            .prepare(
              "SELECT id, kpi_id, year, month, label, value, sort_order, notes FROM breakdown_entries WHERE kpi_id = ? AND year = ? AND month = ? AND label = ?",
            )
            .get(input.kpi_id, input.year, month, label)
        : db
            .prepare(
              "SELECT id, kpi_id, year, month, label, value, sort_order, notes FROM breakdown_entries WHERE id = ?",
            )
            .get(requestedId)
    ) as
      | {
          id: number;
          kpi_id: number;
          year: number;
          month: number;
          label: string;
          value: number;
          sort_order: number;
          notes: string | null;
        }
      | undefined;

    if (requestedId !== null) {
      if (!prior) {
        throw new BreakdownEntryNotFoundError(requestedId);
      }
      if (
        Number(prior.kpi_id) !== input.kpi_id ||
        Number(prior.year) !== input.year ||
        Number(prior.month) !== month
      ) {
        throw new BreakdownEntryConflictError(
          "The saved breakdown row does not belong to the selected KPI period.",
        );
      }
      const conflictingRow = db
        .prepare(
          `SELECT id FROM breakdown_entries
           WHERE kpi_id = ? AND year = ? AND month = ? AND label = ? AND id <> ?`,
        )
        .get(input.kpi_id, input.year, month, label, requestedId) as
        | { id: number }
        | undefined;
      if (conflictingRow) {
        throw new BreakdownEntryConflictError(
          `A breakdown row named "${label}" already exists for this KPI period.`,
        );
      }
      db.prepare(
        `UPDATE breakdown_entries
         SET label = ?, value = ?, sort_order = ?, notes = ?,
             updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(
        label,
        input.value,
        input.sort_order ?? prior.sort_order,
        input.notes ?? null,
        input.updated_by ?? null,
        requestedId,
      );
    } else {
      db.prepare(
        `INSERT INTO breakdown_entries (kpi_id, year, month, label, value, sort_order, notes, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(kpi_id, year, month, label) DO UPDATE SET
          value = excluded.value,
          sort_order = excluded.sort_order,
          notes = excluded.notes,
          updated_by = excluded.updated_by,
          updated_at = datetime('now')`,
      ).run(
        input.kpi_id,
        input.year,
        month,
        label,
        input.value,
        input.sort_order ?? 0,
        input.notes ?? null,
        input.updated_by ?? null,
      );
    }

    const row = (
      requestedId === null
        ? db
            .prepare(
              "SELECT * FROM breakdown_entries WHERE kpi_id = ? AND year = ? AND month = ? AND label = ?",
            )
            .get(input.kpi_id, input.year, month, label)
        : db
            .prepare("SELECT * FROM breakdown_entries WHERE id = ?")
            .get(requestedId)
    ) as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(
        requestedId === null
          ? `upsertBreakdown: row not found after upsert for kpi_id=${input.kpi_id} year=${input.year} month=${month} label=${label}`
          : `upsertBreakdown: row not found after update for id=${requestedId}`,
      );
    }
    if (
      (requestedId !== null && Number(row.id) !== requestedId) ||
      Number(row.kpi_id) !== input.kpi_id ||
      Number(row.year) !== input.year ||
      Number(row.month ?? ANNUAL_ENTRY_MONTH) !== month ||
      String(row.label) !== label
    ) {
      throw new Error(
        `upsertBreakdown: read-back key mismatch (expected kpi=${input.kpi_id} year=${input.year} month=${month} label=${label}, got kpi=${row.kpi_id} year=${row.year} month=${row.month} label=${row.label})`,
      );
    }
    const entry = asBreakdown(row);
    recordMetricEntryHistory({
      entry_type: "breakdown",
      entry_id: entry.id,
      kpi_id: entry.kpi_id,
      year: entry.year,
      month_or_label: `${month}|${entry.label}`,
      prev_value: prior?.value ?? null,
      new_value: entry.value,
      prev_notes: prior?.notes ?? null,
      new_notes: entry.notes,
      changed_by: input.updated_by ?? null,
    });
    return entry;
  });
}

export function deleteBreakdown(id: number, changedBy?: number | null): void {
  const db = getDb();
  const prior = db
    .prepare(
      "SELECT id, kpi_id, year, month, label, value, notes FROM breakdown_entries WHERE id = ?",
    )
    .get(id) as
    | {
        id: number;
        kpi_id: number;
        year: number;
        month: number;
        label: string;
        value: number;
        notes: string | null;
      }
    | undefined;
  db.prepare("DELETE FROM breakdown_entries WHERE id = ?").run(id);
  if (prior) {
    recordMetricEntryHistory({
      entry_type: "breakdown",
      entry_id: prior.id,
      kpi_id: prior.kpi_id,
      year: prior.year,
      month_or_label: `${prior.month}|${prior.label}`,
      prev_value: prior.value,
      new_value: null,
      prev_notes: prior.notes,
      new_notes: null,
      changed_by: changedBy ?? null,
    });
  }
}
