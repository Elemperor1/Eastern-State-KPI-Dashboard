import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `auth-flag` reads NODE_ENV + AUTH_DISABLED at module load. Each test case
 * stubs both env vars first, then uses `vi.resetModules()` + dynamic import
 * to re-execute the module top-level code under the new environment.
 */
describe("auth-flag", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is false by default (AUTH_DISABLED unset)", async () => {
    vi.stubEnv("AUTH_DISABLED", "");
    vi.stubEnv("NODE_ENV", "development");
    const { AUTH_DISABLED } = await import("./auth-flag");
    expect(AUTH_DISABLED).toBe(false);
  });

  it("is true in development when AUTH_DISABLED=true", async () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("NODE_ENV", "development");
    const { AUTH_DISABLED } = await import("./auth-flag");
    expect(AUTH_DISABLED).toBe(true);
  });

  it("is false in production when AUTH_DISABLED is unset", async () => {
    vi.stubEnv("AUTH_DISABLED", "");
    vi.stubEnv("NODE_ENV", "production");
    const { AUTH_DISABLED } = await import("./auth-flag");
    expect(AUTH_DISABLED).toBe(false);
  });

  it("throws at module load when AUTH_DISABLED=true and NODE_ENV=production", async () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("./auth-flag")).rejects.toThrow(
      /AUTH_DISABLED is set in NODE_ENV=production/,
    );
  });

  it("throws at module load when AUTH_DISABLED=true and NODE_ENV=test", async () => {
    // Vitest runs with NODE_ENV=test by default, so this guards the
    // "running unit tests against a bypassed env" footgun.
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("NODE_ENV", "test");
    await expect(import("./auth-flag")).rejects.toThrow(
      /AUTH_DISABLED is set in NODE_ENV=test/,
    );
  });

  it("throws for any non-falsy AUTH_DISABLED value in production", async () => {
    // The strict parser must catch the common misconfigurations
    // ("1", "yes", the literal string "TRUE" with different casing)
    // — any of these would otherwise silently disable the guard.
    for (const value of ["1", "yes", "TRUE", "on"]) {
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.stubEnv("AUTH_DISABLED", value);
      vi.stubEnv("NODE_ENV", "production");
      await expect(import("./auth-flag")).rejects.toThrow(
        /AUTH_DISABLED is set in NODE_ENV=production/,
      );
    }
  });

  it("treats whitespace-only AUTH_DISABLED as unset (no throw in production)", async () => {
    // A single space or tab in a config is almost certainly a mistake.
    // Treat whitespace-only as "not set" rather than triggering the guard
    // so the operator gets a normal startup with bypass off instead of
    // a confusing module-load crash.
    for (const value of [" ", "  ", "\t"]) {
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.stubEnv("AUTH_DISABLED", value);
      vi.stubEnv("NODE_ENV", "production");
      const { AUTH_DISABLED } = await import("./auth-flag");
      expect(AUTH_DISABLED).toBe(false);
    }
  });

  it("treats common falsey strings as unset (no throw in production)", async () => {
    for (const value of ["false", "0", "off", "no", "FALSE"]) {
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.stubEnv("AUTH_DISABLED", value);
      vi.stubEnv("NODE_ENV", "production");
      // Should load without throwing — these values are explicitly
      // recognized as "the bypass is not wanted".
      const { AUTH_DISABLED } = await import("./auth-flag");
      expect(AUTH_DISABLED).toBe(false);
    }
  });
});
