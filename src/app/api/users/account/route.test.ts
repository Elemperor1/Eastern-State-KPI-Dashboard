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

const {
  findUserByIdMock,
  listUsersMock,
  setUserDisabledMock,
  updateUserRoleMock,
} = vi.hoisted(() => ({
  findUserByIdMock: vi.fn(),
  listUsersMock: vi.fn(),
  setUserDisabledMock: vi.fn(),
  updateUserRoleMock: vi.fn(),
}));

vi.mock("@/features/users/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/users/server")>(
    "@/features/users/server",
  );
  return {
    ...actual,
    findUserById: findUserByIdMock,
    listUsers: listUsersMock,
    setUserDisabled: setUserDisabledMock,
    updateUserRole: updateUserRoleMock,
  };
});

import { PATCH } from "./route";

const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";
const TARGET_USER = {
  id: 11,
  email: "viewer@easternstate.org",
  name: "Viewer",
  role: "viewer" as const,
  created_at: "2026-01-01",
  must_change_password: false,
  disabled: false,
  sessions_valid_after: 123,
};
const UPDATED_TARGET = {
  ...TARGET_USER,
  role: "admin" as const,
  disabled: true,
  sessions_valid_after: 456,
};
const REFRESHED_USERS = [UPDATED_TARGET];

function mutationReq(body: object): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/users/account", {
      method: "PATCH",
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
  findUserByIdMock.mockReset();
  listUsersMock.mockReset();
  setUserDisabledMock.mockReset();
  updateUserRoleMock.mockReset();

  findUserByIdMock
    .mockReturnValueOnce(TARGET_USER)
    .mockReturnValue(UPDATED_TARGET);
  listUsersMock.mockReturnValue(REFRESHED_USERS);
});

describe("/api/users/account refreshed mutation payloads", () => {
  it("PATCH returns refreshed users after role and disabled changes", async () => {
    const res = await PATCH(mutationReq({ id: 11, role: "admin", disabled: true }));

    expect(res.status).toBe(200);
    expect(updateUserRoleMock).toHaveBeenCalledWith(11, "admin");
    expect(setUserDisabledMock).toHaveBeenCalledWith(11, true);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      user: UPDATED_TARGET,
      users: REFRESHED_USERS,
    });
  });

  it("rejects self-targeted account changes before mutating or refreshing", async () => {
    const res = await PATCH(mutationReq({ id: ADMIN.id, role: "viewer" }));

    expect(res.status).toBe(400);
    expect(updateUserRoleMock).not.toHaveBeenCalled();
    expect(setUserDisabledMock).not.toHaveBeenCalled();
    expect(listUsersMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({
      error: "You cannot change your own role or disabled state.",
    });
  });

  it("returns 404 for a missing target without refreshing users", async () => {
    findUserByIdMock.mockReset();
    findUserByIdMock.mockReturnValue(null);

    const res = await PATCH(mutationReq({ id: 99, disabled: true }));

    expect(res.status).toBe(404);
    expect(setUserDisabledMock).not.toHaveBeenCalled();
    expect(listUsersMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ error: "User not found." });
  });
});
