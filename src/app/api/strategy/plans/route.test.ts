import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ADMIN = {
  id: 23,
  email: "plans-admin@example.org",
  name: "Plans Admin",
  role: "admin" as const,
  must_change_password: false,
};

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  create: vi.fn(),
  model: vi.fn(),
}));

vi.mock("@/features/auth/session", () => ({
  requireAdmin: mocks.requireAdmin,
  /** Supports authorization failures without exposing details. */
  authErrorResponse: (error: { status?: number }) =>
    new Response(null, { status: error.status === 403 ? 403 : 401 }),
}));

vi.mock("@/features/plans/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/plans/server")>(
    "@/features/plans/server",
  );
  return {
    ...actual,
    createSuccessorDraft: mocks.create,
    getPlanManagerModel: mocks.model,
  };
});

import { PlanLifecycleConflictError } from "@/features/plans/server";
import { GET, POST } from "./route";

const TOKEN = "plan-route-csrf-token-0123456789";

/** Builds one same-origin protected JSON request. */
function mutation(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/strategy/plans", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "x-csrf-token": TOKEN,
      cookie: `eastern_state_kpi_csrf=${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue(ADMIN);
  mocks.model.mockReturnValue({ active: { id: 1 }, draft: null });
});

describe("/api/strategy/plans", () => {
  it("returns the Admin Plans workspace", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      plans: { active: { id: 1 }, draft: null },
    });
  });

  it("rejects non-Admin access before loading plan details", async () => {
    mocks.requireAdmin.mockRejectedValueOnce({ status: 403 });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it("validates and attributes Draft creation to the authenticated Admin", async () => {
    const input = {
      creationMethod: "blank",
      name: "Strategic Plan 2030–2034",
      description: "The next plan.",
      endYear: 2034,
      approvalSource: "Board resolution",
    };
    const response = await POST(mutation({ action: "create", input }));
    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(input, ADMIN.id);
  });

  it("rejects malformed actions before a domain write", async () => {
    const response = await POST(mutation({ action: "create", input: {} }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns a stable optimistic-concurrency conflict", async () => {
    mocks.create.mockImplementationOnce(() => {
      throw new PlanLifecycleConflictError(
        "A next plan is already being prepared.",
        "draft_exists",
      );
    });
    const response = await POST(mutation({
      action: "create",
      input: {
        creationMethod: "blank",
        name: "Next plan",
        description: "Description",
        endYear: 2034,
        approvalSource: "Board resolution",
      },
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "A next plan is already being prepared.",
      code: "draft_exists",
    });
  });
});
