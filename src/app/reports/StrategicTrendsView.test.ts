import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  buildStrategicTrendCsvRows,
  hasPeriodTrend,
  periodGranularityNoun,
  resolveStrategicTrendSelection,
  StrategicTrendsView,
} from "./StrategicTrendsView";
import type { PeriodTrendSeries } from "@/features/reporting/period-trend";
import type { StrategicTrendReportData } from "@/features/reporting/types";

const quarterlyTrend: PeriodTrendSeries = {
  granularity: "quarterly",
  years: [2025, 2026],
  points: [
    { label: "Q1", "2025": 4, "2026": 5 },
    { label: "Q2", "2025": 6, "2026": null },
    { label: "Q3", "2025": null, "2026": null },
    { label: "Q4", "2025": null, "2026": null },
  ],
};

const disclosureFixture: StrategicTrendReportData = {
  organizationSlug: "museum",
  years: [2025, 2026],
  excludedMeasures: [{
    kpiId: 22,
    kpiName: "Archived attendance",
    priorityName: "Visitor experience",
    reason: "archived",
  }],
  series: [{
    kpiId: 21,
    kpiName: "Current attendance",
    priorityName: "Visitor experience",
    unit: "visitors",
    restoredWithHiddenData: true,
    points: [
      { year: 2025, value: 10 },
      { year: 2026, value: 12 },
    ],
    periodTrend: quarterlyTrend,
  }],
};

describe("Strategic Trends selection", () => {
  it("keeps a valid choice and replaces a stale choice with a series that has data", () => {
    const series = [
      { kpiId: 20, points: [{ value: null }] },
      { kpiId: 21, points: [{ value: 8 }] },
    ];

    expect(resolveStrategicTrendSelection(series, 20)).toBe(20);
    expect(resolveStrategicTrendSelection(series, 99)).toBe(21);
    expect(resolveStrategicTrendSelection([], 99)).toBe(0);
  });

  it("renders archived exclusions and restored-data warnings visibly", () => {
    const html = renderToStaticMarkup(
      createElement(StrategicTrendsView, {
        data: disclosureFixture,
        reportingPeriod: "Full year",
      }),
    );

    expect(html).toContain("Archived measures excluded from Trends");
    expect(html).toContain("Visitor experience: Archived attendance");
    expect(html).toContain("Review restored measure data");
    expect(html).toContain(
      "Data changed while this measure was archived; review the restored values.",
    );
  });

  it("carries both lifecycle disclosures into the trend CSV", () => {
    const rows = buildStrategicTrendCsvRows(
      disclosureFixture,
      disclosureFixture.series[0]!,
      "Full year",
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      "Lifecycle warning":
        "Data changed while this measure was archived; review the restored values.",
      "Archived measures excluded":
        "Visitor experience: Archived attendance",
    });
  });

  it("exports archived exclusions even when no active series remains", () => {
    const rows = buildStrategicTrendCsvRows(
      { ...disclosureFixture, series: [] },
      null,
      "Full year",
    );

    expect(rows).toEqual([
      expect.objectContaining({
        Measure: null,
        "Archived measures excluded":
          "Visitor experience: Archived attendance",
      }),
    ]);
  });
});

describe("Strategic Trends granularity", () => {
  it("offers the period view only when within-year values exist", () => {
    expect(hasPeriodTrend(quarterlyTrend)).toBe(true);
    expect(periodGranularityNoun(quarterlyTrend)).toBe("quarter");
    expect(hasPeriodTrend(null)).toBe(false);
    expect(hasPeriodTrend(undefined)).toBe(false);
  });

  it("withholds the period view when every within-year value is missing", () => {
    const emptyTrend: PeriodTrendSeries = {
      granularity: "monthly",
      years: [2026],
      points: [{ label: "January", "2026": null }],
    };

    expect(hasPeriodTrend(emptyTrend)).toBe(false);
    expect(periodGranularityNoun(emptyTrend)).toBe("month");
  });

  it("exports one row per reporting period when the period view is selected", () => {
    const rows = buildStrategicTrendCsvRows(
      disclosureFixture,
      disclosureFixture.series[0]!,
      "Full year",
      "period",
    );

    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({
      Measure: "Current attendance",
      "Reporting Year": 2025,
      "Reporting Period": "Q1",
      Value: 4,
      Unit: "visitors",
    });
    expect(rows[1]).toMatchObject({
      "Reporting Year": 2025,
      "Reporting Period": "Q2",
      Value: 6,
    });
    // An unreported quarter stays null rather than inheriting the prior one.
    expect(rows[5]).toMatchObject({
      "Reporting Year": 2026,
      "Reporting Period": "Q2",
      Value: null,
    });
    expect(rows[0]).toMatchObject({
      "Archived measures excluded": "Visitor experience: Archived attendance",
    });
  });

  it("falls back to yearly rows when the measure has no period detail", () => {
    const rows = buildStrategicTrendCsvRows(
      disclosureFixture,
      { ...disclosureFixture.series[0]!, periodTrend: null },
      "Full year",
      "period",
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ "Reporting Year": 2025, Value: 10 });
  });

  it("renders the granularity toggle and the period table", () => {
    const html = renderToStaticMarkup(
      createElement(StrategicTrendsView, {
        data: disclosureFixture,
        reportingPeriod: "Full year",
      }),
    );

    expect(html).toContain("By year");
    expect(html).toContain("By quarter");
  });

  it("hides the granularity toggle for a measure reported once a year", () => {
    const html = renderToStaticMarkup(
      createElement(StrategicTrendsView, {
        data: {
          ...disclosureFixture,
          series: [{ ...disclosureFixture.series[0]!, periodTrend: null }],
        },
        reportingPeriod: "Full year",
      }),
    );

    expect(html).not.toContain("By year");
  });
});
