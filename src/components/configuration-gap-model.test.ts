import { describe, expect, it } from "vitest";
import {
  EMPTY_CONFIGURATION_GAP_FILTERS,
  UNASSIGNED_CONFIGURATION_GAP_OWNER,
  buildConfigurationGapFilterOptions,
  filterConfigurationGaps,
  formatConfigurationGapDate,
  getConfigurationGapKinds,
  getConfigurationGapStatusLabel,
  hasConfigurationGapFilters,
  parseOptionalInteger,
  type ConfigurationGapFilters,
  type ConfigurationGapRowViewModel,
} from "./configuration-gap-model";

function gapRow(
  overrides: Partial<ConfigurationGapRowViewModel> = {},
): ConfigurationGapRowViewModel {
  return {
    id: "goal-10:kpi-100",
    kpiId: 100,
    kpiName: "Increase member renewals",
    kpiSlug: "increase-member-renewals",
    priorityId: 1,
    priorityName: "Financial Sustainability",
    goalId: 10,
    goalName: "Grow recurring support",
    configurationStatus: "needs_target",
    reportingFrequency: "annual",
    targetYears: [2027, 2029],
    unresolvedQuestion: "Which membership tiers count?",
    owner: "Development",
    dueDate: "2026-09-30",
    lastReviewedDate: "2026-06-15",
    missingMeasurementType: false,
    missingFormula: false,
    missingComponents: false,
    missingTarget: true,
    missingDenominator: false,
    missingTargetYear: false,
    editorHref: "/admin/kpis/100",
    ...overrides,
  };
}

function filters(
  overrides: Partial<ConfigurationGapFilters> = {},
): ConfigurationGapFilters {
  return { ...EMPTY_CONFIGURATION_GAP_FILTERS, ...overrides };
}

describe("configuration gap presentation model", () => {
  it("reports every explicit gap without inferring missing targets as zero", () => {
    const row = gapRow({
      missingMeasurementType: true,
      missingFormula: true,
      missingComponents: true,
      missingTarget: true,
      missingDenominator: true,
      missingTargetYear: true,
    });

    expect(getConfigurationGapKinds(row)).toEqual([
      "measurement_type",
      "formula",
      "components",
      "target",
      "denominator",
      "target_year",
      "unresolved_question",
    ]);
  });

  it("does not create an unresolved-question gap for whitespace", () => {
    expect(
      getConfigurationGapKinds(
        gapRow({ unresolvedQuestion: "   ", missingTarget: false }),
      ),
    ).toEqual([]);
  });

  it("builds stable, deduplicated filter options", () => {
    const options = buildConfigurationGapFilterOptions([
      gapRow(),
      gapRow({
        id: "goal-20:kpi-200",
        kpiId: 200,
        kpiName: "Document preservation work",
        priorityId: 2,
        priorityName: "Preservation",
        goalId: 20,
        goalName: "Care for the site",
        configurationStatus: "needs_definition",
        reportingFrequency: "Quarterly",
        targetYears: [2026, 2027],
        owner: "preservation",
      }),
      gapRow({
        id: "goal-30:kpi-300",
        kpiId: 300,
        goalId: 30,
        goalName: "Diversify revenue",
        reportingFrequency: "quarterly",
        targetYears: [],
        owner: null,
        missingTargetYear: true,
      }),
    ]);

    expect(options.priorities.map((option) => option.name)).toEqual([
      "Financial Sustainability",
      "Preservation",
    ]);
    expect(options.goals.map((option) => option.id)).toEqual([20, 30, 10]);
    expect(options.statuses).toEqual(["needs_definition", "needs_target"]);
    expect(options.owners).toEqual(["Development", "preservation"]);
    expect(options.hasUnassignedOwner).toBe(true);
    expect(options.targetYears).toEqual([2026, 2027, 2029]);
    expect(options.hasMissingTargetYear).toBe(true);
    expect(options.reportingFrequencies).toEqual(["annual", "Quarterly"]);
  });

  it("applies every structured filter", () => {
    const matching = gapRow();
    const other = gapRow({
      id: "goal-20:kpi-200",
      kpiId: 200,
      priorityId: 2,
      goalId: 20,
      configurationStatus: "needs_definition",
      owner: "Preservation",
      reportingFrequency: "quarterly",
      targetYears: [2026],
    });

    expect(
      filterConfigurationGaps(
        [other, matching],
        filters({
          priorityId: 1,
          goalId: 10,
          status: "needs_target",
          owner: "development",
          targetYear: 2029,
          reportingFrequency: "Annual",
        }),
      ),
    ).toEqual([matching]);
  });

  it("can isolate unassigned owners and missing target years", () => {
    const unassigned = gapRow({
      id: "unassigned",
      owner: null,
      targetYears: [],
      missingTargetYear: true,
    });
    const assigned = gapRow({ id: "assigned" });

    expect(
      filterConfigurationGaps(
        [assigned, unassigned],
        filters({
          owner: UNASSIGNED_CONFIGURATION_GAP_OWNER,
          targetYear: "missing",
        }),
      ),
    ).toEqual([unassigned]);
  });

  it("searches KPI, hierarchy, owner, question, status, and gap labels", () => {
    const row = gapRow({ missingFormula: true });
    for (const query of [
      "renewals",
      "financial sustainability",
      "recurring support",
      "development",
      "membership tiers",
      "needs target",
      "formula",
    ]) {
      expect(filterConfigurationGaps([row], filters({ query }))).toEqual([
        row,
      ]);
    }
    expect(
      filterConfigurationGaps([row], filters({ query: "not present" })),
    ).toEqual([]);
  });

  it("sorts filtered rows by priority, goal, then KPI", () => {
    const rows = [
      gapRow({ id: "3", kpiName: "Zulu" }),
      gapRow({ id: "1", priorityId: 2, priorityName: "Accessibility" }),
      gapRow({ id: "2", kpiName: "Alpha" }),
    ];

    expect(filterConfigurationGaps(rows, filters()).map((row) => row.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("detects active filters and parses optional integer values", () => {
    expect(hasConfigurationGapFilters(filters())).toBe(false);
    expect(hasConfigurationGapFilters(filters({ query: " target " }))).toBe(
      true,
    );
    expect(parseOptionalInteger(" 2029 ")).toBe(2029);
    expect(parseOptionalInteger("")).toBeNull();
    expect(parseOptionalInteger("2029.5")).toBeNull();
  });

  it("formats known status and date values for display", () => {
    expect(getConfigurationGapStatusLabel("needs_definition")).toBe(
      "Needs definition",
    );
    expect(formatConfigurationGapDate("2026-07-09")).toBe("Jul 9, 2026");
    expect(formatConfigurationGapDate("not-a-date")).toBe("Not recorded");
    expect(formatConfigurationGapDate(null)).toBe("Not recorded");
  });
});
