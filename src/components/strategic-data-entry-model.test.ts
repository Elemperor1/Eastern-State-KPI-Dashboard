import { describe, expect, it } from "vitest";
import type {
  MeasurementType,
  StrategyReportingFrequency,
} from "@/features/strategy";
import {
  activeBandsForDraft,
  buildStrategicDataEntryRequests,
  buildStrategicDataEntryMutation,
  deleteEndpointForRecord,
  draftFromStrategicDataEntryRecord,
  emptyStrategicDataEntryDraft,
  initialStrategicDataEntryDrafts,
  entryPeriodOptions,
  strategicDataEntryPeriodLabel,
  strategicDataEntryRawValueLabel,
  type StrategicDataEntryDraft,
  type StrategicDataEntryRecord,
  type StrategicDataEntrySelectedKpi,
} from "./strategic-data-entry-model";

function selected(
  measurementType: MeasurementType,
  overrides: Partial<StrategicDataEntrySelectedKpi> = {},
): StrategicDataEntrySelectedKpi {
  const result = {
    id: 12,
    slug: "visitor-participation",
    name: "Visitor participation",
    priorityName: "Reimagine Visitor Experience",
    goalName: "Build a primary interpretive plan",
    unit: "people",
    numeratorLabel: null,
    denominatorLabel: null,
    measurementType,
    reportingFrequency: "annual" as const,
    configurationStatus: "active" as const,
    calculationPrecision: 1,
    fixedDenominator: null,
    components: [],
    bands: [],
    ...overrides,
  };
  return {
    ...result,
    numeratorLabel: result.numeratorLabel ?? null,
    denominatorLabel: result.denominatorLabel ?? null,
  };
}

function draftFor(
  kpi: StrategicDataEntrySelectedKpi,
  overrides: Partial<StrategicDataEntryDraft> = {},
): StrategicDataEntryDraft {
  return {
    ...emptyStrategicDataEntryDraft(
      kpi,
      2026,
      new Date("2026-07-09T12:00:00Z"),
    ),
    ...overrides,
  };
}

function record(
  overrides: Partial<StrategicDataEntryRecord> = {},
): StrategicDataEntryRecord {
  return {
    id: 1,
    kind: "observation",
    kpiId: 12,
    componentId: null,
    componentLabel: null,
    measurementType: "count",
    reportingFrequency: "annual",
    year: 2026,
    periodType: "annual",
    periodIndex: 0,
    scalarValue: 14,
    numerator: null,
    denominator: null,
    respondentCount: null,
    averageMethod: null,
    totalScore: null,
    averageScore: null,
    maxScorePerRespondent: null,
    totalPossibleScore: null,
    positiveResponseCount: null,
    totalResponseCount: null,
    booleanValue: null,
    milestoneValue: null,
    mutuallyExclusive: null,
    notes: null,
    sourceReference: null,
    bands: [],
    ...overrides,
  };
}

describe("strategic data-entry model", () => {
  it("creates one period-scoped draft for every component in a focused form", () => {
    const kpi = selected("multi_component", {
      reportingFrequency: "annual",
      components: [
        {
          id: 11,
          label: "Admissions",
          measurementType: "count",
          unit: "visits",
          numeratorLabel: null,
          denominatorLabel: null,
          fixedDenominator: null,
        },
        {
          id: 12,
          label: "Members",
          measurementType: "count",
          unit: "visits",
          numeratorLabel: null,
          denominatorLabel: null,
          fixedDenominator: null,
        },
      ],
    });
    const drafts = initialStrategicDataEntryDrafts(
      kpi,
      2027,
      {
        value: "annual:0",
        label: "Full year",
        periodType: "annual",
        periodIndex: 0,
      },
      [record({ componentId: 11, scalarValue: 42 })],
    );

    expect(Object.keys(drafts)).toEqual(["11", "12"]);
    expect(drafts["11"]).toMatchObject({
      componentId: "11",
      periodIndex: "0",
      value: "42",
    });
    expect(drafts["12"]).toMatchObject({
      componentId: "12",
      periodIndex: "0",
      value: "",
    });
  });

  it("batches every component mutation into one atomic request", () => {
    const requests = buildStrategicDataEntryRequests([
      {
        endpoint: "/api/strategy/component-entries",
        body: { component_id: 11, reporting_year: 2027, value: 42 },
      },
      {
        endpoint: "/api/strategy/component-entries",
        body: { component_id: 12, reporting_year: 2027, value: 18 },
      },
    ]);

    expect(requests).toEqual([
      {
        endpoint: "/api/strategy/observations",
        body: {
          submission_type: "multi_input",
          writes: [
            {
              kind: "component_entry",
              input: { component_id: 11, reporting_year: 2027, value: 42 },
            },
            {
              kind: "component_entry",
              input: { component_id: 12, reporting_year: 2027, value: 18 },
            },
          ],
        },
      },
    ]);
  });

  it("includes distribution components in the same atomic request", () => {
    const requests = buildStrategicDataEntryRequests([
      {
        endpoint: "/api/strategy/component-entries",
        body: { component_id: 11, reporting_year: 2027, value: 42 },
      },
      {
        endpoint: "/api/strategy/distributions",
        body: {
          kpi_id: 12,
          component_id: 13,
          reporting_year: 2027,
          respondent_count: 42,
          bands: [],
        },
      },
    ]);

    expect(requests).toEqual([
      {
        endpoint: "/api/strategy/observations",
        body: {
          submission_type: "multi_input",
          writes: [
            {
              kind: "component_entry",
              input: { component_id: 11, reporting_year: 2027, value: 42 },
            },
            {
              kind: "distribution",
              input: {
                kpi_id: 12,
                component_id: 13,
                reporting_year: 2027,
                respondent_count: 42,
                bands: [],
              },
            },
          ],
        },
      },
    ]);
  });

  it("uses real calendar months and never presents storage month zero", () => {
    const kpi = selected("count", { reportingFrequency: "monthly" });
    const draft = draftFor(kpi);
    const options = entryPeriodOptions(kpi, draft, 2026);

    expect(options).toHaveLength(12);
    expect(options[0]).toMatchObject({ value: 1, label: "January" });
    expect(options.at(-1)).toMatchObject({ value: 12, label: "December" });
    expect(options.some((option) => option.value === 0)).toBe(false);
  });

  it("derives annual storage semantics without sending a month", () => {
    const kpi = selected("count");
    const result = buildStrategicDataEntryMutation(
      kpi,
      2026,
      draftFor(kpi, { value: "14" }),
    );

    expect(result).toEqual({
      ok: true,
      errors: {},
      mutation: {
        endpoint: "/api/strategy/observations",
        body: {
          kpi_id: 12,
          reporting_year: 2026,
          value: 14,
          notes: null,
          source_reference: null,
        },
      },
    });
  });

  it.each([
    ["annual", "Full year"],
    ["cumulative", "Cumulative through 2026"],
    ["one_time", "One-time result (2026)"],
  ] as const)(
    "renders %s as one semantic period and keeps its storage index out of the payload",
    (reportingFrequency, label) => {
      const kpi = selected("count", { reportingFrequency });
      const draft = draftFor(kpi, { value: "14" });
      expect(entryPeriodOptions(kpi, draft, 2026)).toEqual([
        { value: 0, storageIndex: 0, label },
      ]);
      const result = buildStrategicDataEntryMutation(kpi, 2026, draft);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.mutation.body).not.toHaveProperty("reporting_month");
        expect(result.mutation.body).not.toHaveProperty("reporting_quarter");
      }
    },
  );

  it("maps quarterly and both flexible modes to their explicit domain periods", () => {
    const quarterly = selected("count", { reportingFrequency: "quarterly" });
    const quarterlyDraft = draftFor(quarterly, {
      periodIndex: "3",
      value: "14",
    });
    expect(entryPeriodOptions(quarterly, quarterlyDraft, 2026).map(({ label }) => label)).toEqual([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
    ]);
    const quarterlyResult = buildStrategicDataEntryMutation(
      quarterly,
      2026,
      quarterlyDraft,
    );
    expect(
      quarterlyResult.ok && quarterlyResult.mutation.body.reporting_quarter,
    ).toBe(3);

    const flexible = selected("count", {
      reportingFrequency: "flexible" as StrategyReportingFrequency,
    });
    const flexibleMonthly = draftFor(flexible, {
      flexibleMode: "monthly",
      periodIndex: "7",
      value: "14",
    });
    const flexibleAnnual = draftFor(flexible, {
      flexibleMode: "annual",
      periodIndex: "0",
      value: "14",
    });
    expect(entryPeriodOptions(flexible, flexibleMonthly, 2026)).toHaveLength(12);
    expect(entryPeriodOptions(flexible, flexibleAnnual, 2026)).toEqual([
      { value: 0, storageIndex: 0, label: "Full year" },
    ]);
    const monthlyResult = buildStrategicDataEntryMutation(
      flexible,
      2026,
      flexibleMonthly,
    );
    const annualResult = buildStrategicDataEntryMutation(
      flexible,
      2026,
      flexibleAnnual,
    );
    expect(monthlyResult.ok && monthlyResult.mutation.body).toMatchObject({
      flexible_mode: "monthly",
      reporting_month: 7,
    });
    expect(annualResult.ok && annualResult.mutation.body).toMatchObject({
      flexible_mode: "annual",
    });
    if (annualResult.ok) {
      expect(annualResult.mutation.body).not.toHaveProperty("reporting_month");
    }
  });

  it("preserves binary zero as an explicit not-complete value", () => {
    const kpi = selected("binary", { reportingFrequency: "one_time" });
    const result = buildStrategicDataEntryMutation(
      kpi,
      2026,
      draftFor(kpi, { binaryValue: "0" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mutation.body.value).toBe(0);
  });

  it("sends percentage and ratio raw inputs without a calculated value", () => {
    const kpi = selected("percentage", { reportingFrequency: "monthly" });
    const result = buildStrategicDataEntryMutation(
      kpi,
      2026,
      draftFor(kpi, {
        periodIndex: "7",
        numerator: "25",
        denominator: "40",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mutation.body).toMatchObject({
        reporting_month: 7,
        numerator: 25,
        denominator: 40,
      });
      expect(result.mutation.body).not.toHaveProperty("value");
    }
  });

  it("builds each raw average method without mixing formulas", () => {
    const kpi = selected("average");
    const totalScore = buildStrategicDataEntryMutation(
      kpi,
      2026,
      draftFor(kpi, {
        averageMethod: "total_score",
        respondentCount: "10",
        totalScore: "40",
        totalPossibleScore: "50",
      }),
    );
    const averageScore = buildStrategicDataEntryMutation(
      kpi,
      2026,
      draftFor(kpi, {
        averageMethod: "average_score",
        respondentCount: "10",
        averageScore: "4",
        maxScorePerRespondent: "5",
      }),
    );
    const percentPositive = buildStrategicDataEntryMutation(
      kpi,
      2026,
      draftFor(kpi, {
        averageMethod: "percent_positive",
        positiveResponseCount: "8",
        totalResponseCount: "10",
      }),
    );

    expect(totalScore.ok && totalScore.mutation.body.average_inputs).toEqual({
      method: "total_score",
      respondent_count: 10,
      total_score: 40,
      total_possible_score: 50,
      max_score_per_respondent: null,
    });
    expect(averageScore.ok && averageScore.mutation.body.average_inputs).toEqual({
      method: "average_score",
      respondent_count: 10,
      average_score: 4,
      max_score_per_respondent: 5,
    });
    expect(percentPositive.ok && percentPositive.mutation.body.average_inputs).toEqual({
      method: "percent_positive",
      positive_response_count: 8,
      total_response_count: 10,
    });
  });

  it("routes multi-component values through the selected component endpoint", () => {
    const kpi = selected("multi_component", {
      components: [
        {
          id: 31,
          label: "Participants enrolled",
          measurementType: "count",
          unit: "people",
          numeratorLabel: null,
          denominatorLabel: null,
          fixedDenominator: null,
        },
      ],
    });
    const result = buildStrategicDataEntryMutation(
      kpi,
      2026,
      draftFor(kpi, { componentId: "31", value: "35" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mutation).toMatchObject({
        endpoint: "/api/strategy/component-entries",
        body: { component_id: 31, value: 35 },
      });
    }
  });

  it("validates and serializes configured distribution bands", () => {
    const kpi = selected("distribution", {
      unit: "respondents",
      bands: [
        {
          id: 101,
          componentId: null,
          slug: "white",
          label: "White",
          displayOrder: 0,
          isUnknown: false,
          isDeclined: false,
          derivedGroup: "white",
        },
        {
          id: 102,
          componentId: null,
          slug: "non-white",
          label: "Non-white",
          displayOrder: 1,
          isUnknown: false,
          isDeclined: false,
          derivedGroup: "non_white",
        },
      ],
    });
    const draft = draftFor(kpi, {
      respondentCount: "10",
      bandCounts: { "101": "6", "102": "4" },
    });
    expect(activeBandsForDraft(kpi, draft)).toHaveLength(2);
    const result = buildStrategicDataEntryMutation(kpi, 2026, draft);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mutation.endpoint).toBe("/api/strategy/distributions");
      expect(result.mutation.body).toMatchObject({
        respondent_count: 10,
        mutually_exclusive: true,
        bands: [
          { band_id: 101, count: 6, derived_group: "white" },
          { band_id: 102, count: 4, derived_group: "non_white" },
        ],
      });
    }
  });

  it("includes the parent KPI and component owner for component distributions", () => {
    const kpi = selected("multi_component", {
      components: [
        {
          id: 31,
          label: "Audience mix",
          measurementType: "distribution",
          unit: "respondents",
          numeratorLabel: null,
          denominatorLabel: null,
          fixedDenominator: null,
        },
      ],
      bands: [
        {
          id: 101,
          componentId: 31,
          slug: "known",
          label: "Known",
          displayOrder: 0,
          isUnknown: false,
          isDeclined: false,
          derivedGroup: null,
        },
      ],
    });

    const result = buildStrategicDataEntryMutation(
      kpi,
      2026,
      draftFor(kpi, {
        componentId: "31",
        respondentCount: "10",
        bandCounts: { "101": "10" },
      }),
    );

    expect(result).toEqual({
      ok: true,
      errors: {},
      mutation: {
        endpoint: "/api/strategy/distributions",
        body: {
          kpi_id: 12,
          component_id: 31,
          reporting_year: 2026,
          notes: null,
          source_reference: null,
          respondent_count: 10,
          mutually_exclusive: true,
          bands: [
            {
              band_id: 101,
              slug: "known",
              label: "Known",
              count: 10,
              display_order: 0,
              is_unknown: false,
              is_declined: false,
              derived_group: null,
            },
          ],
        },
      },
    });
  });

  it("rejects distribution totals that do not match exclusive bands", () => {
    const kpi = selected("distribution", {
      bands: [
        {
          id: 101,
          componentId: null,
          slug: "known",
          label: "Known",
          displayOrder: 0,
          isUnknown: false,
          isDeclined: false,
          derivedGroup: null,
        },
      ],
    });
    const result = buildStrategicDataEntryMutation(
      kpi,
      2026,
      draftFor(kpi, {
        respondentCount: "10",
        bandCounts: { "101": "9" },
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      errors: { bands: expect.stringContaining("must equal") },
    });
  });

  it("hydrates saved raw values for idempotent period updates", () => {
    const kpi = selected("percentage", { reportingFrequency: "monthly" });
    const saved = record({
      measurementType: "percentage",
      reportingFrequency: "monthly",
      periodType: "monthly",
      periodIndex: 7,
      numerator: 25,
      denominator: 40,
      notes: "July sample",
      sourceReference: "Survey export",
    });
    const draft = draftFromStrategicDataEntryRecord(kpi, saved);
    expect(draft).toMatchObject({
      periodIndex: "7",
      numerator: "25",
      denominator: "40",
      notes: "July sample",
      sourceReference: "Survey export",
    });
    expect(strategicDataEntryPeriodLabel(saved)).toBe("July 2026");
    expect(strategicDataEntryRawValueLabel(saved, "%")).toBe("25 / 40");
  });

  it("maps deletes to the owning normalized value route", () => {
    expect(deleteEndpointForRecord(record({ kind: "observation" }))).toBe(
      "/api/strategy/observations",
    );
    expect(deleteEndpointForRecord(record({ kind: "component_entry" }))).toBe(
      "/api/strategy/component-entries",
    );
    expect(deleteEndpointForRecord(record({ kind: "distribution" }))).toBe(
      "/api/strategy/distributions",
    );
  });
});
