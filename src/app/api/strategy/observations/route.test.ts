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
  /** Supports the auth error response test scenario. */
  authErrorResponse: () => new Response(null, { status: 401 }),
}));

const { batchUpsertMock, deleteMock, upsertMock } = vi.hoisted(() => ({
  batchUpsertMock: vi.fn(),
  deleteMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/features/strategy/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/strategy/server")>(
    "@/features/strategy/server",
  );
  return {
    ...actual,
    deleteStrategyObservation: deleteMock,
    upsertStrategyMultiComponentBatch: batchUpsertMock,
    upsertStrategyObservation: upsertMock,
  };
});

import {
  StrategyValueEntryNotFoundError,
  StrategyValueEntryValidationError,
} from "@/features/strategy/server";
import { DELETE, POST } from "./route";

const TOKEN = "test-csrf-token-0123456789abcdef";

/** Supports the request test scenario. */
function request(method: "POST" | "DELETE", body: unknown): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/strategy/observations", {
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
  upsertMock.mockReturnValue({ id: 11, kpi_id: 4, period_type: "annual" });
  batchUpsertMock.mockReturnValue([
    { id: 21, component_id: 8, scalar_value: 35 },
    { id: 22, component_id: 9, scalar_value: 12 },
  ]);
});

describe("/api/strategy/observations", () => {
  it("upserts an observation as the authenticated admin", async () => {
    const body = { kpi_id: 4, reporting_year: 2026, value: 12 };
    const response = await POST(request("POST", body));

    expect(response.status).toBe(201);
    expect(upsertMock).toHaveBeenCalledWith(body, ADMIN.id);
    await expect(response.json()).resolves.toEqual({
      observation: { id: 11, kpi_id: 4, period_type: "annual" },
    });
  });

  it("commits a multi-input observation batch through one atomic feature operation", async () => {
    const body = {
      submission_type: "multi_input",
      writes: [
        {
          kind: "component_entry",
          input: { component_id: 8, reporting_year: 2026, value: 35 },
        },
        {
          kind: "component_entry",
          input: { component_id: 9, reporting_year: 2026, value: 12 },
        },
      ],
    };
    const response = await POST(request("POST", body));

    expect(response.status).toBe(201);
    expect(batchUpsertMock).toHaveBeenCalledWith(body, ADMIN.id);
    expect(upsertMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      results: [
        { id: 21, component_id: 8, scalar_value: 35 },
        { id: 22, component_id: 9, scalar_value: 12 },
      ],
    });
  });

  it("returns structured validation failures for a multi-input batch", async () => {
    const response = await POST(
      request("POST", { submission_type: "multi_input", writes: [] }),
    );

    expect(response.status).toBe(400);
    expect(batchUpsertMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid observation submission.",
      issues: [{ path: "writes" }],
    });
  });

  it("deletes by observation id", async () => {
    const response = await DELETE(request("DELETE", { id: 11 }));
    expect(response.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith(11, ADMIN.id);
  });

  it("returns structured 400 validation failures", async () => {
    upsertMock.mockImplementationOnce(() => {
      throw new StrategyValueEntryValidationError("Invalid reporting period.", [
        { path: "reporting_month", message: "Choose a calendar month." },
      ]);
    });
    const response = await POST(
      request("POST", { kpi_id: 4, reporting_year: 2026 }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid reporting period.",
      issues: [{ path: "reporting_month" }],
    });
  });

  it("returns 404 when a delete races with another writer", async () => {
    deleteMock.mockImplementationOnce(() => {
      throw new StrategyValueEntryNotFoundError("observation", 11);
    });
    const response = await DELETE(request("DELETE", { id: 11 }));
    expect(response.status).toBe(404);
  });
});
