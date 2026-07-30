import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategicAuditEvent, StrategicGoalReadModel } from "@/features/strategy";
import type { KPIWithCategory } from "@/lib/types";
import type { StrategicCalculatedActual } from "./strategy-actuals";
import type { ReportingPlanContext } from "./types";

const {
  isSampleDataEnabledMock,
  listCalculatedStrategyActualsMock,
  listKPIsMock,
  listKpiIdsWithArchivedIntervalValuesMock,
  listStrategicAuditEventsMock,
  listStrategicAuditIdentitiesForKpiMock,
  listStrategicGoalsMock,
  listStrategicGoalsForReportingDisclosureMock,
  getActiveInstallationMock,
  getBoardReportingDisclosureScopeMock,
} = vi.hoisted(() => ({
  isSampleDataEnabledMock: vi.fn(),
  listCalculatedStrategyActualsMock: vi.fn(),
  listKPIsMock: vi.fn(),
  listKpiIdsWithArchivedIntervalValuesMock: vi.fn(),
  listStrategicAuditEventsMock: vi.fn(),
  listStrategicAuditIdentitiesForKpiMock: vi.fn(),
  listStrategicGoalsMock: vi.fn(),
  listStrategicGoalsForReportingDisclosureMock: vi.fn(),
  getActiveInstallationMock: vi.fn(),
  getBoardReportingDisclosureScopeMock: vi.fn(),
}));

vi.mock("@/features/catalog/server", () => ({ listKPIs: listKPIsMock }));
vi.mock("@/features/strategy/server", () => ({
  listKpiIdsWithArchivedIntervalValues: listKpiIdsWithArchivedIntervalValuesMock,
  listStrategicAuditEvents: listStrategicAuditEventsMock,
  listStrategicAuditIdentitiesForKpi: listStrategicAuditIdentitiesForKpiMock,
  listStrategicGoals: listStrategicGoalsMock,
  listStrategicGoalsForReportingDisclosure:
    listStrategicGoalsForReportingDisclosureMock,
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
  getBoardReportingDisclosureScope: getBoardReportingDisclosureScopeMock,
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

const archivedPlan: ReportingPlanContext = {
  id: 19,
  slug: "strategic-plan-2020-2024",
  name: "Strategic Plan 2020–2024",
  startYear: 2020,
  endYear: 2024,
  lifecycleState: "archived",
  years: [2020, 2021, 2022, 2023, 2024],
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
  listStrategicGoalsForReportingDisclosureMock.mockReturnValue([goal]);
  listCalculatedStrategyActualsMock.mockReturnValue([actual(2026, "annual", 0, 12)]);
  listStrategicAuditIdentitiesForKpiMock.mockReturnValue([
    { entity_type: "kpi", entity_id: metric.id },
  ]);
  listStrategicAuditEventsMock.mockReturnValue([]);
  listKpiIdsWithArchivedIntervalValuesMock.mockReturnValue(new Set<number>());
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
  getBoardReportingDisclosureScopeMock.mockReturnValue({
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
  it("threads an explicit Archived plan through Board scope, plan-owned reads, and export metadata", () => {
    getBoardReportingDisclosureScopeMock.mockReturnValue({
      id: 8,
      planId: archivedPlan.id,
      revision: 3,
      priorities: [{
        id: 9,
        priorityId: 1,
        prioritySlug: goal.priority_slug,
        priorityName: goal.priority_name,
        displayTitle: "Archived Education",
        displayOrder: 10,
        statements: [{
          id: 10,
          text: "Preserved Board focus.",
          displayOrder: 10,
          measures: [{
            id: metric.id,
            slug: metric.slug,
            name: metric.name,
          }],
        }],
      }],
    });
    const data = loadBoardReportPageData({
      year: 2024,
      audience: "board",
      plan: archivedPlan,
    });

    expect(listStrategicGoalsForReportingDisclosureMock).toHaveBeenCalledWith({
      year: 2024,
      planId: archivedPlan.id,
    });
    expect(getBoardReportingDisclosureScopeMock).toHaveBeenCalledWith(
      archivedPlan.id,
    );
    expect(listKPIsMock).toHaveBeenCalledWith({ planId: archivedPlan.id });
    expect(listCalculatedStrategyActualsMock).toHaveBeenCalledWith({
      kpiIds: [metric.id],
      throughYear: 2024,
      planStartYear: archivedPlan.startYear,
    });
    expect(data.years).toEqual(archivedPlan.years);
    expect(data.report.plan).toMatchObject({
      id: archivedPlan.id,
      slug: archivedPlan.slug,
      name: archivedPlan.name,
      startYear: archivedPlan.startYear,
      endYear: archivedPlan.endYear,
      lifecycleState: "archived",
      generatedAt: expect.any(String),
    });
  });

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
    listStrategicGoalsForReportingDisclosureMock.mockReturnValue([goal, boardGoal]);
    getBoardReportingDisclosureScopeMock.mockReturnValue({
      ...getBoardReportingDisclosureScopeMock(),
      priorities: [{
        ...getBoardReportingDisclosureScopeMock().priorities[0],
        displayTitle: "Board learning focus",
      }],
    });

    const report = loadBoardReportPageData({ year: 2026, audience: "board" }).report;
    const slugsById = new Map([[String(boardMetric.id), boardMetric.slug]]);
    const visibleSlugs = report.priorities.flatMap((priority) =>
      priority.goals.flatMap((item) =>
        item.kpis.map((kpi) => slugsById.get(kpi.id)),
      ),
    );

    expect(visibleSlugs).toEqual(["justice-ed-online-digital-attendance"]);
    expect(report.priorities.map((priority) => priority.name)).toEqual([
      "Board learning focus",
    ]);
    expect(loadStrategicTrendReportData({ year: 2026, audience: "board" }).series)
      .toEqual([expect.objectContaining({ priorityName: "Board learning focus" })]);
    expect(loadStrategicMetricPageData(boardMetric.slug, {
      year: 2026,
      audience: "board",
    })?.priorityName).toBe("Board learning focus");
  });

  it("does not authorize a shared measure under a different visible priority", () => {
    const sharedMember = {
      ...goal.members[0],
      kpi_id: metric.id,
      kpi: { ...goal.members[0].kpi, id: metric.id, slug: metric.slug },
    };
    const otherGoal: StrategicGoalReadModel = {
      ...goal,
      id: 701,
      priority_id: 2,
      priority_slug: "preservation",
      priority_name: "Preservation",
      members: [{ ...sharedMember, id: 702, goal_id: 701 }],
    };
    listStrategicGoalsForReportingDisclosureMock.mockReturnValue([
      { ...goal, members: [{ ...sharedMember, id: 703, goal_id: goal.id }] },
      otherGoal,
    ]);
    getBoardReportingDisclosureScopeMock.mockReturnValue({
      id: 1,
      planId: 2,
      revision: 2,
      priorities: [
        {
          id: 1,
          priorityId: 1,
          prioritySlug: "education",
          priorityName: "Education",
          displayTitle: "Board education",
          displayOrder: 10,
          statements: [{ id: 1, text: "Education focus", displayOrder: 10, measures: [] }],
        },
        {
          id: 2,
          priorityId: 2,
          prioritySlug: "preservation",
          priorityName: "Preservation",
          displayTitle: "Board preservation",
          displayOrder: 20,
          statements: [{
            id: 2,
            text: "Preservation focus",
            displayOrder: 10,
            measures: [{ id: metric.id, slug: metric.slug, name: metric.name }],
          }],
        },
      ],
    });

    const report = loadBoardReportPageData({ year: 2026, audience: "board" }).report;
    expect(report.priorities).toHaveLength(1);
    expect(report.priorities[0]?.name).toBe("Board preservation");
    expect(report.priorities[0]?.goals.flatMap((item) => item.kpis)).toHaveLength(1);
  });

  it("keeps scoped archived-only goals so Board reports disclose exclusions", () => {
    const archivedGoal: StrategicGoalReadModel = {
      ...goal,
      priority_slug: "justice-education",
      priority_name: "Support Learning through Justice Education",
      members: [],
      archived_members: [{
        kpi_id: 11,
        kpi_slug: "justice-ed-online-digital-attendance",
        kpi_name: "Online digital attendance",
      }, {
        kpi_id: 12,
        kpi_slug: "unapproved-archived-measure",
        kpi_name: "Unapproved archived measure",
      }],
    };
    listStrategicGoalsForReportingDisclosureMock.mockReturnValue([archivedGoal]);
    listKPIsMock.mockReturnValue([]);
    listCalculatedStrategyActualsMock.mockReturnValue([]);

    const report = loadBoardReportPageData({
      year: 2026,
      audience: "board",
    }).report;

    expect(report.priorities).toHaveLength(1);
    expect(report.priorities[0]?.goals).toHaveLength(1);
    expect(report.priorities[0]?.goals[0]?.excludedKpisCount).toBe(1);
    expect(report.priorities[0]?.goals[0]?.excludedReasons).toContain(
      "One or more measures are archived",
    );
  });

  it("keeps archived-Priority exclusions in staff Overview reporting", () => {
    const archivedGoal: StrategicGoalReadModel = {
      ...goal,
      members: [],
      archived_members: [{
        kpi_id: metric.id,
        kpi_slug: metric.slug,
        kpi_name: metric.name,
      }],
    };
    listStrategicGoalsMock.mockReturnValue([]);
    listStrategicGoalsForReportingDisclosureMock.mockReturnValue([archivedGoal]);
    listKPIsMock.mockReturnValue([]);
    listCalculatedStrategyActualsMock.mockReturnValue([]);

    const data = loadExecutiveOverviewPageData({
      year: 2026,
      audience: "staff",
    });

    expect(data.summary.goals).toHaveLength(1);
    expect(data.summary.goals[0]?.result.excludedKpisCount).toBe(1);
    expect(data.summary.goals[0]?.result.exclusionReasons).toContain("archived");
    expect(data.needsAttention).toContainEqual({
      goalId: String(archivedGoal.id),
      goalName: archivedGoal.name,
      priorityName: archivedGoal.priority_name,
      reason: "One or more measures are archived",
    });
  });

  it("omits informational memberships from actionable Overview reasons", () => {
    listStrategicGoalsForReportingDisclosureMock.mockReturnValue([
      {
        ...goal,
        members: goal.members.map((member) => ({
          ...member,
          role: "informational" as const,
        })),
      },
    ]);
    listKPIsMock.mockReturnValue([metric]);
    listCalculatedStrategyActualsMock.mockReturnValue([]);

    const data = loadExecutiveOverviewPageData({
      year: 2026,
      audience: "staff",
    });

    expect(data.summary.goals[0]?.result.excludedKpis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "informational" }),
      ]),
    );
    expect(data.summary.goals[0]?.result.exclusionReasons).not.toContain(
      "informational",
    );
    expect(data.needsAttention.map((item) => item.reason)).not.toContain(
      "This measure provides context and does not count toward completion",
    );
  });

  it("keeps scoped archived exclusions in staff and Board Trends (NOV-C5)", () => {
    const archivedGoal: StrategicGoalReadModel = {
      ...goal,
      priority_slug: "justice-education",
      priority_name: "Support Learning through Justice Education",
      members: [],
      archived_members: [{
        kpi_id: 11,
        kpi_slug: "justice-ed-online-digital-attendance",
        kpi_name: "Online digital attendance",
      }, {
        kpi_id: 12,
        kpi_slug: "unapproved-archived-measure",
        kpi_name: "Unapproved archived measure",
      }],
    };
    listStrategicGoalsForReportingDisclosureMock.mockReturnValue([archivedGoal]);
    listCalculatedStrategyActualsMock.mockReturnValue([]);

    const staff = loadStrategicTrendReportData({
      year: 2026,
      audience: "staff",
    });
    expect(staff.excludedMeasures).toEqual([
      {
        kpiId: 11,
        kpiName: "Online digital attendance",
        priorityName: "Support Learning through Justice Education",
        reason: "archived",
      },
      {
        kpiId: 12,
        kpiName: "Unapproved archived measure",
        priorityName: "Support Learning through Justice Education",
        reason: "archived",
      },
    ]);

    const board = loadStrategicTrendReportData({
      year: 2026,
      audience: "board",
    });
    expect(board.excludedMeasures).toEqual([
      expect.objectContaining({
        kpiId: 11,
        kpiName: "Online digital attendance",
      }),
    ]);
  });

  it("does not describe an active trend series as an archived exclusion", () => {
    listStrategicGoalsForReportingDisclosureMock.mockReturnValue([
      {
        ...goal,
        archived_members: [{
          kpi_id: metric.id,
          kpi_slug: metric.slug,
          kpi_name: metric.name,
        }],
      },
    ]);

    const data = loadStrategicTrendReportData({
      year: 2026,
      audience: "staff",
    });

    expect(data.series).toEqual([
      expect.objectContaining({ kpiId: metric.id }),
    ]);
    expect(data.excludedMeasures).toEqual([]);
  });

  it("marks restored hidden-data series in Trends (NOV-C5)", () => {
    listKpiIdsWithArchivedIntervalValuesMock.mockReturnValue(
      new Set([metric.id]),
    );

    const data = loadStrategicTrendReportData({
      year: 2026,
      audience: "staff",
    });

    expect(data.series[0]).toMatchObject({
      kpiId: metric.id,
      restoredWithHiddenData: true,
    });
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
