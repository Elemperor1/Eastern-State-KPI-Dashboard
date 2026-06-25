import {
  listCategories,
  listEntries,
  listKPIs,
  listBreakdowns,
} from "./repository";
import { getDb } from "./db";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "./types";

export interface DashboardData {
  categories: Category[];
  kpis: KPIWithCategory[];
  entries: MonthlyEntryWithMeta[];
  breakdowns: BreakdownEntryWithMeta[];
  years: number[];
  sampleData: boolean;
}

export function loadDashboardData(): DashboardData {
  const db = getDb();
  const metaRow = db.prepare("SELECT value FROM meta WHERE key = 'sample_data'").get() as
    | { value?: string }
    | undefined;
  const years = Array.from(
    new Set([
      ...listEntries().map((e) => e.year),
      ...listBreakdowns().map((b) => b.year),
    ]),
  ).sort((a, b) => a - b);
  return {
    categories: listCategories(),
    kpis: listKPIs(),
    entries: listEntries(),
    breakdowns: listBreakdowns(),
    years,
    sampleData: metaRow?.value === "1",
  };
}
