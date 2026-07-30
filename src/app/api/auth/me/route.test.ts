import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const VIEWER = {
  id: 3,
  email: "viewer@easternstate.org",
  name: "Viewer",
  role: "viewer" as const,
  must_change_password: false,
};

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/features/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

import { GET } from "./route";

/** Supports the me req test scenario. */
function meReq(): NextRequest {
  return new NextRequest("http://localhost/api/auth/me");
}

describe("GET /api/auth/me", () => {
  it("returns the current user with private no-store caching (PFM-C1)", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(VIEWER);

    const response = await GET(meReq());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: VIEWER });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("marks anonymous identity responses uncacheable as well", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const response = await GET(meReq());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: null });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
