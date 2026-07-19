import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  requireSessionMock,
  listStrategicReportingPeriodsMock,
  loadBoardReportPageDataMock,
} = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  listStrategicReportingPeriodsMock: vi.fn(),
  loadBoardReportPageDataMock: vi.fn(),
}));

vi.mock("@/features/auth/session", () => ({
  requireSession: requireSessionMock,
  /** Supports the auth error response test scenario. */
  authErrorResponse: (error: { status?: number }) =>
    Response.json(
      { error: error.status === 403 ? "Forbidden" : "Unauthorized" },
      { status: error.status ?? 401 },
    ),
}));

vi.mock("@/features/reporting/server", () => ({
  listStrategicReportingPeriods: listStrategicReportingPeriodsMock,
  loadBoardReportPageData: loadBoardReportPageDataMock,
  /** Supports the reporting cycle through month test scenario. */
  reportingCycleThroughMonth: (period: { periodType: string; periodIndex: number }) =>
    period.periodType === "quarterly" ? period.periodIndex * 3 : period.periodIndex,
}));

import { GET } from "./route";

const REPORT = {
  organizationName: "Eastern State",
  organizationSlug: "eastern-state",
  selectedYear: 2026,
  organizationGoalCompletion: {
    completedGoalsCount: 1,
    totalEligibleGoalsCount: 2,
    completionPercentage: 50,
    excludedGoalsCount: 0,
    excludedGoalReasons: [],
    countLabel: "1 of 2 goals completed",
  },
  priorities: [],
  unresolvedReasons: [],
};

beforeEach(() => {
  requireSessionMock.mockReset();
  requireSessionMock.mockResolvedValue({ id: 1, role: "viewer" });
  loadBoardReportPageDataMock.mockReset();
  loadBoardReportPageDataMock.mockReturnValue({ report: REPORT });
  listStrategicReportingPeriodsMock.mockReset();
  listStrategicReportingPeriodsMock.mockReturnValue([{
    value: "monthly:1",
    label: "January",
    periodType: "monthly",
    periodIndex: 1,
  }]);
});

describe("GET /api/strategy/export", () => {
  it("returns the authorized board report with private no-store caching", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/strategy/export?year=2026"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ report: REPORT });
    expect(loadBoardReportPageDataMock).toHaveBeenCalledWith({
      year: 2026,
      throughMonth: 12,
    });
  });

  it("returns an authorized CSV attachment from the same report model", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/strategy/export?year=2026&throughMonth=6&format=csv",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain(
      "eastern-state-strategic-board-2026.csv",
    );
    expect(await response.text()).toContain("Selected Year");
    expect(loadBoardReportPageDataMock).toHaveBeenCalledWith({
      year: 2026,
      throughMonth: 6,
    });
  });

  it("uses the exact reporting period when the export names one", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/strategy/export?year=2026&period=monthly%3A1",
      ),
    );

    expect(response.status).toBe(200);
    expect(loadBoardReportPageDataMock).toHaveBeenCalledWith({
      year: 2026,
      throughMonth: 1,
      reportingPeriod: {
        value: "monthly:1",
        label: "January",
        periodType: "monthly",
        periodIndex: 1,
      },
    });
  });

  it("rejects invalid periods before loading data", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/strategy/export?year=2026&throughMonth=0",
      ),
    );
    expect(response.status).toBe(400);
    expect(loadBoardReportPageDataMock).not.toHaveBeenCalled();
  });

  it("rejects non-numeric query input with the existing flattened API shape", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/strategy/export?year=not-a-year&throughMonth=not-a-month",
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid export query",
      issues: {
        formErrors: [],
        fieldErrors: {
          year: ["Expected number, received nan"],
          throughMonth: ["Expected number, received nan"],
        },
      },
    });
    expect(loadBoardReportPageDataMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    requireSessionMock.mockRejectedValueOnce({ status: 401 });
    const response = await GET(
      new NextRequest("http://localhost/api/strategy/export?year=2026"),
    );
    expect(response.status).toBe(401);
    expect(loadBoardReportPageDataMock).not.toHaveBeenCalled();
  });
});
