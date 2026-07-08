import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BreakdownEntryWithMeta,
  Category,
  KPIWithCategory,
  KpiGoalWithMeta,
  MonthlyEntryWithMeta,
} from "@/lib/types";

const {
  getCategoryBySlugMock,
  getCategoryMock,
  getKPIBySlugMock,
  isSampleDataEnabledMock,
  listAvailableYearsMock,
  listBreakdownsMock,
  listCategoriesMock,
  listEntriesMock,
  listGoalsMock,
  listKPIsMock,
} = vi.hoisted(() => ({
  getCategoryBySlugMock: vi.fn(),
  getCategoryMock: vi.fn(),
  getKPIBySlugMock: vi.fn(),
  isSampleDataEnabledMock: vi.fn(),
  listAvailableYearsMock: vi.fn(),
  listBreakdownsMock: vi.fn(),
  listCategoriesMock: vi.fn(),
  listEntriesMock: vi.fn(),
  listGoalsMock: vi.fn(),
  listKPIsMock: vi.fn(),
}));

vi.mock("@/features/catalog/server", () => ({
  getCategory: getCategoryMock,
  getCategoryBySlug: getCategoryBySlugMock,
  getKPIBySlug: getKPIBySlugMock,
  listCategories: listCategoriesMock,
  listKPIs: listKPIsMock,
}));

vi.mock("@/features/goals", () => ({
  listGoals: listGoalsMock,
}));

vi.mock("@/features/metrics/server", () => ({
  listAvailableYears: listAvailableYearsMock,
  listBreakdowns: listBreakdownsMock,
  listEntries: listEntriesMock,
}));

vi.mock("@/lib/app-meta", () => ({
  isSampleDataEnabled: isSampleDataEnabledMock,
}));

import {
  loadCategoryPageData,
  loadMetricDetailPageData,
  loadOverviewPageData,
  loadTrendExplorerPageData,
} from "./server";

const education: Category = {
  id: 1,
  slug: "education",
  name: "Education",
  description: "Education category",
  sort_order: 1,
};
const museum: Category = {
  id: 2,
  slug: "museum",
  name: "Museum",
  description: "Museum category",
  sort_order: 2,
};

function kpi(
  id: number,
  category: Category,
  slug: string,
  reportingFrequency: KPIWithCategory["reporting_frequency"],
  unitType: KPIWithCategory["unit_type"],
): KPIWithCategory {
  return {
    id,
    category_id: category.id,
    parent_id: null,
    slug,
    name: slug,
    unit: "count",
    unit_type: unitType,
    reporting_frequency: reportingFrequency,
    direction: "higher",
    description: null,
    sort_order: id,
    is_active: 1,
    created_at: "2026-01-01",
    category_name: category.name,
    category_slug: category.slug,
  };
}

const videoViews = kpi(10, education, "video-views", "monthly", "count");
const annualPrograms = kpi(11, education, "annual-programs", "annual", "count");
const educationBreakdown = kpi(12, education, "education-breakdown", "annual", "breakdown");
const museumAttendance = kpi(20, museum, "museum-attendance", "monthly", "attendance");
const kpis = [videoViews, annualPrograms, educationBreakdown, museumAttendance];

function entry(id: number, metric: KPIWithCategory): MonthlyEntryWithMeta {
  return {
    id,
    kpi_id: metric.id,
    year: 2026,
    month: metric.reporting_frequency === "annual" ? 0 : 1,
    value: id * 10,
    notes: null,
    updated_by: null,
    updated_at: "2026-01-01",
    kpi_name: metric.name,
    kpi_unit: metric.unit,
    kpi_unit_type: metric.unit_type,
    category_id: metric.category_id,
    category_name: metric.category_name,
    category_slug: metric.category_slug,
  };
}

const entries = [
  entry(1, videoViews),
  entry(2, annualPrograms),
  entry(3, museumAttendance),
];

const breakdown = {
  id: 1,
  kpi_id: educationBreakdown.id,
  year: 2026,
  month: 0,
  label: "A",
  value: 5,
  sort_order: 0,
  notes: null,
  updated_by: null,
  updated_at: "2026-01-01",
  kpi_name: educationBreakdown.name,
  kpi_unit: educationBreakdown.unit,
  category_id: education.id,
  category_name: education.name,
  category_slug: education.slug,
} satisfies BreakdownEntryWithMeta;

const goal = {
  id: 1,
  kpi_id: videoViews.id,
  target_year: 2026,
  goal_type: "number",
  target_value: 10,
  enabled: true,
  notes: null,
  created_by: null,
  created_at: "2026-01-01",
  updated_by: null,
  updated_at: "2026-01-01",
  kpi_name: videoViews.name,
  kpi_slug: videoViews.slug,
  kpi_unit: videoViews.unit,
  kpi_unit_type: videoViews.unit_type,
  category_id: education.id,
  category_name: education.name,
  category_slug: education.slug,
  direction: videoViews.direction,
  reporting_frequency: videoViews.reporting_frequency,
  ytd_value: 5,
  ytd_target: 5,
  ytd_progress_pct: 100,
  full_year_value: 10,
  full_year_target: 10,
  full_year_progress_pct: 100,
} satisfies KpiGoalWithMeta;

beforeEach(() => {
  vi.clearAllMocks();
  listCategoriesMock.mockReturnValue([education, museum]);
  listKPIsMock.mockReturnValue(kpis);
  listAvailableYearsMock.mockReturnValue([2024, 2025, 2026]);
  isSampleDataEnabledMock.mockReturnValue(true);
  getCategoryBySlugMock.mockImplementation(
    (slug: string) => [education, museum].find((category) => category.slug === slug) ?? null,
  );
  getCategoryMock.mockImplementation(
    (id: number) => [education, museum].find((category) => category.id === id) ?? null,
  );
  getKPIBySlugMock.mockImplementation(
    (slug: string) => kpis.find((metric) => metric.slug === slug) ?? null,
  );
  listEntriesMock.mockImplementation((filter?: {
    category_id?: number;
    kpi_id?: number;
    kpi_ids?: number[];
  }) => {
    if (filter?.category_id !== undefined) {
      return entries.filter((row) => row.category_id === filter.category_id);
    }
    if (filter?.kpi_id !== undefined) {
      return entries.filter((row) => row.kpi_id === filter.kpi_id);
    }
    if (filter?.kpi_ids !== undefined) {
      return entries.filter((row) => filter.kpi_ids?.includes(row.kpi_id));
    }
    return entries;
  });
  listBreakdownsMock.mockImplementation((filter?: {
    category_id?: number;
    kpi_id?: number;
  }) => {
    if (filter?.category_id !== undefined && filter.category_id !== education.id) return [];
    if (filter?.kpi_id !== undefined && filter.kpi_id !== educationBreakdown.id) return [];
    return [breakdown];
  });
  listGoalsMock.mockImplementation((filter?: {
    category_id?: number;
    kpi_id?: number;
  }) => {
    if (filter?.category_id !== undefined && filter.category_id !== education.id) return [];
    if (filter?.kpi_id !== undefined && filter.kpi_id !== videoViews.id) return [];
    return [goal];
  });
});

describe("reporting server page data", () => {
  it("loads the complete dataset only for the overview's instant period controls", () => {
    const data = loadOverviewPageData({ year: 2026, throughMonth: 6 });

    expect(data).toMatchObject({
      categories: [education, museum],
      kpis,
      entries,
      breakdowns: [breakdown],
      goals: [goal],
      years: [2024, 2025, 2026],
      sampleData: true,
    });
    expect(listEntriesMock).toHaveBeenCalledWith();
    expect(listBreakdownsMock).toHaveBeenCalledWith();
    expect(listGoalsMock).toHaveBeenCalledWith({
      enabledOnly: true,
      throughMonth: 6,
      year: 2026,
    });
  });

  it("limits category page data to the selected category", () => {
    const data = loadCategoryPageData("education", {
      year: 2026,
      throughMonth: 6,
    });

    expect(data).toMatchObject({
      categories: [education],
      kpis: [videoViews, annualPrograms, educationBreakdown],
      entries: [entries[0], entries[1]],
      breakdowns: [breakdown],
      goals: [goal],
    });
    expect(listEntriesMock).toHaveBeenCalledWith({ category_id: education.id });
    expect(listBreakdownsMock).toHaveBeenCalledWith({ category_id: education.id });
    expect(listGoalsMock).toHaveBeenCalledWith({
      category_id: education.id,
      enabledOnly: true,
      throughMonth: 6,
      year: 2026,
    });
  });

  it("limits metric page data to the selected KPI and its category", () => {
    const data = loadMetricDetailPageData("video-views", {
      year: 2026,
      throughMonth: 6,
    });

    expect(data).toMatchObject({
      categories: [education],
      kpis: [videoViews],
      entries: [entries[0]],
      breakdowns: [],
      goals: [goal],
    });
    expect(listEntriesMock).toHaveBeenCalledWith({ kpi_id: videoViews.id });
    expect(listBreakdownsMock).toHaveBeenCalledWith({ kpi_id: videoViews.id });
    expect(listGoalsMock).toHaveBeenCalledWith({
      enabledOnly: true,
      kpi_id: videoViews.id,
      throughMonth: 6,
      year: 2026,
    });
  });

  it("loads only trend-eligible monthly non-breakdown KPI entries", () => {
    const data = loadTrendExplorerPageData();

    expect(data.kpis).toEqual([videoViews, museumAttendance]);
    expect(data.entries).toEqual([entries[0], entries[2]]);
    expect(listEntriesMock).toHaveBeenCalledWith({
      kpi_ids: [videoViews.id, museumAttendance.id],
    });
  });

  it("returns null before loading row data for unknown category or KPI slugs", () => {
    expect(loadCategoryPageData("missing", { year: 2026, throughMonth: 6 })).toBeNull();
    expect(loadMetricDetailPageData("missing", { year: 2026, throughMonth: 6 })).toBeNull();
    expect(listEntriesMock).not.toHaveBeenCalled();
    expect(listBreakdownsMock).not.toHaveBeenCalled();
  });
});
