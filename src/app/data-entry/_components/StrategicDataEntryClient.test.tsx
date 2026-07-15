import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StrategicDataEntryPageData } from "@/features/strategy";
import { StrategicDataEntryClient } from "./StrategicDataEntryClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

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

describe("Data Entry", () => {
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
    expect(html).toContain("break-words");
    expect(html).not.toContain("truncate");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("border-brand-500");
    expect(html).not.toContain("Measure status:");
  });
});
