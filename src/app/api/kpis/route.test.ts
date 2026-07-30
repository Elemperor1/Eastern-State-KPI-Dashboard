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

const { logUnexpectedServerErrorMock } = vi.hoisted(() => ({
  logUnexpectedServerErrorMock: vi.fn(),
}));

vi.mock("@/lib/operational-log", () => ({
  logUnexpectedServerError: logUnexpectedServerErrorMock,
}));

import { DELETE, PATCH, POST } from "./route";
import {
  CatalogEntityNotFoundError,
  DependentEntriesError,
  KpiArchivedCategoryError,
  KpiParentCycleError,
  KpiSemanticMutationError,
  KpiStrategicReparentError,
  StrategicMeasureContextError,
} from "@/features/catalog/server";

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
  logUnexpectedServerErrorMock.mockReset();
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

describe("/api/kpis catalog string bounds (F-17 R-06: NOV-C1)", () => {
  const createBody = {
    goal_id: 9,
    reporting_year: 2026,
    slug: "new-tours",
    name: "New tours",
    unit: "people",
    measurement_type: "count",
    reporting_frequency: "annual",
    direction: "higher",
  };

  it("POST rejects oversized slug, name, unit, and description", async () => {
    const cases: Array<Record<string, unknown>> = [
      { ...createBody, slug: `s${"s".repeat(120)}` },
      { ...createBody, name: "n".repeat(201) },
      { ...createBody, unit: "u".repeat(81) },
      { ...createBody, description: "d".repeat(4001) },
    ];
    for (const body of cases) {
      const res = await POST(mutationReq("POST", body));
      expect(res.status).toBe(400);
    }
    expect(createStrategicMeasureMock).not.toHaveBeenCalled();
  });

  it("PATCH rejects oversized name, unit, and description", async () => {
    const cases: Array<Record<string, unknown>> = [
      { id: 22, name: "n".repeat(201) },
      { id: 22, unit: "u".repeat(81) },
      { id: 22, description: "d".repeat(4001) },
    ];
    for (const body of cases) {
      const res = await PATCH(mutationReq("PATCH", body));
      expect(res.status).toBe(400);
    }
    expect(updateKPIMock).not.toHaveBeenCalled();
  });

  it("PATCH trims a unit and rejects an empty unit", async () => {
    const trimmed = await PATCH(
      mutationReq("PATCH", { id: 22, unit: "  visitors  " }),
    );
    expect(trimmed.status).toBe(200);
    expect(updateKPIMock).toHaveBeenCalledWith(
      22,
      { unit: "visitors" },
      ADMIN.id,
    );

    updateKPIMock.mockClear();
    const empty = await PATCH(
      mutationReq("PATCH", { id: 22, unit: "   " }),
    );
    expect(empty.status).toBe(400);
    expect(updateKPIMock).not.toHaveBeenCalled();
  });
});

describe("/api/kpis generic error bodies (F-09 R-08: S029-C3, API-001/003/004)", () => {
  const createBody = {
    goal_id: 9,
    reporting_year: 2026,
    slug: "new-tours",
    name: "New tours",
    unit: "people",
    measurement_type: "count",
    reporting_frequency: "annual",
    direction: "higher",
  };

  it("POST never echoes raw SQLite/driver error text to the client", async () => {
    createStrategicMeasureMock.mockImplementation(() => {
      throw new Error("disk I/O error at /var/lib/sqlite/kpi.db");
    });

    const res = await POST(mutationReq("POST", createBody));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Could not create KPI." });
    expect(JSON.stringify(body)).not.toMatch(/sqlite|constraint|kpis\./i);
    expect(logUnexpectedServerErrorMock).toHaveBeenCalledTimes(1);
    expect(logUnexpectedServerErrorMock).toHaveBeenCalledWith({
      method: "POST",
      route: "/api/kpis",
      routeType: "route",
    });
  });

  it("POST maps a duplicate slug to a safe 409 without raw constraint text", async () => {
    createStrategicMeasureMock.mockImplementation(() => {
      throw new Error("UNIQUE constraint failed: kpis.slug");
    });

    const res = await POST(mutationReq("POST", createBody));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: "A measure with that slug already exists." });
    expect(JSON.stringify(body)).not.toMatch(/sqlite|constraint|kpis\./i);
    expect(logUnexpectedServerErrorMock).not.toHaveBeenCalled();
  });

  it("POST never echoes feature-layer error text to the client", async () => {
    createStrategicMeasureMock.mockImplementation(() => {
      throw new Error("Strategic goal 999 was not found.");
    });

    const res = await POST(mutationReq("POST", createBody));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body).toEqual({ error: "Could not create KPI." });
    expect(body.error).not.toContain("Strategic goal");
    expect(body.error).not.toContain("999");
    expect(logUnexpectedServerErrorMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { thrown: new CatalogEntityNotFoundError("KPI", 22), status: 404 },
    { thrown: new DependentEntriesError("kpi", 3), status: 409 },
    { thrown: new KpiSemanticMutationError(22, ["direction"], 2), status: 409 },
    { thrown: new KpiArchivedCategoryError(22, 3), status: 409 },
    { thrown: new KpiStrategicReparentError(22), status: 409 },
    { thrown: new KpiParentCycleError(22), status: 400 },
  ])(
    "POST maps typed catalog errors to a client-safe $status without a server-error log",
    async ({ thrown, status }) => {
      createStrategicMeasureMock.mockImplementation(() => {
        throw thrown;
      });

      const res = await POST(mutationReq("POST", createBody));

      expect(res.status).toBe(status);
      await expect(res.json()).resolves.toEqual({
        error: thrown.message,
        code: thrown.code,
      });
      expect(logUnexpectedServerErrorMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      thrown: new StrategicMeasureContextError(
        "STRATEGIC_MEASURE_GOAL_NOT_FOUND",
        "Strategic goal 999 was not found.",
      ),
      status: 404,
    },
    {
      thrown: new StrategicMeasureContextError(
        "STRATEGIC_MEASURE_CONTEXT_ARCHIVED",
        "Restore the goal and Strategic Priority before adding a measure.",
      ),
      status: 409,
    },
    {
      thrown: new StrategicMeasureContextError(
        "STRATEGIC_MEASURE_REPORTING_YEAR_OUT_OF_RANGE",
        "Reporting year must be between 2025 and 2029.",
      ),
      status: 400,
    },
  ])(
    "POST maps invalid strategic measure context to a client-safe $status",
    async ({ thrown, status }) => {
      createStrategicMeasureMock.mockImplementation(() => {
        throw thrown;
      });

      const res = await POST(mutationReq("POST", createBody));

      expect(res.status).toBe(status);
      await expect(res.json()).resolves.toEqual({
        error: thrown.message,
        code: thrown.code,
      });
      expect(logUnexpectedServerErrorMock).not.toHaveBeenCalled();
    },
  );

  it("PATCH maps strategic or Board-linked reparent refusal to a safe 409", async () => {
    updateKPIMock.mockImplementation(() => {
      throw new KpiStrategicReparentError(22);
    });

    const res = await PATCH(
      mutationReq("PATCH", { id: 22, category_id: 4 }),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error:
        "Strategic measures cannot be moved between Priorities. Create a new measure in the destination Priority and archive the old measure instead.",
      code: "KPI_STRATEGIC_REPARENT_BLOCKED",
    });
    expect(updateKPIMock).toHaveBeenCalledWith(22, { category_id: 4 }, ADMIN.id);
  });

  it("DELETE rejects bodies with unknown keys (strict schema)", async () => {
    const res = await DELETE(mutationReq("DELETE", { id: 22, extra: "nope" }));

    expect(res.status).toBe(400);
    expect(retireOrDeleteKPIMock).not.toHaveBeenCalled();
  });

  it("PATCH returns 404 (not a silent 200) for a nonexistent KPI id", async () => {
    updateKPIMock.mockImplementation(() => {
      throw new CatalogEntityNotFoundError("KPI", 99999);
    });

    const res = await PATCH(mutationReq("PATCH", { id: 99999, name: "Ghost" }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      code: "CATALOG_ENTITY_NOT_FOUND",
    });
  });

  it("PATCH maps a nonexistent destination category to the typed 404 contract", async () => {
    updateKPIMock.mockImplementation(() => {
      throw new CatalogEntityNotFoundError("category", 99999);
    });

    const res = await PATCH(
      mutationReq("PATCH", { id: 22, category_id: 99999 }),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "category 99999 was not found.",
      code: "CATALOG_ENTITY_NOT_FOUND",
    });
  });

  it("PATCH archive/restore returns 404 (not a silent 200) for a nonexistent KPI id", async () => {
    archiveKPIMock.mockImplementation(() => {
      throw new CatalogEntityNotFoundError("KPI", 99999);
    });

    const res = await PATCH(
      mutationReq("PATCH", { action: "archive", id: 99999 }),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      code: "CATALOG_ENTITY_NOT_FOUND",
    });
  });

  it("DELETE returns 404 (not a silent 200) for a nonexistent KPI id", async () => {
    retireOrDeleteKPIMock.mockImplementation(() => {
      throw new CatalogEntityNotFoundError("KPI", 99999);
    });

    const res = await DELETE(mutationReq("DELETE", { id: 99999 }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      code: "CATALOG_ENTITY_NOT_FOUND",
    });
  });
});
