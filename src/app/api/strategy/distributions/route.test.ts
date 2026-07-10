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
    deleteStrategyDistribution: deleteMock,
    upsertStrategyDistribution: upsertMock,
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
    new Request("http://localhost/api/strategy/distributions", {
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
  upsertMock.mockReturnValue({ id: 31, respondent_count: 10, bands: [] });
});

describe("/api/strategy/distributions", () => {
  it("upserts the complete distribution payload as the authenticated admin", async () => {
    const body = {
      kpi_id: 6,
      reporting_year: 2026,
      respondent_count: 10,
      bands: [{ slug: "known", label: "Known", count: 10, display_order: 0 }],
    };
    const response = await POST(request("POST", body));

    expect(response.status).toBe(201);
    expect(upsertMock).toHaveBeenCalledWith(body, ADMIN.id);
    await expect(response.json()).resolves.toEqual({
      distribution: { id: 31, respondent_count: 10, bands: [] },
    });
  });

  it("deletes a distribution observation and its values", async () => {
    const response = await DELETE(request("DELETE", { id: 31 }));
    expect(response.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith(31, ADMIN.id);
  });

  it("returns structured 400 validation failures", async () => {
    upsertMock.mockImplementationOnce(() => {
      throw new StrategyValueEntryValidationError("Invalid distribution values.", [
        { path: "bands", message: "Counts must equal respondent total." },
      ]);
    });
    const response = await POST(request("POST", { kpi_id: 6 }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid distribution values.",
      issues: [{ path: "bands" }],
    });
  });

  it("returns 404 for a missing distribution", async () => {
    deleteMock.mockImplementationOnce(() => {
      throw new StrategyValueEntryNotFoundError("distribution", 31);
    });
    const response = await DELETE(request("DELETE", { id: 31 }));
    expect(response.status).toBe(404);
  });
});
