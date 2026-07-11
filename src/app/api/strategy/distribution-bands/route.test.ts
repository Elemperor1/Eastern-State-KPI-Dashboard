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
  requireSession: vi.fn(async () => ADMIN),
  authErrorResponse: () => new Response(null, { status: 401 }),
}));

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  reorder: vi.fn(),
  restore: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/features/strategy/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/strategy/server")>(
    "@/features/strategy/server",
  );
  return {
    ...actual,
    archiveStrategyDistributionBand: mocks.archive,
    createStrategyDistributionBand: mocks.create,
    listEffectiveDistributionBands: mocks.list,
    reorderStrategyDistributionBands: mocks.reorder,
    restoreStrategyDistributionBand: mocks.restore,
    updateStrategyDistributionBand: mocks.update,
  };
});

import { StrategyValueEntryValidationError } from "@/features/strategy/server";
import { GET, PATCH, POST } from "./route";

const TOKEN = "test-csrf-token-0123456789abcdef";
const BAND = {
  id: 9,
  kpi_id: 4,
  component_id: null,
  slug: "non-white",
  label: "Non-white audience",
  effective_from_year: 2025,
  effective_to_year: 2029,
  display_order: 0,
  is_unknown: false,
  is_declined: false,
  derived_group: "non_white",
  archived_at: null,
};

function mutation(method: "POST" | "PATCH", body: unknown): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/strategy/distribution-bands", {
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
  mocks.archive.mockReturnValue({ ...BAND, archived_at: "2026-07-09 12:00:00" });
  mocks.create.mockReturnValue(BAND);
  mocks.list.mockReturnValue([BAND]);
  mocks.reorder.mockReturnValue([BAND]);
  mocks.restore.mockReturnValue(BAND);
  mocks.update.mockReturnValue(BAND);
});

describe("/api/strategy/distribution-bands", () => {
  it("lists effective definitions for an authenticated reader", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/strategy/distribution-bands?kpi_id=4&reporting_year=2026&include_archived=true",
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({
      kpi_id: 4,
      component_id: null,
      reporting_year: 2026,
      include_archived: true,
    });
    await expect(response.json()).resolves.toEqual({ bands: [BAND] });
  });

  it("creates a band as an admin", async () => {
    const body = {
      kpi_id: 4,
      slug: "non-white",
      label: "Non-white audience",
      effective_from_year: 2025,
      effective_to_year: 2029,
      display_order: 0,
      derived_group: "non_white",
    };
    const response = await POST(mutation("POST", body));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(body, ADMIN.id);
  });

  it.each([
    ["update", "update", { action: "update", band: BAND }],
    ["reorder", "reorder", { action: "reorder", order: { kpi_id: 4, reporting_year: 2026, ordered_band_ids: [9] } }],
    ["archive", "archive", { action: "archive", id: 9 }],
    ["restore", "restore", { action: "restore", id: 9 }],
  ] as const)("dispatches the %s lifecycle action", async (_name, mockName, body) => {
    const response = await PATCH(mutation("PATCH", body));
    expect(response.status).toBe(200);
    expect(mocks[mockName]).toHaveBeenCalled();
  });

  it("returns a structured validation error from the server contract", async () => {
    mocks.create.mockImplementationOnce(() => {
      throw new StrategyValueEntryValidationError("Invalid strategy value entry.", [
        { path: "derived_group", message: "Choose a supported group." },
      ]);
    });
    const response = await POST(mutation("POST", {}));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      issues: [{ path: "derived_group" }],
    });
  });
});
