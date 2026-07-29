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

const { sessionState } = vi.hoisted(() => ({
  sessionState: {
    user: undefined as unknown,
    issuedAt: undefined as number | undefined,
    credentialVersion: undefined as number | undefined,
    save: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
  },
}));

// Mock the verifier so we control success vs failure per-test.
vi.mock("@/features/auth/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/auth/server")>("@/features/auth/server");
  return {
    ...actual,
    verifyCredentials: vi.fn(),
  };
});

// Mock the session so login does not try to write a real iron-session
// cookie. Returning a minimal stub keeps the route's session.save()
// call a no-op.
vi.mock("@/features/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/features/auth/session")>(
    "@/features/auth/session",
  );
  return {
    ...actual,
    getSession: vi.fn(async () => sessionState),
  };
});

import { verifyCredentials } from "@/features/auth/server";
import { POST } from "./route";
import { _resetForTests } from "@/lib/login-throttle";
import { CREDENTIAL_BODY_MAX_BYTES } from "@/lib/request-body";

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
  sessionState.user = undefined;
  sessionState.issuedAt = undefined;
  sessionState.credentialVersion = undefined;
  sessionState.save.mockClear();
  sessionState.destroy.mockClear();
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

/** Supports the make login request test scenario. */
function makeLoginRequest(body: object, ip: string): NextRequest {
  const req = new NextRequest(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify(body),
    }),
  );
  return req;
}

/** Supports the make fly login request test scenario. */
function makeFlyLoginRequest(body: object, flyClientIp: string): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
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

  it("counts ONLY well-formed credential-verification failures toward lockout (S004-C2 invariant)", async () => {
    // With threshold 1, a single COUNTED failure locks the key
    // immediately, so any slot consumed by a rejection class below
    // shows up as a spurious 429. The named invariant: a failure slot
    // is consumed by exactly one event — a request that passed the
    // request guard AND the zod schema AND failed verifyCredentials
    // (including wrong-password attempts against an account-locked
    // account, which advance the source-IP counter). Rejections that
    // never reach verification must be throttle-free so an attacker
    // cannot burn a victim's IP/account budget with bcrypt-free
    // malformed traffic.
    vi.stubEnv("LOGIN_LOCKOUT_THRESHOLD", "1");
    vi.mocked(verifyCredentials).mockResolvedValue(null);

    // (a) malformed schema → 400
    const malformed = await POST(
      makeLoginRequest({ email: "not-an-email", password: "" }, "10.0.7.1"),
    );
    expect(malformed.status).toBe(400);
    // (b) cross-origin → 403
    const crossOrigin = await POST(
      new NextRequest(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://evil.example.com",
            "x-forwarded-for": "10.0.7.1",
          },
          body: JSON.stringify({ email: "counted@example.com", password: "wrong" }),
        }),
      ),
    );
    expect(crossOrigin.status).toBe(403);
    // (c) wrong content type → 415
    const wrongContentType = await POST(
      new NextRequest(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "text/plain",
            origin: "http://localhost",
            "x-forwarded-for": "10.0.7.1",
          },
          body: JSON.stringify({ email: "counted@example.com", password: "wrong" }),
        }),
      ),
    );
    expect(wrongContentType.status).toBe(415);
    // None of the three reached the verifier…
    expect(vi.mocked(verifyCredentials)).not.toHaveBeenCalled();

    // …so the first WELL-FORMED wrong-password attempt is still
    // admitted to verification (401, not a pre-verify 429): zero slots
    // were consumed by the rejection classes above.
    const firstCounted = await POST(
      makeLoginRequest(
        { email: "counted@example.com", password: "wrong" },
        "10.0.7.1",
      ),
    );
    expect(firstCounted.status).toBe(401);
    expect(vi.mocked(verifyCredentials)).toHaveBeenCalledTimes(1);

    // And exactly that one verified failure trips the threshold-1
    // lockout — proving the counter moved by 1, not by the 4 requests.
    const blocked = await POST(
      makeLoginRequest(
        { email: "counted@example.com", password: "wrong" },
        "10.0.7.1",
      ),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
  });

  it("collapses every request onto the single 'unknown' IP key when TRUST_PROXY is unset (S004-C2)", async () => {
    // The documented fail-closed default: without TRUST_PROXY=true the
    // route must NOT trust attacker-controlled forwarded-IP headers, so
    // all anonymous traffic shares one throttle bucket. An attacker
    // rotating X-Forwarded-For (or Fly's header) per request cannot
    // evade per-IP throttling — at the cost of throttling everyone
    // behind the shared key.
    vi.stubEnv("TRUST_PROXY", undefined);
    vi.mocked(verifyCredentials).mockResolvedValue(null);

    // Three failures, each spoofing a DIFFERENT source IP and a
    // different account, so only the shared IP key can accumulate.
    for (let i = 0; i < 3; i++) {
      const res = await POST(
        makeLoginRequest(
          { email: `spray-${i}@example.com`, password: "wrong" },
          `10.9.9.${i + 1}`,
        ),
      );
      expect(res.status).toBe(401);
      // Below the threshold the failure is a plain 401; the failure
      // that trips the lockout reports Retry-After on its 401.
      if (i < 2) {
        expect(res.headers.get("Retry-After")).toBeNull();
      }
    }

    // A fourth attempt — yet another spoofed XFF and a fresh account
    // (neither key has a recorded failure under a trusting reading) —
    // is throttled: the spoofed headers were ignored.
    const blocked = await POST(
      makeLoginRequest(
        { email: "bystander@example.com", password: "wrong" },
        "10.9.9.99",
      ),
    );
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);

    // Fly's dedicated header is likewise untrusted in this mode: the
    // lock that just fired applies to a request carrying it too.
    const flySpoof = await POST(
      makeFlyLoginRequest(
        { email: "another@example.com", password: "wrong" },
        "203.0.113.200",
      ),
    );
    expect(flySpoof.status).toBe(429);
  });

  it("refuses a cross-origin forced login with 403 before any verification (S064-C1)", async () => {
    const req = new NextRequest(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example.com",
        },
        body: JSON.stringify({
          email: "user@example.com",
          password: "whatever",
        }),
      }),
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(vi.mocked(verifyCredentials)).not.toHaveBeenCalled();
  });

  it("refuses a CORS-safelisted text/plain login body with 415 (S064-C1)", async () => {
    const req = new NextRequest(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "user@example.com",
          password: "whatever",
        }),
      }),
    );
    const res = await POST(req);
    expect(res.status).toBe(415);
    expect(vi.mocked(verifyCredentials)).not.toHaveBeenCalled();
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

  it("preserves the aggregate IP budget when one account logs in successfully", async () => {
    // Two failures from the same IP against different accounts (under
    // the threshold) establish source-wide spray history.
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    await POST(
      makeLoginRequest(
        { email: "first@example.com", password: "wrong" },
        "10.0.0.7",
      ),
    );
    await POST(
      makeLoginRequest(
        { email: "second@example.com", password: "wrong" },
        "10.0.0.7",
      ),
    );
    // A success for a third account must not erase failures against
    // other accounts from this source.
    vi.mocked(verifyCredentials).mockResolvedValue({
      user: {
        id: 1,
        email: "lucky@example.com",
        name: "Lucky",
        role: "admin",
        must_change_password: false,
      },
      credentialVersion: 101,
      passwordHash: "$2a$10$test-lucky",
    });
    const ok = await POST(
      makeLoginRequest(
        { email: "lucky@example.com", password: "correct" },
        "10.0.0.7",
      ),
    );
    expect(ok.status).toBe(200);

    // The next failure reaches the IP threshold, and the following
    // request is rejected from the retained source budget.
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    const threshold = await POST(
      makeLoginRequest(
        { email: "fourth@example.com", password: "wrong" },
        "10.0.0.7",
      ),
    );
    expect(threshold.status).toBe(401);
    expect(threshold.headers.get("Retry-After")).not.toBeNull();

    const blocked = await POST(
      makeLoginRequest(
        { email: "fifth@example.com", password: "wrong" },
        "10.0.0.7",
      ),
    );
    expect(blocked.status).toBe(429);
  });

  it("stops verifying once the locked-account compare budget is spent", async () => {
    vi.stubEnv("LOGIN_VERIFY_BUDGET", "2");
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    // Lock the ACCOUNT with three wrong attempts, each from a distinct
    // IP so no per-IP lock interferes.
    for (let i = 0; i < 3; i++) {
      const res = await POST(
        makeLoginRequest(
          { email: "locked@example.com", password: "wrong" },
          `10.0.2.${i + 1}`,
        ),
      );
      expect(res.status).toBe(401);
    }
    expect(vi.mocked(verifyCredentials)).toHaveBeenCalledTimes(3);

    // The account lock is now active. The next two wrong attempts fit
    // the compare budget (the verification cost is still paid) and are
    // answered 429 from the pre-recorded account lock.
    for (let i = 3; i < 5; i++) {
      const res = await POST(
        makeLoginRequest(
          { email: "locked@example.com", password: "wrong" },
          `10.0.2.${i + 1}`,
        ),
      );
      expect(res.status).toBe(429);
    }
    expect(vi.mocked(verifyCredentials)).toHaveBeenCalledTimes(5);

    // Budget spent: further attempts are cheap 429s that never reach
    // the bcrypt sink.
    const cheap = await POST(
      makeLoginRequest(
        { email: "locked@example.com", password: "wrong" },
        "10.0.2.99",
      ),
    );
    expect(cheap.status).toBe(429);
    expect(cheap.headers.get("Retry-After")).not.toBeNull();
    expect(vi.mocked(verifyCredentials)).toHaveBeenCalledTimes(5);
  });

  it("advances the source IP toward its own lockout on wrong attempts against an account-locked account", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    // Lock the account via three distinct source IPs.
    for (let i = 0; i < 3; i++) {
      await POST(
        makeLoginRequest(
          { email: "victim2@example.com", password: "wrong" },
          `10.0.3.${i + 1}`,
        ),
      );
    }
    // One source IP now hammers the locked account. Each attempt is
    // answered 429 (account lock) AND records an IP failure, so after
    // the threshold the source IP locks out too — proven by a request
    // from the same IP against a DIFFERENT account being refused
    // pre-verify.
    for (let i = 0; i < 3; i++) {
      const res = await POST(
        makeLoginRequest(
          { email: "victim2@example.com", password: "wrong" },
          "10.0.3.50",
        ),
      );
      expect(res.status).toBe(429);
    }
    const callsBefore = vi.mocked(verifyCredentials).mock.calls.length;
    const bystander = await POST(
      makeLoginRequest(
        { email: "bystander@example.com", password: "wrong" },
        "10.0.3.50",
      ),
    );
    expect(bystander.status).toBe(429);
    expect(vi.mocked(verifyCredentials)).toHaveBeenCalledTimes(callsBefore);
  });

  it("allows the correct password through an attacker-triggered account lock", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    for (let i = 0; i < 3; i += 1) {
      const res = await POST(
        makeLoginRequest(
          { email: "victim@example.com", password: "wrong" },
          `10.0.1.${i + 1}`,
        ),
      );
      expect(res.status).toBe(401);
    }

    vi.mocked(verifyCredentials).mockResolvedValue({
      user: {
        id: 2,
        email: "victim@example.com",
        name: "Victim",
        role: "viewer",
        must_change_password: false,
      },
      credentialVersion: 202,
      passwordHash: "$2a$10$test-victim",
    });
    const recovered = await POST(
      makeLoginRequest(
        { email: "victim@example.com", password: "correct" },
        "10.0.1.99",
      ),
    );
    expect(recovered.status).toBe(200);

    vi.mocked(verifyCredentials).mockResolvedValue(null);
    const after = await POST(
      makeLoginRequest(
        { email: "victim@example.com", password: "wrong" },
        "10.0.1.100",
      ),
    );
    expect(after.status).toBe(401);
    expect(after.headers.get("Retry-After")).toBeNull();
  });

  it("binds the saved session to the credential version that bcrypt verified", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue({
      user: {
        id: 3,
        email: "versioned@example.com",
        name: "Versioned",
        role: "admin",
        must_change_password: false,
      },
      credentialVersion: 417,
      passwordHash: "$2a$10$test-versioned",
    });

    const res = await POST(
      makeLoginRequest(
        { email: "versioned@example.com", password: "correct" },
        "10.0.2.1",
      ),
    );

    expect(res.status).toBe(200);
    expect(sessionState.credentialVersion).toBe(417);
  });

  it("rejects an oversized password with 400 before any credential work (S004-C1)", async () => {
    const res = await POST(
      makeLoginRequest(
        { email: "user@example.com", password: "x".repeat(257) },
        "10.0.3.1",
      ),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Please provide a valid email and password.",
    });
    // The schema rejects before the throttle accounting and before the
    // bcrypt encode path that made megabyte-scale passwords expensive.
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("refuses an oversized body with 413 before any credential work (S004-C1 body axis)", async () => {
    const res = await POST(
      new NextRequest(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
            "x-forwarded-for": "10.0.4.1",
            "content-length": String(CREDENTIAL_BODY_MAX_BYTES + 1),
          },
          body: JSON.stringify({ email: "user@example.com", password: "x" }),
        }),
      ),
    );

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      error: "Request body too large.",
    });
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("refuses a locked-out source IP with 429 before parsing the body (S004-C1 body axis)", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    const ip = "10.0.5.1";
    // Distinct accounts per attempt so only the source-IP axis can lock.
    for (let i = 0; i < 3; i += 1) {
      const res = await POST(
        makeLoginRequest(
          { email: `target${i}@example.com`, password: "wrong-password" },
          ip,
        ),
      );
      expect(res.status).toBe(401);
    }

    // The follow-up request is both malformed AND over the byte cap: the
    // pre-parse lockout refusal must win over the 400/413 body outcomes.
    const res = await POST(
      new NextRequest(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
            "x-forwarded-for": ip,
            "content-length": String(CREDENTIAL_BODY_MAX_BYTES + 1),
          },
          body: "not json",
        }),
      ),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    expect(verifyCredentials).toHaveBeenCalledTimes(3);
  });
});
