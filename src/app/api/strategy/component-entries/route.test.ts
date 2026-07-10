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
  requireAdmin: vi.fn(async () => ADMIN),
  authErrorResponse: () => new Response(null, { status: 401 }),
}));

const { deleteMock, upsertMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/features/strategy/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/strategy/server")>(
    "@/features/strategy/server",
  );
  return {
    ...actual,
    deleteStrategyComponentEntry: deleteMock,
    upsertStrategyComponentEntry: upsertMock,
  };
});

import {
  StrategyValueEntryNotFoundError,
  StrategyValueEntryValidationError,
} from "@/features/strategy/server";
import { DELETE, POST } from "./route";

const TOKEN = "test-csrf-token-0123456789abcdef";

function request(method: "POST" | "DELETE", body: unknown): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/strategy/component-entries", {
      method,
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "x-csrf-token": TOKEN,
        cookie: `eastern_state_kpi_csrf=${TOKEN}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  upsertMock.mockReturnValue({ id: 21, component_id: 8, scalar_value: 35 });
});

describe("/api/strategy/component-entries", () => {
  it("upserts a component entry as the authenticated admin", async () => {
    const body = { component_id: 8, reporting_year: 2026, value: 35 };
    const response = await POST(request("POST", body));

    expect(response.status).toBe(201);
    expect(upsertMock).toHaveBeenCalledWith(body, ADMIN.id);
    await expect(response.json()).resolves.toEqual({
      component_entry: { id: 21, component_id: 8, scalar_value: 35 },
    });
  });

  it("deletes by component-entry id", async () => {
    const response = await DELETE(request("DELETE", { id: 21 }));
    expect(response.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith(21, ADMIN.id);
  });

  it("returns structured 400 validation failures", async () => {
    upsertMock.mockImplementationOnce(() => {
      throw new StrategyValueEntryValidationError("Invalid observation values.", [
        { path: "numerator", message: "A numerator is required." },
      ]);
    });
    const response = await POST(request("POST", { component_id: 8 }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid observation values.",
      issues: [{ path: "numerator" }],
    });
  });

  it("returns 404 for a missing component entry", async () => {
    deleteMock.mockImplementationOnce(() => {
      throw new StrategyValueEntryNotFoundError("component_entry", 21);
    });
    const response = await DELETE(request("DELETE", { id: 21 }));
    expect(response.status).toBe(404);
  });
});
