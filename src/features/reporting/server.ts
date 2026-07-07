import { listCategories, listKPIs } from "@/features/catalog/server";
import { listGoals } from "@/features/goals";
import { listBreakdowns, listEntries } from "@/features/metrics/server";
import { getDb } from "@/lib/db";
import type { DashboardData } from "./types";

export function listDashboardYears(): number[] {
  return Array.from(
    new Set([
      ...listEntries().map((entry) => entry.year),
      ...listBreakdowns().map((breakdown) => breakdown.year),
    ]),
  ).sort((a, b) => a - b);
}

export function loadDashboardData(
  opts?: { throughMonth?: number; year?: number },
): DashboardData {
  const db = getDb();
  const metaRow = db.prepare("SELECT value FROM meta WHERE key = 'sample_data'").get() as
    | { value?: string }
    | undefined;
  const entries = listEntries();
  const breakdowns = listBreakdowns();
  const years = Array.from(
    new Set([
      ...entries.map((entry) => entry.year),
      ...breakdowns.map((breakdown) => breakdown.year),
    ]),
  ).sort((a, b) => a - b);

  return {
    categories: listCategories(),
    kpis: listKPIs(),
    entries,
    breakdowns,
    goals: listGoals({ enabledOnly: true, throughMonth: opts?.throughMonth, year: opts?.year }),
    years,
    sampleData: metaRow?.value === "1",
  };
}
