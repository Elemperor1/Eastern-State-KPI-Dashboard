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
  /** Supports the auth error response test scenario. */
  authErrorResponse: (err: { status?: number }) => {
    const status = err?.status ?? 401;
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  },
}));

const {
  archiveKPIMock,
  createStrategicMeasureMock,
  listCategoriesMock,
  listKPIsMock,
  restoreKPIMock,
  retireOrDeleteKPIMock,
  updateKPIMock,
} = vi.hoisted(() => ({
  archiveKPIMock: vi.fn(),
  createStrategicMeasureMock: vi.fn(),
  listCategoriesMock: vi.fn(),
  listKPIsMock: vi.fn(),
  restoreKPIMock: vi.fn(),
  retireOrDeleteKPIMock: vi.fn(),
  updateKPIMock: vi.fn(),
}));

vi.mock("@/features/catalog/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/catalog/server")>(
    "@/features/catalog/server",
  );
  return {
    ...actual,
    archiveKPI: archiveKPIMock,
    createStrategicMeasure: createStrategicMeasureMock,
    listCategories: listCategoriesMock,
    listKPIs: listKPIsMock,
    restoreKPI: restoreKPIMock,
    retireOrDeleteKPI: retireOrDeleteKPIMock,
    updateKPI: updateKPIMock,
  };
});

import { DELETE, PATCH, POST } from "./route";

const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";
const REFRESHED_KPIS = [
  {
    id: 22,
    slug: "new-tours",
    name: "New tours",
    category_id: 3,
    category_name: "Museum",
    category_slug: "museum",
  },
];
const REFRESHED_CATEGORIES = [
  {
    id: 3,
    slug: "museum",
    name: "Museum",
    description: null,
    sort_order: 1,
  },
];

/** Supports the mutation req test scenario. */
function mutationReq(method: "POST" | "PATCH" | "DELETE", body: object): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/kpis", {
      method,
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
  archiveKPIMock.mockReset();
  createStrategicMeasureMock.mockReset();
  listCategoriesMock.mockReset();
  listKPIsMock.mockReset();
  restoreKPIMock.mockReset();
  retireOrDeleteKPIMock.mockReset();
  updateKPIMock.mockReset();

  createStrategicMeasureMock.mockReturnValue({
    kpi: {
      id: 22,
      slug: "new-tours",
      name: "New tours",
      category_id: 3,
    },
    configuration: { id: 31, kpi_id: 22, configuration_status: "draft" },
    membership: { id: 41, goal_id: 9, kpi_id: 22 },
  });
  listCategoriesMock.mockReturnValue(REFRESHED_CATEGORIES);
  listKPIsMock.mockReturnValue(REFRESHED_KPIS);
  retireOrDeleteKPIMock.mockReturnValue("deleted");
});

describe("/api/kpis refreshed mutation payloads", () => {
  it("POST returns the created KPI and refreshed catalog data", async () => {
    const res = await POST(
      mutationReq("POST", {
        goal_id: 9,
        reporting_year: 2026,
        slug: "new-tours",
        name: "New tours",
        unit: "people",
        measurement_type: "count",
        reporting_frequency: "annual",
        direction: "higher",
      }),
    );

    expect(res.status).toBe(201);
    expect(createStrategicMeasureMock).toHaveBeenCalledWith(
      {
        goal_id: 9,
        reporting_year: 2026,
        slug: "new-tours",
        name: "New tours",
        unit: "people",
        measurement_type: "count",
        reporting_frequency: "annual",
        direction: "higher",
      },
      ADMIN.id,
    );
    expect(listKPIsMock).toHaveBeenCalledTimes(1);
    expect(listCategoriesMock).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({
      kpi: { id: 22, slug: "new-tours" },
      configuration: { id: 31, configuration_status: "draft" },
      membership: { id: 41, goal_id: 9 },
      kpis: REFRESHED_KPIS,
      categories: REFRESHED_CATEGORIES,
    });
  });

  it("PATCH returns refreshed catalog data after updating a KPI", async () => {
    const res = await PATCH(
      mutationReq("PATCH", {
        id: 22,
        name: "Updated tours",
        direction: "neutral",
      }),
    );

    expect(res.status).toBe(200);
    expect(updateKPIMock).toHaveBeenCalledWith(
      22,
      {
        name: "Updated tours",
        direction: "neutral",
      },
      ADMIN.id,
    );
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      kpis: REFRESHED_KPIS,
      categories: REFRESHED_CATEGORIES,
    });
  });

  it("PATCH restores an archived strategic KPI with the authenticated actor", async () => {
    const res = await PATCH(
      mutationReq("PATCH", { action: "restore", id: 22 }),
    );

    expect(res.status).toBe(200);
    expect(restoreKPIMock).toHaveBeenCalledWith(22, ADMIN.id);
    expect(updateKPIMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      lifecycle: "restored",
    });
  });

  it("DELETE returns refreshed catalog data after removing a KPI", async () => {
    const res = await DELETE(mutationReq("DELETE", { id: 22 }));

    expect(res.status).toBe(200);
    expect(retireOrDeleteKPIMock).toHaveBeenCalledWith(22, ADMIN.id);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      lifecycle: "deleted",
      kpis: REFRESHED_KPIS,
      categories: REFRESHED_CATEGORIES,
    });
  });
});
