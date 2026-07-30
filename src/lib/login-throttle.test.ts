import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetForTests,
  _storeSizeForTests,
  clearFailures,
  lockedMsRemaining,
  pruneExpired,
  recordFailure,
  throttleConfig,
  verifyBudgetAllows,
} from "./login-throttle";

describe("login-throttle", () => {
  beforeEach(() => {
    _resetForTests();
    // Pin a deterministic config: 3 failures inside 1 second, 2-second
    // lockout. Small numbers keep the math easy to read.
    vi.stubEnv("LOGIN_LOCKOUT_THRESHOLD", "3");
    vi.stubEnv("LOGIN_LOCKOUT_WINDOW_MS", "1000");
    vi.stubEnv("LOGIN_LOCKOUT_DURATION_MS", "2000");
    vi.stubEnv("LOGIN_THROTTLE_MAX_ENTRIES", "256");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the default config when no env vars are set", () => {
    vi.unstubAllEnvs();
    const cfg = throttleConfig();
    expect(cfg.threshold).toBeGreaterThanOrEqual(5);
    expect(cfg.windowMs).toBeGreaterThan(0);
    expect(cfg.lockoutMs).toBeGreaterThan(0);
    expect(cfg.verifyBudget).toBeGreaterThanOrEqual(1);
  });

  it("admits only the configured compare budget per lockout window", () => {
    vi.stubEnv("LOGIN_VERIFY_BUDGET", "2");
    const t0 = 1_000_000;
    const firstLock = t0 + 2000;
    expect(verifyBudgetAllows("cmpl:a@example.org", firstLock, t0)).toBe(true);
    expect(verifyBudgetAllows("cmpl:a@example.org", firstLock, t0 + 10)).toBe(true);
    expect(verifyBudgetAllows("cmpl:a@example.org", firstLock, t0 + 20)).toBe(false);
    // Still spent moments later; the window tracks the lockout duration.
    expect(verifyBudgetAllows("cmpl:a@example.org", firstLock, t0 + 30)).toBe(false);
    // A different identity has its own budget.
    expect(verifyBudgetAllows("cmpl:b@example.org", firstLock, t0 + 30)).toBe(true);
    // A later lockout epoch gets a fresh budget.
    expect(verifyBudgetAllows("cmpl:a@example.org", t0 + 4100, t0 + 2100)).toBe(true);
  });

  it("clearFailures also resets a spent compare budget", () => {
    vi.stubEnv("LOGIN_VERIFY_BUDGET", "1");
    const t0 = 1_000_000;
    const lockoutUntil = t0 + 2000;
    expect(verifyBudgetAllows("cmpl:a@example.org", lockoutUntil, t0)).toBe(true);
    expect(verifyBudgetAllows("cmpl:a@example.org", lockoutUntil, t0 + 10)).toBe(false);
    clearFailures("cmpl:a@example.org");
    expect(verifyBudgetAllows("cmpl:a@example.org", lockoutUntil, t0 + 20)).toBe(true);
  });

  it("keeps a spent compare budget through ordinary-window pruning while its lockout window is active", () => {
    vi.stubEnv("LOGIN_VERIFY_BUDGET", "1");
    const t0 = 1_000_000;
    const key = "cmpl:prune-resistant@example.org";
    const lockoutUntil = t0 + 2000;

    expect(verifyBudgetAllows(key, lockoutUntil, t0)).toBe(true);
    expect(verifyBudgetAllows(key, lockoutUntil, t0 + 10)).toBe(false);

    // The ordinary failure window has elapsed, but the compare budget is
    // valid for the longer lockout-duration window.
    pruneExpired(t0 + 1500);
    expect(verifyBudgetAllows(key, lockoutUntil, t0 + 1510)).toBe(false);

    // The next lockout epoch receives a fresh budget.
    expect(verifyBudgetAllows(key, t0 + 4010, t0 + 2010)).toBe(true);
  });

  it("keeps a spent compare budget through attacker-controlled capacity flooding", () => {
    vi.stubEnv("LOGIN_VERIFY_BUDGET", "1");
    vi.stubEnv("LOGIN_THROTTLE_MAX_ENTRIES", "4");
    const t0 = 1_000_000;
    const key = "cmpl:flood-resistant@example.org";
    const lockoutUntil = t0 + 2000;

    expect(verifyBudgetAllows(key, lockoutUntil, t0)).toBe(true);
    expect(verifyBudgetAllows(key, lockoutUntil, t0 + 10)).toBe(false);

    for (let i = 0; i < 20; i += 1) {
      recordFailure(`acct:flood-${i}@example.org`, t0 + 20 + i);
    }

    expect(_storeSizeForTests()).toBeLessThanOrEqual(4);
    expect(verifyBudgetAllows(key, lockoutUntil, t0 + 100)).toBe(false);
  });

  it("opens a fresh compare budget when a late first attempt is followed by a new lockout epoch", () => {
    vi.stubEnv("LOGIN_VERIFY_BUDGET", "1");
    const t0 = 1_000_000;
    const key = "cmpl:relocked@example.org";

    // The first compare arrives just before the original account lock expires.
    const firstLockoutUntil = t0 + 2000;
    expect(verifyBudgetAllows(key, firstLockoutUntil, t0 + 1900)).toBe(true);
    expect(verifyBudgetAllows(key, firstLockoutUntil, t0 + 1950)).toBe(false);

    // A new failure epoch re-locks the account immediately after the old
    // lockout. Its compare budget must not inherit the previous epoch's spend.
    expect(verifyBudgetAllows(key, t0 + 4100, t0 + 2100)).toBe(true);
  });

  it("returns 0 for an unknown key", () => {
    expect(lockedMsRemaining("ip:never-seen")).toBe(0);
  });

  it("increments the failure counter and trips a lockout at the threshold", () => {
    const t0 = 1_000_000;
    expect(recordFailure("ip:1.2.3.4", t0)).toEqual({ failures: 1, lockedUntil: 0 });
    expect(recordFailure("ip:1.2.3.4", t0 + 10)).toEqual({
      failures: 2,
      lockedUntil: 0,
    });
    const third = recordFailure("ip:1.2.3.4", t0 + 20);
    expect(third.failures).toBe(3);
    expect(third.lockedUntil).toBe(t0 + 20 + 2000);
    // The lockout is active immediately.
    expect(lockedMsRemaining("ip:1.2.3.4", t0 + 20)).toBe(2000);
  });

  it("keeps the lockout active until the lockout duration elapses", () => {
    const t0 = 1_000_000;
    recordFailure("ip:1.2.3.4", t0);
    recordFailure("ip:1.2.3.4", t0 + 10);
    recordFailure("ip:1.2.3.4", t0 + 20);
    // Halfway through the lockout, still locked.
    expect(lockedMsRemaining("ip:1.2.3.4", t0 + 1020)).toBe(1000);
    // Right at expiry, returns 0.
    expect(lockedMsRemaining("ip:1.2.3.4", t0 + 20 + 2000)).toBe(0);
  });

  it("resets the counter when the window elapses, but preserves a still-active lockout", () => {
    const t0 = 1_000_000;
    recordFailure("ip:1.2.3.4", t0);
    recordFailure("ip:1.2.3.4", t0 + 10);
    // Two failures, no lockout yet.
    expect(lockedMsRemaining("ip:1.2.3.4", t0 + 10)).toBe(0);
    // Wait past the window. The counter is reset, but a fresh
    // failure starts a new window from scratch.
    const t1 = t0 + 1500;
    const fresh = recordFailure("ip:1.2.3.4", t1);
    expect(fresh.failures).toBe(1);
    expect(fresh.lockedUntil).toBe(0);
  });

  it("keeps a still-active lockout when the window would otherwise reset", () => {
    const t0 = 1_000_000;
    recordFailure("ip:1.2.3.4", t0);
    recordFailure("ip:1.2.3.4", t0 + 10);
    recordFailure("ip:1.2.3.4", t0 + 20); // triggers lockout at t0+20+2000
    // 1.5s later, the window (1s) has elapsed but the lockout (2s)
    // is still active. A new failure is recorded but should not
    // extend the lockout, clear it, or stack on the pre-window
    // counter (the window was reset).
    const during = recordFailure("ip:1.2.3.4", t0 + 1700);
    expect(during.failures).toBe(1);
    expect(during.lockedUntil).toBe(t0 + 20 + 2000);
  });

  it("clearFailures drops the entry so the next attempt is fresh", () => {
    const t0 = 1_000_000;
    recordFailure("ip:1.2.3.4", t0);
    recordFailure("ip:1.2.3.4", t0 + 10);
    clearFailures("ip:1.2.3.4");
    // After clear, the entry is gone — lockedMsRemaining returns 0.
    expect(lockedMsRemaining("ip:1.2.3.4", t0 + 20)).toBe(0);
    // A subsequent failure starts a new window with count 1.
    const next = recordFailure("ip:1.2.3.4", t0 + 20);
    expect(next.failures).toBe(1);
    expect(next.lockedUntil).toBe(0);
  });

  it("tracks per-IP and per-account keys independently", () => {
    const t0 = 1_000_000;
    // Two failures against IP 1, no failures against IP 2.
    recordFailure("ip:1.1.1.1", t0);
    recordFailure("ip:1.1.1.1", t0 + 10);
    // Trigger lockout on the account key, not the IP key.
    recordFailure("acct:a@x", t0);
    recordFailure("acct:a@x", t0 + 10);
    const acctLock = recordFailure("acct:a@x", t0 + 20);
    expect(acctLock.lockedUntil).toBeGreaterThan(0);
    // IP 2 is untouched.
    expect(lockedMsRemaining("ip:2.2.2.2", t0 + 20)).toBe(0);
    // IP 1 had two failures, no lockout.
    expect(lockedMsRemaining("ip:1.1.1.1", t0 + 20)).toBe(0);
    // The account is locked.
    expect(lockedMsRemaining("acct:a@x", t0 + 20)).toBeGreaterThan(0);
  });

  it("pruneExpired removes entries whose lockout and window have both elapsed", () => {
    const t0 = 1_000_000;
    // Acct A: lockout triggered, still active at the prune time.
    recordFailure("acct:a@x", t0);
    recordFailure("acct:a@x", t0 + 10);
    recordFailure("acct:a@x", t0 + 20);
    // Acct B: failures, no lockout, window will have elapsed.
    recordFailure("acct:b@x", t0);
    recordFailure("acct:b@x", t0 + 10);
    // Acct C: no activity.

    // Prune at a time when A is still locked (lockout ends at
    // t0+20+2000; we prune at t0+1500). B's window has elapsed
    // (window is 1s, last failure was at t0+10 = 1490ms ago). C
    // never existed.
    const pruneTime = t0 + 1500;
    pruneExpired(pruneTime);

    // A is still locked — prune should NOT remove it.
    expect(lockedMsRemaining("acct:a@x", pruneTime)).toBeGreaterThan(0);
    // B had two failures (no lockout) and the window has elapsed —
    // pruned.
    expect(lockedMsRemaining("acct:b@x", pruneTime)).toBe(0);
    // C never existed.
    expect(lockedMsRemaining("acct:c@x", pruneTime)).toBe(0);
  });

  it("keeps attacker-controlled throttle state within the configured cap", () => {
    vi.stubEnv("LOGIN_THROTTLE_MAX_ENTRIES", "4");
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i += 1) {
      recordFailure(`acct:user-${i}@example.com`, t0 + i);
    }
    expect(_storeSizeForTests()).toBeLessThanOrEqual(4);
  });

  it("preserves an active lockout while other identities flood the capacity", () => {
    vi.stubEnv("LOGIN_THROTTLE_MAX_ENTRIES", "4");
    const t0 = 1_000_000;
    const lockedKey = "acct:locked@example.com";
    recordFailure(lockedKey, t0);
    recordFailure(lockedKey, t0 + 10);
    recordFailure(lockedKey, t0 + 20);

    for (let i = 0; i < 20; i += 1) {
      recordFailure(`acct:flood-${i}@example.com`, t0 + 30 + i);
    }

    expect(_storeSizeForTests()).toBe(4);
    expect(lockedMsRemaining(lockedKey, t0 + 100)).toBe(1920);
  });

  it("bounds one request-path expiry sweep to a fixed batch", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 200; i += 1) {
      recordFailure(`acct:user-${i}@example.com`, t0);
    }

    const inspected = pruneExpired(t0 + 1500);

    expect(inspected).toBeLessThanOrEqual(64);
    expect(_storeSizeForTests()).toBe(136);
  });
});
