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
  archiveCategoryMock,
  createCategoryMock,
  listCategoriesMock,
  listKPIsMock,
  restoreCategoryMock,
  retireOrDeleteCategoryMock,
  updateCategoryMock,
} = vi.hoisted(() => ({
  archiveCategoryMock: vi.fn(),
  createCategoryMock: vi.fn(),
  listCategoriesMock: vi.fn(),
  listKPIsMock: vi.fn(),
  restoreCategoryMock: vi.fn(),
  retireOrDeleteCategoryMock: vi.fn(),
  updateCategoryMock: vi.fn(),
}));

const { updateActiveInstallationMock } = vi.hoisted(() => ({
  updateActiveInstallationMock: vi.fn(),
}));

vi.mock("@/features/installation/server", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/installation/server")
  >("@/features/installation/server");
  return {
    ...actual,
    updateActiveInstallation: updateActiveInstallationMock,
  };
});

vi.mock("@/features/catalog/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/catalog/server")>(
    "@/features/catalog/server",
  );
  return {
    ...actual,
    archiveCategory: archiveCategoryMock,
    createCategory: createCategoryMock,
    listCategories: listCategoriesMock,
    listKPIs: listKPIsMock,
    restoreCategory: restoreCategoryMock,
    retireOrDeleteCategory: retireOrDeleteCategoryMock,
    updateCategory: updateCategoryMock,
  };
});

import { DELETE, PATCH, POST } from "./route";

const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";
const REFRESHED_CATEGORIES = [
  {
    id: 8,
    slug: "visitor-services",
    name: "Visitor Services",
    description: "Visitor service KPIs",
    sort_order: 4,
  },
];
const REFRESHED_KPIS = [
  {
    id: 41,
    slug: "ticket-issues",
    name: "Ticket issues",
    category_id: 8,
    category_name: "Visitor Services",
    category_slug: "visitor-services",
  },
];

function mutationReq(method: "POST" | "PATCH" | "DELETE", body: object): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/categories", {
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
  archiveCategoryMock.mockReset();
  createCategoryMock.mockReset();
  listCategoriesMock.mockReset();
  listKPIsMock.mockReset();
  restoreCategoryMock.mockReset();
  retireOrDeleteCategoryMock.mockReset();
  updateCategoryMock.mockReset();
  updateActiveInstallationMock.mockReset();

  createCategoryMock.mockReturnValue({
    id: 8,
    slug: "visitor-services",
    name: "Visitor Services",
  });
  listCategoriesMock.mockReturnValue(REFRESHED_CATEGORIES);
  listKPIsMock.mockReturnValue(REFRESHED_KPIS);
  retireOrDeleteCategoryMock.mockReturnValue("deleted");
  updateActiveInstallationMock.mockReturnValue({
    organization: { name: "Example Museum", shortName: "Example" },
    plan: { name: "Plan 2030", revision: 2, startYear: 2025, endYear: 2030 },
    years: [2025, 2026, 2027, 2028, 2029, 2030],
  });
});

describe("/api/categories refreshed mutation payloads", () => {
  it("POST returns the created category and refreshed catalog data", async () => {
    const res = await POST(
      mutationReq("POST", {
        slug: "visitor-services",
        name: "Visitor Services",
        description: "Visitor service KPIs",
      }),
    );

    expect(res.status).toBe(201);
    expect(createCategoryMock).toHaveBeenCalledWith(
      {
        slug: "visitor-services",
        name: "Visitor Services",
        description: "Visitor service KPIs",
      },
      ADMIN.id,
    );
    expect(listCategoriesMock).toHaveBeenCalledTimes(1);
    expect(listKPIsMock).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({
      category: { id: 8, slug: "visitor-services" },
      categories: REFRESHED_CATEGORIES,
      kpis: REFRESHED_KPIS,
    });
  });

  it("PATCH returns refreshed catalog data after updating a category", async () => {
    const res = await PATCH(
      mutationReq("PATCH", {
        id: 8,
        name: "Visitor Experience",
        description: null,
      }),
    );

    expect(res.status).toBe(200);
    expect(updateCategoryMock).toHaveBeenCalledWith(
      8,
      {
        name: "Visitor Experience",
        description: null,
      },
      ADMIN.id,
    );
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      categories: REFRESHED_CATEGORIES,
      kpis: REFRESHED_KPIS,
    });
  });

  it("PATCH restores an archived strategic priority with the authenticated actor", async () => {
    const res = await PATCH(
      mutationReq("PATCH", { action: "restore", id: 8 }),
    );

    expect(res.status).toBe(200);
    expect(restoreCategoryMock).toHaveBeenCalledWith(8, ADMIN.id);
    expect(updateCategoryMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      lifecycle: "restored",
    });
  });

  it("PATCH updates persisted installation settings without adding an auth-matrix route", async () => {
    const update = {
      expectedRevision: 1,
      organizationName: "Example Museum",
      organizationShortName: "Example",
      planName: "Plan 2030",
      planDescription: "Extended plan",
      startYear: 2025,
      endYear: 2030,
      sourceReference: "Board approval",
    };
    const res = await PATCH(
      mutationReq("PATCH", { action: "update_plan", ...update }),
    );

    expect(res.status).toBe(200);
    expect(updateActiveInstallationMock).toHaveBeenCalledWith(update, ADMIN.id);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      installation: { plan: { revision: 2, endYear: 2030 } },
    });
  });

  it("PATCH preserves installation conflict handling through the partial mock", async () => {
    const { InstallationEditConflictError } = await vi.importActual<
      typeof import("@/features/installation/server")
    >("@/features/installation/server");
    updateActiveInstallationMock.mockImplementation(() => {
      throw new InstallationEditConflictError();
    });

    const res = await PATCH(
      mutationReq("PATCH", {
        action: "update_plan",
        expectedRevision: 1,
        organizationName: "Example Museum",
        organizationShortName: "Example",
        planName: "Plan 2030",
        planDescription: null,
        startYear: 2025,
        endYear: 2030,
        sourceReference: null,
      }),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/changed after this form was loaded/i),
    });
  });

  it("PATCH preserves installation validation handling through the partial mock", async () => {
    const { InstallationValidationError } = await vi.importActual<
      typeof import("@/features/installation/server")
    >("@/features/installation/server");
    updateActiveInstallationMock.mockImplementation(() => {
      throw new InstallationValidationError("The plan range is invalid.");
    });

    const res = await PATCH(
      mutationReq("PATCH", {
        action: "update_plan",
        expectedRevision: 1,
        organizationName: "Example Museum",
        organizationShortName: "Example",
        planName: "Plan 2030",
        planDescription: null,
        startYear: 2025,
        endYear: 2030,
        sourceReference: null,
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "The plan range is invalid.",
    });
  });

  it("DELETE returns refreshed catalog data after removing a category", async () => {
    const res = await DELETE(mutationReq("DELETE", { id: 8 }));

    expect(res.status).toBe(200);
    expect(retireOrDeleteCategoryMock).toHaveBeenCalledWith(8, ADMIN.id);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      lifecycle: "deleted",
      categories: REFRESHED_CATEGORIES,
      kpis: REFRESHED_KPIS,
    });
  });
});
