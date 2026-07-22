import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategicAuditEvent, StrategicGoalReadModel } from "@/features/strategy";
import type { KPIWithCategory } from "@/lib/types";
import type { StrategicCalculatedActual } from "./strategy-actuals";

const {
  isSampleDataEnabledMock,
  listCalculatedStrategyActualsMock,
  listKPIsMock,
  listStrategicAuditEventsMock,
  listStrategicAuditIdentitiesForKpiMock,
  listStrategicGoalsMock,
  getActiveInstallationMock,
  getBoardReportingScopeMock,
} = vi.hoisted(() => ({
  isSampleDataEnabledMock: vi.fn(),
  listCalculatedStrategyActualsMock: vi.fn(),
  listKPIsMock: vi.fn(),
  listStrategicAuditEventsMock: vi.fn(),
  listStrategicAuditIdentitiesForKpiMock: vi.fn(),
  listStrategicGoalsMock: vi.fn(),
  getActiveInstallationMock: vi.fn(),
  getBoardReportingScopeMock: vi.fn(),
}));

vi.mock("@/features/catalog/server", () => ({ listKPIs: listKPIsMock }));
vi.mock("@/features/strategy/server", () => ({
  listStrategicAuditEvents: listStrategicAuditEventsMock,
  listStrategicAuditIdentitiesForKpi: listStrategicAuditIdentitiesForKpiMock,
  listStrategicGoals: listStrategicGoalsMock,
}));
vi.mock("./strategy-actuals-server", () => ({
  listCalculatedStrategyActuals: listCalculatedStrategyActualsMock,
}));
vi.mock("@/lib/app-meta", () => ({
  isSampleDataEnabled: isSampleDataEnabledMock,
}));
vi.mock("@/features/installation/server", () => ({
  getActiveInstallation: getActiveInstallationMock,
}));
vi.mock("@/features/board-reporting", () => ({
  getBoardReportingScope: getBoardReportingScopeMock,
}));

import {
  listDashboardYears,
  listStrategicReportingPeriods,
  loadBoardReportPageData,
  loadExecutiveOverviewPageData,
  loadStrategicMetricPageData,
  loadStrategicPriorityPageData,
  loadStrategicTrendReportData,
} from "./server";

const metric: KPIWithCategory = {
  id: 10,
  category_id: 1,
  parent_id: null,
  slug: "video-views",
  name: "Video views",
  unit: "views",
  unit_type: "count",
  reporting_frequency: "annual",
  direction: "higher",
  description: null,
  sort_order: 1,
  is_active: 1,
  created_at: "2026-01-01",
  category_name: "Education",
  category_slug: "education",
};

const goal: StrategicGoalReadModel = {
  id: 700,
  priority_id: 1,
  priority_slug: "education",
  priority_name: "Education",
  slug: "digital-learning",
  name: "Expand digital learning",
  description: null,
  plan_start_year: 2025,
  plan_end_year: 2029,
  completion_rule: "all_required_kpis",
  threshold_count: null,
  threshold_percentage: null,
  manual_status: null,
  board_level_status: "on_track",
  configuration_status: "active",
  unresolved_question: null,
  owner: null,
  due_date: null,
  resolution_notes: null,
  source_reference: null,
  last_reviewed_date: null,
  sort_order: 1,
  archived_at: null,
  created_by: null,
  created_at: "2026-01-01",
  updated_by: null,
  updated_at: "2026-01-01",
  members: [{
    id: 701,
    goal_id: 700,
    kpi_id: metric.id,
    role: "required",
    weight: 1,
    display_order: 1,
    effective_from_year: 2025,
    effective_to_year: null,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01",
    updated_by: null,
    updated_at: "2026-01-01",
    kpi: {
      id: metric.id,
      slug: metric.slug,
      name: metric.name,
      unit: metric.unit,
      category_id: metric.category_id,
      category_slug: metric.category_slug,
      category_name: metric.category_name,
    },
    configuration: {
      id: 702,
      kpi_id: metric.id,
      effective_from_year: 2025,
      effective_to_year: null,
      measurement_type: "count",
      unit: "views",
      numerator_label: null,
      denominator_label: null,
      fixed_denominator: null,
      baseline_value: null,
      reporting_frequency: "annual",
      aggregation_method: null,
      board_level_status: "on_track",
      calculation_precision: 0,
      configuration_status: "active",
      unresolved_question: null,
      owner: null,
      due_date: null,
      resolution_notes: null,
      source_reference: null,
      last_reviewed_date: null,
      allow_score_over_max: false,
      archived_at: null,
      created_by: null,
      created_at: "2026-01-01",
      updated_by: null,
      updated_at: "2026-01-01",
    },
    targets: [],
    components: [],
  }],
};

/** Supports the actual test scenario. */
function actual(year: number, periodType: StrategicCalculatedActual["periodType"], periodIndex: number, value: number): StrategicCalculatedActual {
  return {
    kpiId: metric.id,
    year,
    periodType,
    periodIndex,
    value,
    calculation: {
      state: "ok",
      measurementType: "count",
      value,
      normalizedPercentage: null,
      numerator: null,
      denominator: null,
      respondentCount: null,
      precision: 0,
      issues: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listKPIsMock.mockReturnValue([metric]);
  listStrategicGoalsMock.mockReturnValue([goal]);
  listCalculatedStrategyActualsMock.mockReturnValue([actual(2026, "annual", 0, 12)]);
  listStrategicAuditIdentitiesForKpiMock.mockReturnValue([
    { entity_type: "kpi", entity_id: metric.id },
  ]);
  listStrategicAuditEventsMock.mockReturnValue([]);
  isSampleDataEnabledMock.mockReturnValue(true);
  getActiveInstallationMock.mockReturnValue({
    organization: {
      id: 1,
      slug: "example-museum",
      name: "Example Museum",
      shortName: "Example",
    },
    plan: { id: 2, startYear: 2025, endYear: 2029 },
    years: [2025, 2026, 2027, 2028, 2029],
  });
  getBoardReportingScopeMock.mockReturnValue({
    id: 1,
    planId: 2,
    revision: 1,
    priorities: [{
      id: 1,
      priorityId: 1,
      prioritySlug: "justice-education",
      priorityName: "Support Learning through Justice Education",
      displayTitle: "Support Learning through Justice Education",
      displayOrder: 10,
      statements: [{
        id: 1,
        text: "Increase online engagement.",
        displayOrder: 10,
        measures: [{
          id: 11,
          slug: "justice-ed-online-digital-attendance",
          name: "Online digital attendance",
        }],
      }],
    }],
  });
});

describe("strategic reporting server", () => {
  it("filters Board reporting to the explicit priority and measure allowlist", () => {
    const boardMetric: KPIWithCategory = {
      ...metric,
      id: 11,
      slug: "justice-ed-online-digital-attendance",
      name: "Online digital attendance",
      category_slug: "justice-education",
      category_name: "Justice Education",
    };
    const boardGoal: StrategicGoalReadModel = {
      ...goal,
      id: 710,
      priority_slug: "justice-education",
      priority_name: "Support Learning through Justice Education",
      members: goal.members.map((member) => ({
        ...member,
        id: 711,
        goal_id: 710,
        kpi_id: boardMetric.id,
        kpi: {
          ...member.kpi,
          id: boardMetric.id,
          slug: boardMetric.slug,
          name: boardMetric.name,
          category_slug: boardMetric.category_slug,
          category_name: boardMetric.category_name,
        },
        configuration: member.configuration
          ? { ...member.configuration, kpi_id: boardMetric.id }
          : null,
      })),
    };
    listKPIsMock.mockReturnValue([metric, boardMetric]);
    listStrategicGoalsMock.mockReturnValue([goal, boardGoal]);

    const report = loadBoardReportPageData({ year: 2026, audience: "board" }).report;
    const slugsById = new Map([[String(boardMetric.id), boardMetric.slug]]);
    const visibleSlugs = report.priorities.flatMap((priority) =>
      priority.goals.flatMap((item) =>
        item.kpis.map((kpi) => slugsById.get(kpi.id)),
      ),
    );

    expect(visibleSlugs).toEqual(["justice-ed-online-digital-attendance"]);
    expect(report.priorities.map((priority) => priority.name)).toEqual([
      "Support Learning through Justice Education",
    ]);
  });

  it("uses only strategic plan years and configured reporting periods", () => {
    getActiveInstallationMock.mockReturnValue({
      organization: {
        id: 1,
        slug: "example-museum",
        name: "Example Museum",
        shortName: "Example",
      },
      plan: { id: 2, startYear: 2030, endYear: 2032 },
      years: [2030, 2031, 2032],
    });
    expect(listDashboardYears()).toEqual([2030, 2031, 2032]);
    expect(listStrategicReportingPeriods(2031).map((period) => period.label)).toContain("Full year");
  });

  it("keeps Overview narrow and report-free", () => {
    const data = loadExecutiveOverviewPageData({ year: 2026 });
    expect(data.summary.selectedYear).toBe(2026);
    expect(data).not.toHaveProperty("report");
    expect(data).not.toHaveProperty("entries");
    expect(data).not.toHaveProperty("breakdowns");
  });

  it("carries the selected reporting period into the visible report and exports", () => {
    const reportingPeriod = {
      value: "quarterly:2",
      label: "Quarter 2",
      periodType: "quarterly" as const,
      periodIndex: 2,
    };
    const data = loadBoardReportPageData({
      year: 2026,
      throughMonth: 6,
      reportingPeriod,
    });
    expect(data.report.reportingPeriod).toBe("Quarter 2");
    expect(data.report.organizationName).toBe("Example Museum");
  });

  it("keeps a monthly Board Report from absorbing annual or future records", () => {
    const monthlyGoal = structuredClone(goal);
    monthlyGoal.members[0]!.configuration!.reporting_frequency = "monthly";
    listStrategicGoalsMock.mockReturnValue([monthlyGoal]);
    listCalculatedStrategyActualsMock.mockReturnValue([
      actual(2026, "monthly", 1, 3),
      actual(2026, "monthly", 2, 4),
      actual(2026, "annual", 0, 99),
    ]);

    const data = loadBoardReportPageData({
      year: 2026,
      throughMonth: 1,
      reportingPeriod: {
        value: "monthly:1",
        label: "January",
        periodType: "monthly",
        periodIndex: 1,
      },
    });

    expect(data.report.priorities[0]?.goals[0]?.kpis[0]?.result.value).toBe(3);
  });

  it("loads a priority from the strategic report and supplies canonical measure slugs", () => {
    const data = loadStrategicPriorityPageData("education", { year: 2026 });
    expect(data).toMatchObject({
      selectedYear: 2026,
      prioritySlug: "education",
      kpiSlugs: { "10": "video-views" },
      priority: { name: "Education" },
    });
    expect(loadStrategicPriorityPageData("missing", { year: 2026 })).toBeNull();
  });

  it("loads a measure from strategic actuals and requests audit only when asked", () => {
    const event: StrategicAuditEvent = {
      id: 900,
      entity_type: "target",
      entity_id: 703,
      event_type: "update",
      entity_display_name: "Video views target",
      parent_priority_name: "Education",
      parent_goal_name: goal.name,
      previous_value: { target_value: 10 },
      new_value: { target_value: 12 },
      actor_id: null,
      actor_email_snapshot: null,
      source_reference: null,
      occurred_at: "2026-07-13 12:00:00",
    };
    listStrategicAuditEventsMock.mockReturnValue([event]);

    const data = loadStrategicMetricPageData("video-views", {
      year: 2026,
      includeAudit: true,
    });
    expect(data?.actuals).toHaveLength(1);
    expect(data?.goalId).toBe(goal.id);
    expect(data?.strategicAuditEvents).toEqual([event]);
    expect(listStrategicAuditIdentitiesForKpiMock).toHaveBeenCalledWith(metric.id);
    expect(loadStrategicMetricPageData("missing", { year: 2026 })).toBeNull();
  });

  it("honors the selected year and period cutoff in Trends", () => {
    listCalculatedStrategyActualsMock.mockReturnValue([
      actual(2025, "annual", 0, 5),
      actual(2026, "monthly", 2, 6),
      actual(2026, "monthly", 8, 9),
    ]);
    const data = loadStrategicTrendReportData({ year: 2026, throughMonth: 6 });
    expect(data.years).toEqual([2025, 2026]);
    expect(data.series[0]?.points).toEqual([
      { year: 2025, value: 5 },
      { year: 2026, value: 6 },
    ]);
  });

  it("compares the same reporting cycle across years in Trends", () => {
    listCalculatedStrategyActualsMock.mockReturnValue([
      actual(2025, "monthly", 1, 2),
      actual(2025, "annual", 0, 50),
      actual(2026, "monthly", 1, 3),
      actual(2026, "monthly", 2, 4),
      actual(2026, "annual", 0, 99),
    ]);

    const data = loadStrategicTrendReportData({
      year: 2026,
      throughMonth: 1,
      reportingPeriod: {
        value: "monthly:1",
        label: "January",
        periodType: "monthly",
        periodIndex: 1,
      },
    });

    expect(data.series[0]?.points).toEqual([
      { year: 2025, value: 2 },
      { year: 2026, value: 3 },
    ]);
  });
});
