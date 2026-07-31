// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategicDataEntryPageData } from "@/features/strategy";

const { apiFetchMock, refreshMock, replaceMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  refreshMock: vi.fn(),
  replaceMock: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock }));
vi.mock("next/navigation", () => ({
  /** Supports the use router test scenario. */
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
}));

import { StrategicDataEntryClient } from "./StrategicDataEntryClient";

/** Supports the saved observation test scenario. */
function savedObservation() {
  return {
    id: 91,
    kind: "observation" as const,
    kpiId: 7,
    componentId: null,
    componentLabel: null,
    measurementType: "count" as const,
    reportingFrequency: "monthly" as const,
    year: 2027,
    periodType: "monthly" as const,
    periodIndex: 4,
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

/** Supports the page data test scenario. */
function pageData(): StrategicDataEntryPageData {
  const period = {
    value: "monthly:4",
    label: "April",
    periodType: "monthly" as const,
    periodIndex: 4,
  };
  return {
    reportingYear: 2027,
    years: [2027],
    reportingPeriod: period,
    reportingPeriods: [period],
    showSelectedKpi: true,
    kpis: [{
      id: 7,
      name: "Visitor reach",
      priorityName: "Reimagine Visitor Experience",
      goalName: "Broaden programming",
      measurementType: "count",
      reportingFrequency: "monthly",
      configurationStatus: "active",
      checklistStatus: "complete",
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
      measurementType: "count",
      reportingFrequency: "monthly",
      configurationStatus: "active",
      calculationPrecision: 1,
      fixedDenominator: null,
      components: [],
      bands: [],
    },
    records: [savedObservation()],
    loadError: null,
  };
}

describe("Data Entry result removal", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    refreshMock.mockReset();
    replaceMock.mockReset();
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });
  afterEach(cleanup);

  /** Confirms the removal through its dialog. */
  async function confirmRemoval() {
    fireEvent.click(screen.getByRole("button", { name: /Remove saved result/ }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove result" }),
    );
  }

  it("empties the input as soon as the server confirms, without waiting for the refresh", async () => {
    // A refresh that never resolves stands in for a slow or failed RSC fetch.
    refreshMock.mockImplementation(() => undefined);
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(createElement(StrategicDataEntryClient, { data: pageData() }));
    const value = screen.getByLabelText("Value") as HTMLInputElement;
    expect(value.value).toBe("120");

    await confirmRemoval();

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/strategy/observations",
        expect.objectContaining({ method: "DELETE", body: { id: 91 } }),
      );
    });

    // The input is empty and the removal action is gone even though the
    // server data still contains the record, so a follow-up Save cannot
    // recreate what was just removed.
    await waitFor(() => {
      expect((screen.getByLabelText("Value") as HTMLInputElement).value).toBe("");
    });
    expect(
      screen.queryByRole("button", { name: /Remove saved result/ }),
    ).toBeNull();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("keeps the recorded value when the server refuses the removal", async () => {
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Values cannot be deleted for an archived measure." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    render(createElement(StrategicDataEntryClient, { data: pageData() }));
    await confirmRemoval();

    await waitFor(() => {
      expect(screen.getByText(/archived measure/)).toBeTruthy();
    });
    // Nothing was removed, so the value and its action both survive.
    expect((screen.getByLabelText("Value") as HTMLInputElement).value).toBe("120");
    expect(
      screen.getByRole("button", { name: /Remove saved result/ }),
    ).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
