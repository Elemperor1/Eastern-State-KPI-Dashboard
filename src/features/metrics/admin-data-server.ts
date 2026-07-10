import { listCategories, listKPIs } from "@/features/catalog/server";
import { isSampleDataEnabled } from "@/lib/app-meta";
import { STRATEGIC_PLAN_REPORTING_YEARS } from "@/features/strategy";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";
import { listBreakdowns } from "./breakdowns";
import { listEntries } from "./entries";

export interface AdminDataPageData {
  kpis: KPIWithCategory[];
  categories: Category[];
  entries: MonthlyEntryWithMeta[];
  breakdowns: BreakdownEntryWithMeta[];
  years: number[];
  sampleData: boolean;
}

export function loadAdminDataPageData(): AdminDataPageData {
  const entries = listEntries();
  const breakdowns = listBreakdowns();

  return {
    kpis: listKPIs(),
    categories: listCategories(),
    entries,
    breakdowns,
    years: Array.from(
      new Set([
        ...STRATEGIC_PLAN_REPORTING_YEARS,
        ...entries.map((entry) => entry.year),
        ...breakdowns.map((breakdown) => breakdown.year),
      ]),
    ).sort((a, b) => a - b),
    sampleData: isSampleDataEnabled(),
  };
}
