import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requireAdminMock, updateMembershipMock, successorMembershipMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  updateMembershipMock: vi.fn(),
  successorMembershipMock: vi.fn(),
}));

vi.mock("@/features/auth/session", () => ({
  requireAdmin: requireAdminMock,
  authErrorResponse: (error: { status?: number }) =>
    Response.json(
      { error: error.status === 403 ? "Forbidden" : "Unauthorized" },
      { status: error.status ?? 401 },
    ),
}));

vi.mock("@/features/strategy/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/strategy/server")>(
    "@/features/strategy/server",
  );
  return {
    ...actual,
    createSuccessorStrategicGoalMembership: successorMembershipMock,
    updateStrategicGoalMembership: updateMembershipMock,
  };
});

import { PATCH } from "./route";

const TOKEN = "test-csrf-token-0123456789abcdef";

function request(
  body: Record<string, unknown>,
  options: { origin?: string; csrf?: boolean } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: options.origin ?? "http://localhost",
  };
  if (options.csrf ?? true) {
    headers["x-csrf-token"] = TOKEN;
    headers.cookie = `eastern_state_kpi_csrf=${TOKEN}`;
  }
  return new NextRequest(
    new Request("http://localhost/api/strategy/memberships", {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue({ id: 7, role: "admin" });
  updateMembershipMock.mockReset();
  updateMembershipMock.mockReturnValue({
    id: 41,
    role: "informational",
    weight: 2,
    display_order: 3,
  });
  successorMembershipMock.mockReset();
  successorMembershipMock.mockReturnValue({
    predecessor: { id: 41, effective_to_year: 2026 },
    successor: { id: 42, effective_from_year: 2027 },
  });
});

describe("PATCH /api/strategy/memberships", () => {
  it("requires an admin and CSRF before updating a strict membership patch", async () => {
    const body = {
      id: 41,
      role: "informational",
      weight: 2,
      display_order: 3,
    };
    const response = await PATCH(request(body));
    expect(response.status).toBe(200);
    expect(updateMembershipMock).toHaveBeenCalledWith(body, 7);
    await expect(response.json()).resolves.toEqual({
      membership: expect.objectContaining(body),
    });
  });

  it("rejects non-positive weight and unknown fields before the feature call", async () => {
    expect(
      (await PATCH(request({ id: 41, weight: 0 }))).status,
    ).toBe(400);
    expect(
      (await PATCH(request({ id: 41, role: "required", extra: true }))).status,
    ).toBe(400);
    expect(updateMembershipMock).not.toHaveBeenCalled();
  });

  it("creates a future successor membership atomically", async () => {
    const body = {
      action: "create_successor",
      predecessor_id: 41,
      effective_start_year: 2027,
      role: "informational",
      weight: 2,
      display_order: 3,
    };
    const response = await PATCH(request(body));

    expect(response.status).toBe(201);
    expect(successorMembershipMock).toHaveBeenCalledWith(
      {
        predecessor_id: 41,
        effective_start_year: 2027,
        role: "informational",
        weight: 2,
        display_order: 3,
      },
      7,
    );
  });

  it("runs authorization before CSRF and rejects a forged origin", async () => {
    requireAdminMock.mockRejectedValueOnce({ status: 401 });
    const unauthorized = await PATCH(
      request({ id: 41, role: "required" }, {
        origin: "https://attacker.example",
        csrf: false,
      }),
    );
    expect(unauthorized.status).toBe(401);

    const forged = await PATCH(
      request(
        { id: 41, role: "required" },
        { origin: "https://attacker.example" },
      ),
    );
    expect(forged.status).toBe(403);
    expect(updateMembershipMock).not.toHaveBeenCalled();
  });
});
