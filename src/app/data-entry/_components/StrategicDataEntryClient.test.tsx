import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { StrategicDataEntryPageData } from "@/features/strategy";
import { StrategicDataEntryClient } from "./StrategicDataEntryClient";

vi.mock("next/navigation", () => ({
  /** Supports the use router test scenario. */
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

/** Supports the page data test scenario. */
function pageData(): StrategicDataEntryPageData {
  return {
    reportingYear: 2027,
    years: [2026, 2027],
    reportingPeriod: {
      value: "annual:0",
      label: "Full year",
      periodType: "annual",
      periodIndex: 0,
    },
    reportingPeriods: [{
      value: "annual:0",
      label: "Full year",
      periodType: "annual",
      periodIndex: 0,
    }],
    showSelectedKpi: true,
    kpis: [{
      id: 7,
      name: "Visitor reach",
      priorityName: "Reimagine Visitor Experience",
      goalName: "Broaden programming",
      measurementType: "multi_component",
      reportingFrequency: "annual",
      configurationStatus: "active",
      checklistStatus: "not_started",
    }],
    selectedKpiId: 7,
    selectedKpi: {
      id: 7,
      slug: "visitor-reach",
      name: "Visitor reach",
      priorityName: "Reimagine Visitor Experience",
      goalName: "Broaden programming",
      unit: "visits",
      numeratorLabel: null,
      denominatorLabel: null,
      measurementType: "multi_component",
      reportingFrequency: "annual",
      configurationStatus: "active",
      calculationPrecision: 1,
      fixedDenominator: null,
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
          label: "Member visits",
          measurementType: "count",
          unit: "visits",
          numeratorLabel: null,
          denominatorLabel: null,
          fixedDenominator: null,
        },
      ],
      bands: [],
    },
    records: [],
    loadError: null,
  };
}

/** Supports the saved component entry test scenario. */
function savedComponentEntry(componentId: number) {
  return {
    id: 400 + componentId,
    kind: "component_entry" as const,
    kpiId: 7,
    componentId,
    componentLabel: "Admissions",
    measurementType: "count" as const,
    reportingFrequency: "annual" as const,
    year: 2027,
    periodType: "annual" as const,
    periodIndex: 0,
    scalarValue: 120,
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
  };
}

describe("Data Entry", () => {
  it("offers no way to remove a result before one is recorded", () => {
    const html = renderToStaticMarkup(
      <StrategicDataEntryClient data={pageData()} />,
    );

    expect(html).not.toContain("Remove saved result");
  });

  it("offers to remove a recorded result only for the input that has one", () => {
    const data = pageData();
    data.records = [savedComponentEntry(11)];

    const html = renderToStaticMarkup(
      <StrategicDataEntryClient data={data} />,
    );

    expect(html.match(/Remove saved result/g)).toHaveLength(1);
    // The action sits inside the section for the component that owns the
    // record, so clearing one component cannot remove another's value.
    const admissions = html.indexOf('data-entry-section="11"');
    const memberVisits = html.indexOf('data-entry-section="12"');
    const action = html.indexOf("Remove saved result");
    expect(admissions).toBeGreaterThanOrEqual(0);
    expect(action).toBeGreaterThan(admissions);
    expect(action).toBeLessThan(memberVisits);
  });

  it("names the reporting period the removal applies to", () => {
    const data = pageData();
    data.records = [savedComponentEntry(11)];

    const html = renderToStaticMarkup(
      <StrategicDataEntryClient data={data} />,
    );

    expect(html).toContain("A result is recorded for Full year 2027");
    expect(html).toContain("recorded in Activity");
  });

  it("removes a saved result only through the delete route, never as an empty save", () => {
    const source = readFileSync(
      new URL("./StrategicDataEntryClient.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("deleteEndpointForRecord(pending.record)");
    // The destructive path is gated behind an explicit confirmation.
    expect(source).toContain("Remove this saved result?");
  });

  it("shows every component together in one period-scoped form", () => {
    const html = renderToStaticMarkup(
      <StrategicDataEntryClient data={pageData()} />,
    );

    expect(html).toContain("Reporting period");
    expect(html).toContain("Full year");
    expect(html).toContain("Admissions");
    expect(html).toContain("Member visits");
    expect(html).toContain('id="strategy-entry-11-value"');
    expect(html).toContain('id="strategy-entry-12-value"');
    expect(html).not.toContain("Choose a component");
    expect(html).toContain("Save and continue");
    expect(html).toContain("Back to list");
  });

  it("does not present a hidden default measure's status as the cycle status", () => {
    const data = pageData();
    data.showSelectedKpi = false;

    const html = renderToStaticMarkup(
      <StrategicDataEntryClient data={data} />,
    );

    expect(html).not.toContain(">Ready<");
  });

  it("keeps long checklist names readable and marks the selected measure", () => {
    const data = pageData();
    data.kpis[0].name =
      "Amenities & Accessibility — Positive ratings on amenities & navigation";

    const html = renderToStaticMarkup(
      <StrategicDataEntryClient data={data} />,
    );

    expect(html).toContain("whitespace-normal");
    expect(html).toContain("wrap-break-word");
    expect(html).not.toContain("truncate");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("ring-brand-200");
    expect(html).not.toContain("border-l-" + "4");
    expect(html).not.toContain("Measure status:");
  });

  it("does not claim an optimistic-concurrency contract the API does not provide", () => {
    const source = readFileSync(
      new URL("./StrategicDataEntryClient.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("response.status === 409");
    expect(source).not.toContain("conflicts with the current setup");
  });

  it("shows save success only after a confirmed mutation, never from the URL", () => {
    const clientSource = readFileSync(
      new URL("./StrategicDataEntryClient.tsx", import.meta.url),
      "utf8",
    );
    const pageSource = readFileSync(
      new URL("../page.tsx", import.meta.url),
      "utf8",
    );

    // Success feedback is only set in the submit flow after a confirmed save...
    expect(clientSource).toContain(
      'setFeedback({ variant: "success", message: "Saved." })',
    );
    // ...and is never reflected from an attacker-controlled search param.
    expect(clientSource).not.toContain('params.set("saved"');
    expect(clientSource).not.toContain("saved?: boolean");
    expect(clientSource).not.toContain("if (saved)");
    expect(pageSource).not.toContain("params.saved");
    expect(pageSource).not.toContain("saved={");
  });
});
