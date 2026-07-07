import { MONTH_LABELS } from "@/lib/analytics";
import {
  MONTH_NUMBERS,
  isMonthlyReportingFrequency,
} from "@/features/metrics";
import { buildTrendCsvExport, type CsvExport } from "./csv";
import type {
  ComparisonPoint,
  KPIWithCategory,
  MonthlyEntryWithMeta,
  UnitType,
} from "@/lib/types";

export type TrendAxisMode = "shared" | "log" | "indexed";

export const TREND_AXIS_MODE_OPTIONS: { value: TrendAxisMode; label: string }[] = [
  { value: "shared", label: "Shared" },
  { value: "log", label: "Per-series (log)" },
  { value: "indexed", label: "Per-series (indexed)" },
];

export const TREND_AXIS_MODE_HELP: Record<TrendAxisMode, string> = {
  shared:
    "All series share one linear axis; high-volume measures can compress smaller ones.",
  log: "Each series is plotted on a logarithmic scale so small and large magnitudes coexist.",
  indexed:
    "Each line is indexed to its first non-null value = 100, so relative movement is comparable across magnitudes.",
};

export interface TrendExplorerData {
  kpis: KPIWithCategory[];
  entries: MonthlyEntryWithMeta[];
}

export interface TrendExplorerSelection {
  categorySlug: string;
  kpiSlugs: string[];
  selectedYears: number[];
  axisMode: TrendAxisMode;
}

export interface TrendExplorerSeries {
  dataKey: string;
  name: string;
  kpi: KPIWithCategory;
  kpiIndex: number;
  year: number;
  yearIndex: number;
  isCurrentSelection: boolean;
}

export interface TrendExplorerEmptyState {
  title: string;
  description: string;
}

export interface TrendExplorerModel {
  visibleKPIs: KPIWithCategory[];
  selectedKpis: KPIWithCategory[];
  rawTrendData: ComparisonPoint[];
  trendData: ComparisonPoint[];
  indexedBaselines: Record<string, number | null>;
  sampleUnitType: UnitType;
  series: TrendExplorerSeries[];
  csvExport: CsvExport;
  pngFileName: string;
  selectedKpiFilterLabel: string;
  selectedYearsFilterLabel: string;
  axisModeHelp: string;
  emptyState: TrendExplorerEmptyState | null;
}

export function selectInitialTrendKpiSlugs(
  kpis: KPIWithCategory[],
  limit = 3,
): string[] {
  const seen = new Set<string>();
  const picks: string[] = [];
  for (const kpi of kpis) {
    if (seen.has(kpi.category_slug)) continue;
    seen.add(kpi.category_slug);
    picks.push(kpi.slug);
    if (picks.length >= limit) break;
  }
  return picks;
}

export function defaultTrendYears(years: number[]): number[] {
  return years.slice(-3);
}

export function defaultTrendAxisMode(kpiSlugs: string[]): TrendAxisMode {
  return kpiSlugs.length > 1 ? "indexed" : "shared";
}

export function filterVisibleTrendKpis(
  kpis: KPIWithCategory[],
  categorySlug: string,
): KPIWithCategory[] {
  const categoryKpis = categorySlug === "all"
    ? kpis
    : kpis.filter((kpi) => kpi.category_slug === categorySlug);
  return categoryKpis.filter(
    (kpi) => isMonthlyReportingFrequency(kpi.reporting_frequency) && kpi.unit_type !== "breakdown",
  );
}

export function buildRawTrendData({
  kpis,
  entries,
  kpiSlugs,
  selectedYears,
}: TrendExplorerData & {
  kpiSlugs: string[];
  selectedYears: number[];
}): ComparisonPoint[] {
  const selectedYearSet = new Set(selectedYears);
  const kpisBySlug = new Map(kpis.map((kpi) => [kpi.slug, kpi]));
  const points: ComparisonPoint[] = [];

  for (const month of MONTH_NUMBERS) {
    const point: ComparisonPoint = { label: MONTH_LABELS[month - 1], month };
    for (const kpiSlug of kpiSlugs) {
      const kpi = kpisBySlug.get(kpiSlug);
      if (!kpi) continue;
      const valuesByYear = new Map<number, number>();
      for (const entry of entries) {
        if (
          entry.kpi_id === kpi.id &&
          entry.month === month &&
          selectedYearSet.has(entry.year)
        ) {
          valuesByYear.set(entry.year, (valuesByYear.get(entry.year) ?? 0) + entry.value);
        }
      }
      for (const year of selectedYears) {
        point[trendSeriesKey(kpi.slug, year)] = valuesByYear.get(year) ?? null;
      }
    }
    points.push(point);
  }

  return points;
}

export function buildIndexedTrendBaselines({
  axisMode,
  rawTrendData,
  kpiSlugs,
  selectedYears,
}: {
  axisMode: TrendAxisMode;
  rawTrendData: ComparisonPoint[];
  kpiSlugs: string[];
  selectedYears: number[];
}): Record<string, number | null> {
  const baselines: Record<string, number | null> = {};
  if (axisMode !== "indexed") return baselines;

  for (const kpiSlug of kpiSlugs) {
    for (const year of selectedYears) {
      const key = trendSeriesKey(kpiSlug, year);
      const baseline = rawTrendData.find(
        (point) => point[key] != null && (point[key] as number) !== 0,
      )?.[key];
      baselines[key] = typeof baseline === "number" ? baseline : null;
    }
  }

  return baselines;
}

export function transformTrendData({
  axisMode,
  rawTrendData,
  indexedBaselines,
  kpiSlugs,
  selectedYears,
}: {
  axisMode: TrendAxisMode;
  rawTrendData: ComparisonPoint[];
  indexedBaselines: Record<string, number | null>;
  kpiSlugs: string[];
  selectedYears: number[];
}): ComparisonPoint[] {
  if (axisMode === "shared") return rawTrendData;

  return rawTrendData.map((point) => {
    const next: ComparisonPoint = { label: point.label, month: point.month };
    for (const kpiSlug of kpiSlugs) {
      for (const year of selectedYears) {
        const key = trendSeriesKey(kpiSlug, year);
        const raw = point[key];
        if (raw === null || raw === undefined) {
          next[key] = null;
          continue;
        }

        const value = raw as number;
        if (axisMode === "log") {
          next[key] = value > 0 ? Math.log10(value) : null;
          continue;
        }

        const baseline = indexedBaselines[key];
        next[key] = baseline ? (value / baseline) * 100 : null;
      }
    }
    return next;
  });
}

export function buildTrendExplorerModel(
  data: TrendExplorerData,
  selection: TrendExplorerSelection,
): TrendExplorerModel {
  const kpisBySlug = new Map(data.kpis.map((kpi) => [kpi.slug, kpi]));
  const visibleKPIs = filterVisibleTrendKpis(data.kpis, selection.categorySlug);
  const rawTrendData = buildRawTrendData({
    ...data,
    kpiSlugs: selection.kpiSlugs,
    selectedYears: selection.selectedYears,
  });
  const indexedBaselines = buildIndexedTrendBaselines({
    axisMode: selection.axisMode,
    rawTrendData,
    kpiSlugs: selection.kpiSlugs,
    selectedYears: selection.selectedYears,
  });
  const trendData = transformTrendData({
    axisMode: selection.axisMode,
    rawTrendData,
    indexedBaselines,
    kpiSlugs: selection.kpiSlugs,
    selectedYears: selection.selectedYears,
  });
  const selectedKpis = selection.kpiSlugs.flatMap((slug) => {
    const kpi = kpisBySlug.get(slug);
    return kpi ? [kpi] : [];
  });
  const sampleUnitType = selection.kpiSlugs[0]
    ? kpisBySlug.get(selection.kpiSlugs[0])?.unit_type ?? "count"
    : "count";

  return {
    visibleKPIs,
    selectedKpis,
    rawTrendData,
    trendData,
    indexedBaselines,
    sampleUnitType,
    series: buildTrendSeries({
      kpisBySlug,
      kpiSlugs: selection.kpiSlugs,
      selectedYears: selection.selectedYears,
      axisMode: selection.axisMode,
    }),
    csvExport: buildTrendCsvExport({
      rawTrendData,
      kpiSlugs: selection.kpiSlugs,
      selectedYears: selection.selectedYears,
    }),
    pngFileName: `eastern-state-trends-${selection.kpiSlugs.join("+")}-${selection.selectedYears.join("-")}.png`,
    selectedKpiFilterLabel: selection.kpiSlugs.length > 0
      ? selection.kpiSlugs.map((slug) => kpisBySlug.get(slug)?.name ?? slug).join(", ")
      : "None",
    selectedYearsFilterLabel: selection.selectedYears.length > 0
      ? selection.selectedYears.join(", ")
      : "None",
    axisModeHelp: TREND_AXIS_MODE_HELP[selection.axisMode],
    emptyState: buildEmptyState(selection),
  };
}

function buildTrendSeries({
  kpisBySlug,
  kpiSlugs,
  selectedYears,
  axisMode,
}: {
  kpisBySlug: Map<string, KPIWithCategory>;
  kpiSlugs: string[];
  selectedYears: number[];
  axisMode: TrendAxisMode;
}): TrendExplorerSeries[] {
  const series: TrendExplorerSeries[] = [];
  for (const [kpiIndex, slug] of kpiSlugs.entries()) {
    const kpi = kpisBySlug.get(slug);
    if (!kpi) continue;
    for (const [yearIndex, year] of selectedYears.entries()) {
      series.push({
        dataKey: trendSeriesKey(slug, year),
        name: trendSeriesName(kpi.name, year, axisMode),
        kpi,
        kpiIndex,
        year,
        yearIndex,
        isCurrentSelection: yearIndex === selectedYears.length - 1,
      });
    }
  }
  return series;
}

function trendSeriesKey(kpiSlug: string, year: number): string {
  return `${kpiSlug}__${year}`;
}

function trendSeriesName(
  kpiName: string,
  year: number,
  axisMode: TrendAxisMode,
): string {
  if (axisMode === "indexed") {
    return `${kpiName} ${year} (idx)`;
  }
  if (axisMode === "log") {
    return `${kpiName} ${year} (log)`;
  }
  return `${kpiName} ${year}`;
}

function buildEmptyState(
  selection: TrendExplorerSelection,
): TrendExplorerEmptyState | null {
  if (selection.kpiSlugs.length === 0) {
    return {
      title: "Select a KPI",
      description:
        "Use the control rail to choose a category, then pick KPIs and years to see the trend.",
    };
  }
  if (selection.selectedYears.length === 0) {
    return {
      title: "Select a year",
      description: "Choose at least one year to draw the selected measures.",
    };
  }
  return null;
}
