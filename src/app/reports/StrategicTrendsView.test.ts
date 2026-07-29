import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  buildStrategicTrendCsvRows,
  resolveStrategicTrendSelection,
  StrategicTrendsView,
} from "./StrategicTrendsView";
import type { StrategicTrendReportData } from "@/features/reporting/types";

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
