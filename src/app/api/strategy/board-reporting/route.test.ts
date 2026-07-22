import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ADMIN = {
  id: 7,
  email: "admin@easternstate.org",
  name: "Admin",
  role: "admin" as const,
  must_change_password: false,
};

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/features/auth/session", () => ({
  requireAdmin: mocks.requireAdmin,
  /** Supports the auth error response test scenario. */
  authErrorResponse: (error: { status?: number }) => new Response(null, {
    status: error.status === 403 ? 403 : 401,
  }),
}));

vi.mock("@/features/board-reporting", async () => {
  const actual = await vi.importActual<typeof import("@/features/board-reporting")>(
    "@/features/board-reporting",
  );
  return { ...actual, updateBoardReportingScope: mocks.update };
});

import {
  BoardReportingEditConflictError,
  BoardReportingValidationError,
} from "@/features/board-reporting";
import { PATCH } from "./route";

const TOKEN = "test-csrf-token-0123456789abcdef";

/** Builds a same-origin JSON mutation request. */
function mutation(body: unknown): NextRequest {
  return new NextRequest(new Request("http://localhost/api/strategy/board-reporting", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "x-csrf-token": TOKEN,
      cookie: `eastern_state_kpi_csrf=${TOKEN}`,
    },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue(ADMIN);
  mocks.update.mockReturnValue({ id: 1, planId: 2, revision: 2, priorities: [] });
});

describe("PATCH /api/strategy/board-reporting", () => {
  it("atomically saves the validated scope as the authenticated Admin", async () => {
    const body = { expectedRevision: 1, priorities: [] };
    const response = await PATCH(mutation(body));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(body, ADMIN.id);
    await expect(response.json()).resolves.toMatchObject({ scope: { revision: 2 } });
  });

  it("rejects malformed replacement input before the domain operation", async () => {
    const response = await PATCH(mutation({ expectedRevision: -1 }));
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    [new BoardReportingEditConflictError(), 409],
    [new BoardReportingValidationError("Invalid reference."), 400],
  ])("maps an expected domain error to HTTP %s", async (error, status) => {
    mocks.update.mockImplementationOnce(() => { throw error; });
    const response = await PATCH(mutation({ expectedRevision: 1, priorities: [] }));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: error.message });
  });

  it("does not expose the mutation when Admin authorization fails", async () => {
    mocks.requireAdmin.mockRejectedValueOnce({ status: 403 });
    const response = await PATCH(mutation({ expectedRevision: 1, priorities: [] }));
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
