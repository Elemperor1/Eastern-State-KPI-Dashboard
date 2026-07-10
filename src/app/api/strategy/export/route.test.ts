import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requireSessionMock, loadOverviewPageDataMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  loadOverviewPageDataMock: vi.fn(),
}));

vi.mock("@/features/auth/session", () => ({
  requireSession: requireSessionMock,
  authErrorResponse: (error: { status?: number }) =>
    Response.json(
      { error: error.status === 403 ? "Forbidden" : "Unauthorized" },
      { status: error.status ?? 401 },
    ),
}));

vi.mock("@/features/reporting/server", () => ({
  loadOverviewPageData: loadOverviewPageDataMock,
}));

import { GET } from "./route";

const REPORT = {
  organizationName: "Eastern State",
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
  loadOverviewPageDataMock.mockReset();
  loadOverviewPageDataMock.mockReturnValue({ strategicBoardReport: REPORT });
});

describe("GET /api/strategy/export", () => {
  it("returns the authorized board report with private no-store caching", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/strategy/export?year=2026"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ report: REPORT });
    expect(loadOverviewPageDataMock).toHaveBeenCalledWith({
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
  });

  it("rejects invalid periods before loading data", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/strategy/export?year=2026&throughMonth=0",
      ),
    );
    expect(response.status).toBe(400);
    expect(loadOverviewPageDataMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    requireSessionMock.mockRejectedValueOnce({ status: 401 });
    const response = await GET(
      new NextRequest("http://localhost/api/strategy/export?year=2026"),
    );
    expect(response.status).toBe(401);
    expect(loadOverviewPageDataMock).not.toHaveBeenCalled();
  });
});
