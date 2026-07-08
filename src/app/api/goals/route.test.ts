import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ADMIN = {
  id: 7,
  email: "admin@easternstate.org",
  name: "Admin",
  role: "admin" as const,
  must_change_password: false,
};

vi.mock("@/features/auth/session", () => ({
  requireSession: vi.fn(async () => ADMIN),
  requireAdmin: vi.fn(async () => ADMIN),
  authErrorResponse: (err: { status?: number }) => {
    const status = err?.status ?? 401;
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  },
}));

const {
  deleteGoalMock,
  getKPIMock,
  listGoalsMock,
  toggleGoalMock,
  updateGoalMock,
  upsertGoalMock,
} = vi.hoisted(() => ({
  deleteGoalMock: vi.fn(),
  getKPIMock: vi.fn(),
  listGoalsMock: vi.fn(),
  toggleGoalMock: vi.fn(),
  updateGoalMock: vi.fn(),
  upsertGoalMock: vi.fn(),
}));

vi.mock("@/features/goals", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/goals")>(
      "@/features/goals",
    );
  return {
    ...actual,
    deleteGoal: deleteGoalMock,
    listGoals: listGoalsMock,
    toggleGoal: toggleGoalMock,
    updateGoal: updateGoalMock,
    upsertGoal: upsertGoalMock,
  };
});

vi.mock("@/features/catalog/server", () => ({
  getKPI: getKPIMock,
}));

import { DELETE, PATCH, POST } from "./route";

const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";
const REFRESHED_GOALS = [
  {
    id: 1,
    kpi_id: 10,
    target_year: 2025,
    kpi_name: "Tours",
    full_year_progress_pct: 75,
  },
];

function mutationReq(
  method: "POST" | "PATCH" | "DELETE",
  body: object,
): NextRequest {
  return new NextRequest(
    new Request(
      "http://localhost/api/goals?throughMonth=3&year=2025&asOfYear=2024",
      {
        method,
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          "x-csrf-token": CSRF_TOKEN,
          cookie: `eastern_state_kpi_csrf=${CSRF_TOKEN}`,
        },
        body: JSON.stringify(body),
      },
    ),
  );
}

beforeEach(() => {
  deleteGoalMock.mockReset();
  getKPIMock.mockReset();
  listGoalsMock.mockReset();
  toggleGoalMock.mockReset();
  updateGoalMock.mockReset();
  upsertGoalMock.mockReset();

  getKPIMock.mockReturnValue({ id: 10 });
  listGoalsMock.mockReturnValue(REFRESHED_GOALS);
  upsertGoalMock.mockReturnValue({ id: 1, kpi_id: 10, target_year: 2025 });
});

describe("/api/goals refreshed mutation payloads", () => {
  it("POST returns the newly persisted row and refreshed feature-owned goals", async () => {
    const res = await POST(
      mutationReq("POST", {
        kpi_id: 10,
        target_year: 2025,
        baseline_year: 2023,
        goal_type: "pct",
        target_value: 20,
        enabled: true,
      }),
    );

    expect(res.status).toBe(201);
    expect(upsertGoalMock).toHaveBeenCalledWith({
      kpi_id: 10,
      target_year: 2025,
      baseline_year: 2023,
      goal_type: "pct",
      target_value: 20,
      enabled: true,
      updated_by: ADMIN.id,
    });
    expect(listGoalsMock).toHaveBeenCalledWith({
      throughMonth: 3,
      year: 2025,
      asOfYear: 2024,
    });
    await expect(res.json()).resolves.toMatchObject({
      goal: { id: 1, kpi_id: 10, target_year: 2025 },
      goals: REFRESHED_GOALS,
    });
  });

  it("PATCH returns refreshed goals after a target-definition update", async () => {
    const res = await PATCH(
      mutationReq("PATCH", {
        id: 1,
        enabled: true,
        baseline_year: 2023,
        goal_type: "number",
        target_value: 50,
        notes: "Stretch goal",
      }),
    );

    expect(res.status).toBe(200);
    expect(updateGoalMock).toHaveBeenCalledWith({
      id: 1,
      enabled: true,
      baseline_year: 2023,
      goal_type: "number",
      target_value: 50,
      notes: "Stretch goal",
      updated_by: ADMIN.id,
    });
    expect(toggleGoalMock).not.toHaveBeenCalled();
    expect(listGoalsMock).toHaveBeenCalledWith({
      throughMonth: 3,
      year: 2025,
      asOfYear: 2024,
    });
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      goals: REFRESHED_GOALS,
    });
  });

  it("DELETE returns refreshed goals after removal", async () => {
    const res = await DELETE(mutationReq("DELETE", { id: 1 }));

    expect(res.status).toBe(200);
    expect(deleteGoalMock).toHaveBeenCalledWith(1);
    expect(listGoalsMock).toHaveBeenCalledWith({
      throughMonth: 3,
      year: 2025,
      asOfYear: 2024,
    });
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      goals: REFRESHED_GOALS,
    });
  });
});
