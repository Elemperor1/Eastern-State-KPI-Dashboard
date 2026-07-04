import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `auth-flag` reads NODE_ENV + AUTH_DISABLED + BIND_HOST at module load.
 * Each test case stubs the relevant env vars first, then uses
 * `vi.resetModules()` + dynamic import to re-execute the module
 * top-level code under the new environment.
 *
 * Covers D8AD-CAN-002 hardening: production/test fail-closed,
 * development loopback-only bypass, non-loopback refusal, malformed
 * env values, proxy/Host-header edge cases, and the local-dev warning.
 */
describe("auth-flag", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load() {
    return import("./auth-flag");
  }

  describe("fail-closed in production and test (req 1, 5)", () => {
    it("is false in production when AUTH_DISABLED is unset", async () => {
      vi.stubEnv("AUTH_DISABLED", "");
      vi.stubEnv("NODE_ENV", "production");
      const { AUTH_DISABLED } = await load();
      expect(AUTH_DISABLED).toBe(false);
    });

    it("throws at module load when AUTH_DISABLED=true and NODE_ENV=production", async () => {
      vi.stubEnv("AUTH_DISABLED", "true");
      vi.stubEnv("NODE_ENV", "production");
      await expect(load()).rejects.toThrow(
        /AUTH_DISABLED is set in NODE_ENV=production/,
      );
    });

    it("throws at module load when AUTH_DISABLED=true and NODE_ENV=test", async () => {
      vi.stubEnv("AUTH_DISABLED", "true");
      vi.stubEnv("NODE_ENV", "test");
      await expect(load()).rejects.toThrow(/AUTH_DISABLED is set in NODE_ENV=test/);
    });

    it("throws for any non-falsy AUTH_DISABLED value in production", async () => {
      for (const value of ["1", "yes", "TRUE", "on"]) {
        vi.unstubAllEnvs();
        vi.resetModules();
        vi.stubEnv("AUTH_DISABLED", value);
        vi.stubEnv("NODE_ENV", "production");
        await expect(load()).rejects.toThrow(
          /AUTH_DISABLED is set in NODE_ENV=production/,
        );
      }
    });

    it("is false in production even with a loopback BIND_HOST (build-time inlining is the real guard)", async () => {
      // A production runtime with AUTH_DISABLED unset is always off,
      // regardless of bind. (A production build with AUTH_DISABLED SET
      // throws above; process.env.NODE_ENV inlining dead-strips it.)
      vi.stubEnv("AUTH_DISABLED", "");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("BIND_HOST", "127.0.0.1");
      const { AUTH_DISABLED } = await load();
      expect(AUTH_DISABLED).toBe(false);
    });
  });

  describe("malformed AUTH_DISABLED values (req 7)", () => {
    it("treats whitespace-only AUTH_DISABLED as unset (no throw in production)", async () => {
      for (const value of [" ", "  ", "\t"]) {
        vi.unstubAllEnvs();
        vi.resetModules();
        vi.stubEnv("AUTH_DISABLED", value);
        vi.stubEnv("NODE_ENV", "production");
        const { AUTH_DISABLED } = await load();
        expect(AUTH_DISABLED).toBe(false);
      }
    });

    it("treats common falsey strings as unset (no throw in production)", async () => {
      for (const value of ["false", "0", "off", "no", "FALSE", "Off"]) {
        vi.unstubAllEnvs();
        vi.resetModules();
        vi.stubEnv("AUTH_DISABLED", value);
        vi.stubEnv("NODE_ENV", "production");
        const { AUTH_DISABLED } = await load();
        expect(AUTH_DISABLED).toBe(false);
      }
    });
  });

  describe("development loopback bypass (req 2)", () => {
    it("is true in development when AUTH_DISABLED=true and bound to 127.0.0.1", async () => {
      vi.stubEnv("AUTH_DISABLED", "true");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "127.0.0.1");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { AUTH_DISABLED } = await load();
      expect(AUTH_DISABLED).toBe(true);
      expect(warn).toHaveBeenCalled();
      const msg = warn.mock.calls[0][0] as string;
      expect(msg).toMatch(/AUTH_DISABLED IS ON/);
      expect(msg).toMatch(/127\.0\.0\.1/);
      // No secrets leaked in the warning.
      expect(msg).not.toMatch(/SESSION_SECRET|password/i);
      warn.mockRestore();
    });

    it("accepts ::1 and localhost as loopback binds", async () => {
      for (const host of ["::1", "localhost", "LOCALHOST", " 127.0.0.1 "]) {
        vi.unstubAllEnvs();
        vi.resetModules();
        vi.stubEnv("AUTH_DISABLED", "true");
        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("BIND_HOST", host);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { AUTH_DISABLED } = await load();
        expect(AUTH_DISABLED).toBe(true);
        warn.mockRestore();
      }
    });

    it("is false by default in development (AUTH_DISABLED unset, no bypass)", async () => {
      vi.stubEnv("AUTH_DISABLED", "");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "0.0.0.0");
      const { AUTH_DISABLED } = await load();
      expect(AUTH_DISABLED).toBe(false);
    });

    it("does not warn when the bypass is off", async () => {
      vi.stubEnv("AUTH_DISABLED", "false");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "127.0.0.1");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await load();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe("non-loopback bind refusal (req 3)", () => {
    it("throws when AUTH_DISABLED=true and BIND_HOST=0.0.0.0", async () => {
      vi.stubEnv("AUTH_DISABLED", "true");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "0.0.0.0");
      await expect(load()).rejects.toThrow(/bind is not loopback/);
    });

    it("throws when AUTH_DISABLED=true and BIND_HOST is a LAN IP", async () => {
      vi.stubEnv("AUTH_DISABLED", "true");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "192.168.1.50");
      await expect(load()).rejects.toThrow(/bind is not loopback/);
    });

    it("throws when AUTH_DISABLED=true and BIND_HOST is unset", async () => {
      vi.stubEnv("AUTH_DISABLED", "true");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "");
      await expect(load()).rejects.toThrow(/bind is not loopback/);
    });

    it("allows a non-loopback bind when the bypass is OFF", async () => {
      // No bypass = no risk: dev may bind 0.0.0.0 for LAN device testing.
      vi.stubEnv("AUTH_DISABLED", "false");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "0.0.0.0");
      const { AUTH_DISABLED } = await load();
      expect(AUTH_DISABLED).toBe(false);
    });
  });

  describe("proxy / Host-header edge cases (req 4)", () => {
    it("does not trust a spoofed Host-like env var to enable a non-loopback bypass", async () => {
      // A spoofed Host header (here simulated as a HOST env leak) must
      // NOT override the BIND_HOST enforcement. BIND_HOST=0.0.0.0 with
      // a claimed Host=127.0.0.1 still refuses.
      vi.stubEnv("AUTH_DISABLED", "true");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "0.0.0.0");
      vi.stubEnv("HOST", "127.0.0.1");
      vi.stubEnv("HTTP_HOST", "localhost");
      await expect(load()).rejects.toThrow(/bind is not loopback/);
    });

    it("does not trust X-Forwarded-For to enable a non-loopback bypass", async () => {
      vi.stubEnv("AUTH_DISABLED", "true");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "10.0.0.5");
      vi.stubEnv("X_FORWARDED_FOR", "127.0.0.1");
      vi.stubEnv("X_FORWARDED_HOST", "localhost");
      await expect(load()).rejects.toThrow(/bind is not loopback/);
    });

    it("the bypass is a module-load constant, not a per-request header decision", async () => {
      // Even with a loopback bind, spoofed headers cannot broaden the
      // bypass beyond its already-loopbound scope.
      vi.stubEnv("AUTH_DISABLED", "true");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "127.0.0.1");
      vi.stubEnv("X_FORWARDED_FOR", "203.0.113.7");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { AUTH_DISABLED } = await load();
      expect(AUTH_DISABLED).toBe(true); // loopback only, headers ignored
      warn.mockRestore();
    });
  });

  describe("warning secrecy (req 6)", () => {
    it("the startup warning never echoes env secrets", async () => {
      vi.stubEnv("AUTH_DISABLED", "true");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "127.0.0.1");
      // Place secret-looking values in the env to prove they are NOT
      // surfaced by the warning.
      vi.stubEnv("SESSION_SECRET", "ultra-secret-value-never-to-leak");
      vi.stubEnv("BOOTSTRAP_ADMIN_PASSWORD", "plaintext-password-leak");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await load();
      expect(warn).toHaveBeenCalled();
      const text = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(text).not.toContain("ultra-secret-value-never-to-leak");
      expect(text).not.toContain("plaintext-password-leak");
      expect(text).toMatch(/AUTH_DISABLED IS ON/);
      warn.mockRestore();
    });

    it("throw messages do not contain env secrets", async () => {
      vi.stubEnv("AUTH_DISABLED", "true");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BIND_HOST", "0.0.0.0");
      vi.stubEnv("SESSION_SECRET", "ultra-secret-value-never-to-leak");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      let caught: unknown;
      try {
        await load();
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      const msg = String((caught as Error).message);
      expect(msg).toMatch(/bind is not loopback[\s\S]*BIND_HOST=/);
      // The throw message only carries the (public) BIND_HOST value,
      // never the session secret.
      expect(msg).not.toContain("ultra-secret-value-never-to-leak");
      warn.mockRestore();
    });
  });
});