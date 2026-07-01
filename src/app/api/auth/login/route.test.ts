/**
 * Integration test for the /api/auth/login route's throttle wiring.
 *
 * The throttle logic itself is unit-tested in login-throttle.test.ts.
 * This file proves the route actually consults the throttle on every
 * attempt, returns 429 with a Retry-After header once the threshold is
 * crossed, and clears the counters on a successful login.
 *
 * We mock verifyCredentials so the test does not depend on the
 * bcrypt cost or a real user table. The dev DB is still initialised
 * because the route imports getSession() which touches the DB.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

// Mock the verifier so we control success vs failure per-test.
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    verifyCredentials: vi.fn(),
  };
});

// Mock the session so login does not try to write a real iron-session
// cookie. Returning a minimal stub keeps the route's session.save()
// call a no-op.
vi.mock("@/lib/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session")>(
    "@/lib/session",
  );
  return {
    ...actual,
    getSession: vi.fn(async () => ({
      user: undefined,
      save: async () => {},
      destroy: async () => {},
    })),
  };
});

import { verifyCredentials } from "@/lib/auth";
import { POST } from "./route";
import { _resetForTests } from "@/lib/login-throttle";

let tmpDir: string;
let dbPath: string;
let originalDbPath: string | undefined;
let originalNodeEnv: string | undefined;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-login-test-"));
  dbPath = path.join(tmpDir, "test.db");
  originalDbPath = process.env.DATABASE_PATH;
  originalNodeEnv = process.env.NODE_ENV;
  // bracket-notation to bypass the readonly env type at compile time.
  (process.env as Record<string, string | undefined>).DATABASE_PATH = dbPath;
  // Iron-session requires SESSION_SECRET ≥ 32 chars. The session mock
  // ignores it, but the session.ts module's sessionOptions() runs at
  // import time, so we still need a valid value in the env.
  (process.env as Record<string, string | undefined>).SESSION_SECRET =
    "test-secret-test-secret-test-secret-test";
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
});

afterAll(() => {
  if (originalDbPath === undefined) {
    delete (process.env as Record<string, string | undefined>).DATABASE_PATH;
  } else {
    (process.env as Record<string, string | undefined>).DATABASE_PATH = originalDbPath;
  }
  if (originalNodeEnv === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  } else {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

beforeEach(() => {
  _resetForTests();
  vi.mocked(verifyCredentials).mockReset();
  // Pin a tight config: 3 failures inside 1 second → 2-second lockout.
  vi.stubEnv("LOGIN_LOCKOUT_THRESHOLD", "3");
  vi.stubEnv("LOGIN_LOCKOUT_WINDOW_MS", "1000");
  vi.stubEnv("LOGIN_LOCKOUT_DURATION_MS", "2000");
  // Trust x-forwarded-for in tests so each test's distinct IP is
  // honored. Without this, the route collapses every request to the
  // "unknown" IP key (the secure default) and per-IP throttling is
  // impossible to exercise in unit tests.
  vi.stubEnv("TRUST_PROXY", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeLoginRequest(body: object, ip: string): NextRequest {
  const req = new NextRequest(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify(body),
    }),
  );
  return req;
}

function makeFlyLoginRequest(body: object, flyClientIp: string): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "fly-client-ip": flyClientIp,
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/auth/login throttle integration", () => {
  it("returns 400 for malformed input and does not consume a failure slot", async () => {
    const req = makeLoginRequest({ email: "not-an-email", password: "" }, "10.0.0.1");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 on a bad password and records the failure", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    const req = makeLoginRequest(
      { email: "user@example.com", password: "wrong" },
      "10.0.0.2",
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
    // No Retry-After on a single failure (lockout not yet triggered).
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  it("returns 429 with Retry-After after the threshold is crossed", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    // Three failures from the same IP+account → threshold reached.
    for (let i = 0; i < 3; i++) {
      const res = await POST(
        makeLoginRequest(
          { email: "user@example.com", password: "wrong" },
          "10.0.0.3",
        ),
      );
      expect(res.status).toBe(401);
    }
    // The 4th attempt should hit the lockout.
    const blocked = await POST(
      makeLoginRequest(
        { email: "user@example.com", password: "wrong" },
        "10.0.0.3",
      ),
    );
    expect(blocked.status).toBe(429);
    const retryAfter = blocked.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("tracks IP and account independently", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    // Three failures from IP A against the same account → account
    // lockout triggered.
    for (let i = 0; i < 3; i++) {
      await POST(
        makeLoginRequest(
          { email: "shared@example.com", password: "wrong" },
          "10.0.0.4",
        ),
      );
    }
    // A request from a different IP for the same account is still
    // blocked because the account key is locked.
    const blockedSameAcct = await POST(
      makeLoginRequest(
        { email: "shared@example.com", password: "wrong" },
        "10.0.0.5",
      ),
    );
    expect(blockedSameAcct.status).toBe(429);

    // But a request from a *different* IP for a *different* account
    // is not blocked (no failures recorded against either key).
    const okNewAcct = await POST(
      makeLoginRequest(
        { email: "fresh@example.com", password: "wrong" },
        "10.0.0.6",
      ),
    );
    expect(okNewAcct.status).toBe(401);
    expect(okNewAcct.headers.get("Retry-After")).toBeNull();
  });

  it("uses Fly's client IP header when trusted proxy mode is enabled", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    for (let i = 0; i < 3; i++) {
      const res = await POST(
        makeFlyLoginRequest(
          { email: `fly-${i}@example.com`, password: "wrong" },
          "203.0.113.9",
        ),
      );
      expect(res.status).toBe(401);
    }

    const blocked = await POST(
      makeFlyLoginRequest(
        { email: "fly-new@example.com", password: "wrong" },
        "203.0.113.9",
      ),
    );
    expect(blocked.status).toBe(429);

    const differentFlyIp = await POST(
      makeFlyLoginRequest(
        { email: "fly-new@example.com", password: "wrong" },
        "203.0.113.10",
      ),
    );
    expect(differentFlyIp.status).toBe(401);
  });

  it("clears counters on a successful login so a stale failure does not lock a user out", async () => {
    // Two failures from the same IP+account (under the threshold).
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    await POST(
      makeLoginRequest(
        { email: "lucky@example.com", password: "wrong" },
        "10.0.0.7",
      ),
    );
    await POST(
      makeLoginRequest(
        { email: "lucky@example.com", password: "wrong" },
        "10.0.0.7",
      ),
    );
    // Now succeed.
    vi.mocked(verifyCredentials).mockResolvedValue({
      id: 1,
      email: "lucky@example.com",
      name: "Lucky",
      role: "admin",
    });
    const ok = await POST(
      makeLoginRequest(
        { email: "lucky@example.com", password: "correct" },
        "10.0.0.7",
      ),
    );
    expect(ok.status).toBe(200);

    // A new failure from the same IP+account should start at 1, not
    // 3, because the success cleared the counters.
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    const after = await POST(
      makeLoginRequest(
        { email: "lucky@example.com", password: "wrong" },
        "10.0.0.7",
      ),
    );
    expect(after.status).toBe(401);
    expect(after.headers.get("Retry-After")).toBeNull();
  });
});
