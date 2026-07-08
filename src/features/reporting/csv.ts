import {
  buildKPIAnalytics,
} from "@/lib/analytics";
import {
  MONTH_FULL,
  MONTH_LABELS,
  MONTH_NUMBERS,
  isAnnualEntryMonth,
  isAnnualReportingFrequency,
  isMonthlyEntryMonth,
} from "@/features/metrics";
import type {
  ComparisonPoint,
  KPIWithCategory,
  MonthlyEntryWithMeta,
} from "@/lib/types";
import type { ComparePeriod, MetricValueRow, ReportingData } from "./types";

export type CsvValue = string | number | null;
export type CsvRow = Record<string, CsvValue>;

export interface CsvExport {
  columns: string[];
  rows: CsvRow[];
  filename: string;
}

export const OVERVIEW_CSV_COLUMNS = [
  "Category",
  "KPI",
  "Unit",
  "Reporting",
  "Year",
  "Period",
  "Value",
  "Compare_Year",
  "Compare_Value",
  "Notes",
];

export const CATEGORY_CSV_COLUMNS = [
  "KPI",
  "Unit",
  "Reporting",
  "Year",
  "Period",
  "Value",
  "Compare_Year",
  "Compare_Value",
  "Notes",
];

export function buildOverviewCsvExport(
  data: ReportingData,
  period: ComparePeriod,
): CsvExport {
  const rows: CsvRow[] = [];
  for (const category of data.categories) {
    const categoryKpis = data.kpis.filter((kpi) => kpi.category_id === category.id);
    for (const kpi of categoryKpis) {
      if (kpi.unit_type === "breakdown") {
        for (const row of data.breakdowns.filter(
          (b) => b.kpi_id === kpi.id && (b.year === period.currentYear || b.year === period.compareYear),
        )) {
          rows.push({
            Category: category.name,
            KPI: kpi.name,
            Unit: kpi.unit_type,
            Reporting: "breakdown",
            Year: row.year,
            Period: row.label,
            Value: row.value,
            Compare_Year: "",
            Compare_Value: "",
            Notes: "",
          });
        }
        continue;
      }

      const kpiEntries = data.entries.filter((entry) => entry.kpi_id === kpi.id);
      if (isAnnualReportingFrequency(kpi.reporting_frequency)) {
        const years = Array.from(new Set(kpiEntries.map((entry) => entry.year))).sort((a, b) => a - b);
        for (const year of years) {
          const entry = kpiEntries.find((e) => e.year === year && isAnnualEntryMonth(e.month));
          rows.push({
            Category: category.name,
            KPI: kpi.name,
            Unit: kpi.unit_type,
            Reporting: "annual",
            Year: year,
            Period: "full year",
            Value: entry?.value ?? "",
            Compare_Year: "",
            Compare_Value: "",
            Notes: entry?.notes ?? "",
          });
        }
        continue;
      }

      const monthsToShow = Math.min(period.currentMonth, 12);
      for (const month of MONTH_NUMBERS.slice(0, monthsToShow)) {
        const current = kpiEntries.find(
          (entry) => entry.year === period.currentYear && entry.month === month,
        );
        const compare = kpiEntries.find(
          (entry) => entry.year === period.compareYear && entry.month === month,
        );
        rows.push({
          Category: category.name,
          KPI: kpi.name,
          Unit: kpi.unit_type,
          Reporting: "monthly",
          Year: period.currentYear,
          Period: MONTH_FULL[month - 1],
          Value: current?.value ?? "",
          Compare_Year: period.compareYear,
          Compare_Value: compare?.value ?? "",
          Notes: current?.notes ?? "",
        });
      }
    }
  }

  return {
    columns: OVERVIEW_CSV_COLUMNS,
    rows,
    filename: `eastern-state-overview-${period.currentYear}-vs-${period.compareYear}.csv`,
  };
}

export function buildCategoryCsvExport(
  data: ReportingData,
  categorySlug: string,
  period: ComparePeriod,
): CsvExport {
  const rows: CsvRow[] = [];
  const categoryKpis = data.kpis.filter((kpi) => kpi.category_slug === categorySlug);
  const monthlyKpis = categoryKpis.filter((kpi) => kpi.unit_type !== "breakdown");
  const breakdownKpis = categoryKpis.filter((kpi) => kpi.unit_type === "breakdown");

  for (const kpi of monthlyKpis) {
    const kpiEntries = data.entries.filter((entry) => entry.kpi_id === kpi.id);
    const analytics = buildKPIAnalytics({
      kpi,
      entries: kpiEntries,
      currentYear: period.currentYear,
      compareYear: period.compareYear,
      currentMonth: period.currentMonth,
    });

    if (isAnnualReportingFrequency(kpi.reporting_frequency)) {
      for (const year of analytics.years) {
        rows.push({
          KPI: kpi.name,
          Unit: kpi.unit_type,
          Reporting: "annual",
          Year: year.year,
          Period: "full year",
          Value: year.fullYearValue ?? "",
          Compare_Value: "",
          Notes: "",
        });
      }
      continue;
    }

    const monthsToShow = Math.min(period.currentMonth, 12);
    for (const month of MONTH_NUMBERS) {
      const current = data.entries.find(
        (entry) => entry.kpi_id === kpi.id && entry.year === period.currentYear && entry.month === month,
      );
      const compare = data.entries.find(
        (entry) => entry.kpi_id === kpi.id && entry.year === period.compareYear && entry.month === month,
      );
      if (current || compare || month <= monthsToShow) {
        rows.push({
          KPI: kpi.name,
          Unit: kpi.unit_type,
          Reporting: "monthly",
          Year: month <= monthsToShow ? period.currentYear : "",
          Period: MONTH_FULL[month - 1],
          Value: current?.value ?? "",
          Compare_Value: compare?.value ?? "",
          Compare_Year: month <= monthsToShow ? period.compareYear : "",
          Notes: current?.notes ?? "",
        });
      }
    }
  }

  for (const kpi of breakdownKpis) {
    for (const row of data.breakdowns.filter(
      (breakdown) =>
        breakdown.kpi_id === kpi.id &&
        (breakdown.year === period.currentYear || breakdown.year === period.compareYear),
    )) {
      rows.push({
        KPI: kpi.name,
        Unit: kpi.unit_type,
        Reporting: isMonthlyEntryMonth(row.month) ? "monthly breakdown" : "breakdown",
        Year: row.year,
        Period: isMonthlyEntryMonth(row.month) ? `${MONTH_FULL[row.month - 1]} - ${row.label}` : row.label,
        Value: row.value,
        Compare_Value: "",
        Notes: "",
      });
    }
  }

  return {
    columns: CATEGORY_CSV_COLUMNS,
    rows,
    filename: `eastern-state-${categorySlug}-${period.currentYear}-vs-${period.compareYear}.csv`,
  };
}

export function buildMetricValueRows({
  kpi,
  entries,
  period,
}: {
  kpi: KPIWithCategory;
  entries: MonthlyEntryWithMeta[];
  period: ComparePeriod;
}): MetricValueRow[] {
  const analytics = buildKPIAnalytics({
    kpi,
    entries,
    currentYear: period.currentYear,
    compareYear: period.compareYear,
    currentMonth: period.currentMonth,
  });

  if (isAnnualReportingFrequency(kpi.reporting_frequency)) {
    return analytics.years.map((year) => ({
      period: String(year.year),
      value: year.fullYearValue,
      notes: entries.find((entry) => entry.year === year.year && isAnnualEntryMonth(entry.month))?.notes ?? null,
    }));
  }

  return MONTH_LABELS.map((label, index) => {
    const month = index + 1;
    const current = entries.find(
      (entry) => entry.year === period.currentYear && entry.month === month,
    );
    const compare = entries.find(
      (entry) => entry.year === period.compareYear && entry.month === month,
    );
    return {
      period: `${label} ${period.currentYear}`,
      value: current?.value,
      notes: current?.notes ?? null,
      compare: compare?.value,
    };
  });
}

export function buildMetricCsvExport({
  kpi,
  rows,
  period,
}: {
  kpi: KPIWithCategory;
  rows: MetricValueRow[];
  period: ComparePeriod;
}): CsvExport {
  if (isAnnualReportingFrequency(kpi.reporting_frequency)) {
    return {
      columns: ["Year", "Value", "Notes"],
      rows: rows.map((row) => ({
        Year: row.period,
        Value: row.value ?? "",
        Notes: row.notes ?? "",
      })),
      filename: `eastern-state-${kpi.slug}-${period.currentYear}-vs-${period.compareYear}.csv`,
    };
  }

  const currentColumn = `Value (${period.currentYear})`;
  const compareColumn = `Value (${period.compareYear})`;
  return {
    columns: ["Period", currentColumn, compareColumn, "Notes"],
    rows: rows.map((row) => ({
      Period: row.period,
      [currentColumn]: row.value ?? "",
      [compareColumn]: row.compare ?? "",
      Notes: row.notes ?? "",
    })),
    filename: `eastern-state-${kpi.slug}-${period.currentYear}-vs-${period.compareYear}.csv`,
  };
}

export function buildTrendCsvExport({
  rawTrendData,
  kpiSlugs,
  selectedYears,
}: {
  rawTrendData: ComparisonPoint[];
  kpiSlugs: string[];
  selectedYears: number[];
}): CsvExport {
  const columns = [
    "Month",
    ...kpiSlugs.flatMap((slug) => selectedYears.map((year) => `${slug}__${year}`)),
  ];
  const rows = rawTrendData.map((point) => {
    const row: CsvRow = { Month: String(point.label) };
    for (const slug of kpiSlugs) {
      for (const year of selectedYears) {
        const key = `${slug}__${year}`;
        row[key] = point[key] != null ? Number(point[key]) : "";
      }
    }
    return row;
  });
  return {
    columns,
    rows,
    filename: `eastern-state-trends-${kpiSlugs.join("+")}-${selectedYears.join("-")}.csv`,
  };
}
