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
  authErrorResponse: (err: { status?: number }) => {
    const status = err?.status ?? 401;
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  },
}));

const { deleteBreakdownMock, upsertBreakdownMock } = vi.hoisted(() => ({
  deleteBreakdownMock: vi.fn(),
  upsertBreakdownMock: vi.fn(),
}));

vi.mock("@/features/metrics/server", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/metrics/server")
  >("@/features/metrics/server");
  return {
    ...actual,
    deleteBreakdown: deleteBreakdownMock,
    upsertBreakdown: upsertBreakdownMock,
  };
});

import { POST } from "./route";
import {
  BreakdownEntryConflictError,
  BreakdownEntryNotFoundError,
  BreakdownKpiNotFoundError,
  BreakdownKpiTypeError,
  BreakdownPeriodMismatchError,
} from "@/features/metrics/server";

const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";

function postRequest(body: object): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/breakdowns", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "x-csrf-token": CSRF_TOKEN,
        cookie: `eastern_state_kpi_csrf=${CSRF_TOKEN}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  deleteBreakdownMock.mockReset();
  upsertBreakdownMock.mockReset();
  upsertBreakdownMock.mockReturnValue({
    id: 55,
    kpi_id: 12,
    year: 2026,
    month: 0,
    label: "Renamed funders",
    value: 17,
    sort_order: 0,
    notes: null,
    updated_by: ADMIN.id,
    updated_at: "2026-07-08T00:00:00.000Z",
  });
});

describe("/api/breakdowns mutation contract", () => {
  it("preserves a saved row id and returns the breakdown success envelope", async () => {
    const res = await POST(
      postRequest({
        id: 55,
        kpi_id: 12,
        year: 2026,
        month: 0,
        label: "Renamed funders",
        value: 17,
        notes: null,
      }),
    );

    expect(res.status).toBe(201);
    expect(upsertBreakdownMock).toHaveBeenCalledWith({
      id: 55,
      kpi_id: 12,
      year: 2026,
      month: 0,
      label: "Renamed funders",
      value: 17,
      notes: null,
      updated_by: ADMIN.id,
    });
    await expect(res.json()).resolves.toMatchObject({
      breakdown: {
        id: 55,
        label: "Renamed funders",
        value: 17,
      },
    });
  });

  it("rejects a non-positive saved row id", async () => {
    const res = await POST(
      postRequest({
        id: 0,
        kpi_id: 12,
        year: 2026,
        label: "Funders",
        value: 17,
      }),
    );

    expect(res.status).toBe(400);
    expect(upsertBreakdownMock).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only label before the repository call", async () => {
    const res = await POST(
      postRequest({
        kpi_id: 12,
        year: 2026,
        label: "   ",
        value: 17,
      }),
    );

    expect(res.status).toBe(400);
    expect(upsertBreakdownMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the KPI does not exist", async () => {
    upsertBreakdownMock.mockImplementationOnce(() => {
      throw new BreakdownKpiNotFoundError(12);
    });

    const res = await POST(
      postRequest({
        kpi_id: 12,
        year: 2026,
        label: "Funders",
        value: 17,
      }),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "KPI not found." });
  });

  it("rejects scalar KPIs on the breakdown endpoint", async () => {
    upsertBreakdownMock.mockImplementationOnce(() => {
      throw new BreakdownKpiTypeError(12);
    });

    const res = await POST(
      postRequest({
        kpi_id: 12,
        year: 2026,
        label: "Funders",
        value: 17,
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "KPI 12 is not a breakdown KPI.",
    });
  });

  it("rejects a breakdown month that does not match KPI frequency", async () => {
    upsertBreakdownMock.mockImplementationOnce(() => {
      throw new BreakdownPeriodMismatchError("annual", 1);
    });

    const res = await POST(
      postRequest({
        kpi_id: 12,
        year: 2026,
        month: 1,
        label: "Funders",
        value: 17,
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error:
        "The selected breakdown reporting period is invalid for an annual KPI; select the annual reporting period.",
    });
  });

  it("never exposes the internal annual sentinel in a monthly-period error", async () => {
    upsertBreakdownMock.mockImplementationOnce(() => {
      throw new BreakdownPeriodMismatchError("monthly", 0);
    });

    const res = await POST(
      postRequest({
        kpi_id: 12,
        year: 2026,
        month: 0,
        label: "Funders",
        value: 17,
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error:
        "The selected breakdown reporting period is invalid for a monthly KPI; select a calendar month from January through December.",
    });
  });

  it("returns 404 when a saved row was deleted elsewhere", async () => {
    upsertBreakdownMock.mockImplementationOnce(() => {
      throw new BreakdownEntryNotFoundError(55);
    });

    const res = await POST(
      postRequest({
        id: 55,
        kpi_id: 12,
        year: 2026,
        label: "Funders",
        value: 17,
      }),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Breakdown entry not found.",
    });
  });

  it("returns 409 when an id-based edit conflicts with another row", async () => {
    upsertBreakdownMock.mockImplementationOnce(() => {
      throw new BreakdownEntryConflictError(
        'A breakdown row named "Funders" already exists for this KPI period.',
      );
    });

    const res = await POST(
      postRequest({
        id: 55,
        kpi_id: 12,
        year: 2026,
        label: "Funders",
        value: 17,
      }),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error:
        'A breakdown row named "Funders" already exists for this KPI period.',
    });
  });
});
