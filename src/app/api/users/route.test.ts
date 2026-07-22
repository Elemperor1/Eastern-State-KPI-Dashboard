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
  createUserMock,
  deleteUserMock,
  listUsersMock,
  updateUserPasswordMock,
} = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
  listUsersMock: vi.fn(),
  updateUserPasswordMock: vi.fn(),
}));

vi.mock("@/features/users/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/users/server")>(
    "@/features/users/server",
  );
  return {
    ...actual,
    createUser: createUserMock,
    deleteUser: deleteUserMock,
    listUsers: listUsersMock,
    updateUserPassword: updateUserPasswordMock,
  };
});

import { DELETE, PATCH, POST } from "./route";

const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";
const REFRESHED_USERS = [
  {
    id: 11,
    email: "viewer@easternstate.org",
    name: "Viewer",
    role: "viewer",
    created_at: "2026-01-01",
    must_change_password: true,
    disabled: false,
    sessions_valid_after: 123,
  },
];

/** Supports the mutation req test scenario. */
function mutationReq(method: "POST" | "PATCH" | "DELETE", body: object): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/users", {
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
  createUserMock.mockReset();
  deleteUserMock.mockReset();
  listUsersMock.mockReset();
  updateUserPasswordMock.mockReset();

  createUserMock.mockReturnValue({
    id: 11,
    email: "viewer@easternstate.org",
    name: "Viewer",
    role: "viewer",
  });
  listUsersMock.mockReturnValue(REFRESHED_USERS);
});

describe("/api/users refreshed mutation payloads", () => {
  it("POST returns the created user and refreshed users", async () => {
    const res = await POST(
      mutationReq("POST", {
        name: "Viewer",
        email: "viewer@easternstate.org",
        password: "TempPass!2026",
        role: "viewer",
      }),
    );

    expect(res.status).toBe(201);
    expect(createUserMock).toHaveBeenCalledWith({
      name: "Viewer",
      email: "viewer@easternstate.org",
      password: "TempPass!2026",
      role: "viewer",
    });
    expect(listUsersMock).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({
      user: { id: 11, email: "viewer@easternstate.org" },
      users: REFRESHED_USERS,
    });
  });

  it("POST accepts the restricted Board role", async () => {
    createUserMock.mockReturnValueOnce({
      id: 12,
      email: "board@easternstate.org",
      name: "Board Member",
      role: "board",
    });
    const res = await POST(
      mutationReq("POST", {
        name: "Board Member",
        email: "board@easternstate.org",
        password: "TempPass!2026",
        role: "board",
      }),
    );

    expect(res.status).toBe(201);
    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "board" }),
    );
  });

  it("PATCH returns refreshed users after an admin-issued temporary password reset", async () => {
    const res = await PATCH(
      mutationReq("PATCH", {
        id: 11,
        password: "NewTemp!2026",
      }),
    );

    expect(res.status).toBe(200);
    expect(updateUserPasswordMock).toHaveBeenCalledWith(11, "NewTemp!2026", true);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      users: REFRESHED_USERS,
    });
  });

  it("DELETE returns refreshed users after account deletion", async () => {
    const res = await DELETE(mutationReq("DELETE", { id: 11 }));

    expect(res.status).toBe(200);
    expect(deleteUserMock).toHaveBeenCalledWith(11);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      users: REFRESHED_USERS,
    });
  });
});
