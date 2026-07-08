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

const { upsertEntryMock } = vi.hoisted(() => ({
  upsertEntryMock: vi.fn(),
}));

vi.mock("@/features/metrics/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/metrics/server")>(
    "@/features/metrics/server",
  );
  return {
    ...actual,
    upsertEntry: upsertEntryMock,
  };
});

import { EntryPeriodMismatchError } from "@/features/metrics/server";
import { POST } from "./route";

const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";

function postRequest(month: number): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/entries", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "x-csrf-token": CSRF_TOKEN,
        cookie: `eastern_state_kpi_csrf=${CSRF_TOKEN}`,
      },
      body: JSON.stringify({
        kpi_id: 12,
        year: 2026,
        month,
        value: 35,
        notes: null,
      }),
    }),
  );
}

beforeEach(() => {
  upsertEntryMock.mockReset();
  upsertEntryMock.mockReturnValue({
    id: 55,
    kpi_id: 12,
    year: 2026,
    month: 0,
    value: 35,
    notes: null,
    updated_by: ADMIN.id,
    updated_at: "2026-07-08T00:00:00.000Z",
  });
});

describe("/api/entries mutation contract", () => {
  it("returns the entry success envelope", async () => {
    const res = await POST(postRequest(0));

    expect(res.status).toBe(201);
    expect(upsertEntryMock).toHaveBeenCalledWith({
      kpi_id: 12,
      year: 2026,
      month: 0,
      value: 35,
      notes: null,
      updated_by: ADMIN.id,
    });
    await expect(res.json()).resolves.toMatchObject({
      entry: { id: 55, month: 0, value: 35 },
    });
  });

  it("returns 400 when the KPI frequency and entry month do not match", async () => {
    upsertEntryMock.mockImplementationOnce(() => {
      throw new EntryPeriodMismatchError("annual", 1);
    });

    const res = await POST(postRequest(1));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Entry month 1 is invalid for an annual KPI; expected month 0.",
    });
  });
});
