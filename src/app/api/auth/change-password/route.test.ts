/**
 * Integration test for the /api/auth/change-password throttle wiring
 * (F-03): repeated wrong current-password guesses are throttled with
 * 429 + Retry-After, the lock is checked BEFORE the bcrypt compare, and
 * a correct current password clears the counter — uniform with
 * /api/auth/login but in its own key space.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const USER = {
  id: 11,
  email: "user@example.org",
  name: "User",
  role: "viewer" as const,
  created_at: "2026-01-01",
  must_change_password: true,
  disabled: false,
  sessions_valid_after: 1,
};

const { sessionState } = vi.hoisted(() => ({
  sessionState: { destroy: vi.fn(async () => {}) },
}));

vi.mock("@/features/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/features/auth/session")>(
    "@/features/auth/session",
  );
  return {
    ...actual,
    getCurrentUser: vi.fn(async () => USER),
    getSession: vi.fn(async () => sessionState),
  };
});

const { verifyCredentialsMock, updateUserPasswordIfCurrentMock } = vi.hoisted(
  () => ({
    verifyCredentialsMock: vi.fn(),
    updateUserPasswordIfCurrentMock: vi.fn(),
  }),
);

vi.mock("@/features/auth/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/auth/server")>(
    "@/features/auth/server",
  );
  return { ...actual, verifyCredentials: verifyCredentialsMock };
});

vi.mock("@/features/users/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/users/server")>(
    "@/features/users/server",
  );
  return {
    ...actual,
    updateUserPasswordIfCurrent: updateUserPasswordIfCurrentMock,
  };
});

import { POST } from "./route";
import { _resetForTests } from "@/lib/login-throttle";

const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";

/** Supports the change req test scenario. */
function changeReq(body: object): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/auth/change-password", {
      method: "POST",
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
  _resetForTests();
  verifyCredentialsMock.mockReset();
  updateUserPasswordIfCurrentMock.mockReset();
  sessionState.destroy.mockClear();
  // Pin a tight deterministic config: 3 failures inside 1 second →
  // 2-second lockout.
  vi.stubEnv("LOGIN_LOCKOUT_THRESHOLD", "3");
  vi.stubEnv("LOGIN_LOCKOUT_WINDOW_MS", "1000");
  vi.stubEnv("LOGIN_LOCKOUT_DURATION_MS", "2000");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/change-password throttle integration", () => {
  it("throttles repeated wrong current-password guesses and stops verifying once locked", async () => {
    verifyCredentialsMock.mockResolvedValue(null);
    const body = { currentPassword: "wrong-pass", newPassword: "NewPass!2026" };

    for (let i = 0; i < 3; i++) {
      const res = await POST(changeReq(body));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        error: "Your current password is incorrect.",
      });
    }
    // The attempt that tripped the threshold carries the Retry-After hint.
    expect(verifyCredentialsMock).toHaveBeenCalledTimes(3);

    // The NEXT attempt is throttled with 429 BEFORE the bcrypt compare.
    const blocked = await POST(changeReq(body));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(verifyCredentialsMock).toHaveBeenCalledTimes(3);
  });

  it("clears the failure counter after a correct current password", async () => {
    verifyCredentialsMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        user: USER,
        credentialVersion: 7,
        passwordHash: "$2a$10$test",
      });
    updateUserPasswordIfCurrentMock.mockReturnValue(true);

    for (let i = 0; i < 2; i++) {
      const res = await POST(
        changeReq({ currentPassword: "wrong-pass", newPassword: "NewPass!2026" }),
      );
      expect(res.status).toBe(401);
    }

    const recovered = await POST(
      changeReq({ currentPassword: "correct-pass", newPassword: "NewPass!2026" }),
    );
    expect(recovered.status).toBe(200);

    // Counter cleared: a later wrong guess starts fresh (401, not 429).
    verifyCredentialsMock.mockResolvedValue(null);
    const after = await POST(
      changeReq({ currentPassword: "wrong-pass", newPassword: "NewPass!2026" }),
    );
    expect(after.status).toBe(401);
  });

  it("does not consume a failure slot for malformed bodies", async () => {
    const res = await POST(changeReq({ currentPassword: "x" }));
    expect(res.status).toBe(400);
    expect(verifyCredentialsMock).not.toHaveBeenCalled();
  });

  it("rejects oversized current or new passwords before any bcrypt work (S025-C1)", async () => {
    const oversizedCurrent = await POST(
      changeReq({
        currentPassword: "x".repeat(257),
        newPassword: "NewPass!2026",
      }),
    );
    expect(oversizedCurrent.status).toBe(400);

    const oversizedNew = await POST(
      changeReq({
        currentPassword: "correct-pass",
        newPassword: `Np!${"x".repeat(256)}`,
      }),
    );
    expect(oversizedNew.status).toBe(400);

    expect(verifyCredentialsMock).not.toHaveBeenCalled();
    expect(updateUserPasswordIfCurrentMock).not.toHaveBeenCalled();
  });
});
