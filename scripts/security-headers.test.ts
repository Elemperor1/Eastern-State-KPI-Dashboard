import { describe, expect, it } from "vitest";

interface SecurityHeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

interface NextConfigUnderTest {
  poweredByHeader?: boolean;
  headers?: () => Promise<SecurityHeaderRule[]>;
}

/** Implements the load next config operation. */
async function loadNextConfig(): Promise<NextConfigUnderTest> {
  const mod = (await import("../next.config.mjs")) as {
    default: NextConfigUnderTest;
  };
  return mod.default;
}

describe("next.config security headers (S045-C1)", () => {
  it("drops X-Powered-By and applies the baseline header set to every route", async () => {
    const config = await loadNextConfig();

    expect(config.poweredByHeader).toBe(false);
    expect(config.headers).toBeTypeOf("function");

    const rules = (await config.headers!()) as SecurityHeaderRule[];
    const catchAll = rules.find((rule) => rule.source === "/(.*)");
    expect(catchAll, "a catch-all security header rule").toBeDefined();

    const byKey = new Map(
      catchAll!.headers.map((h) => [h.key.toLowerCase(), h.value]),
    );
    expect(byKey.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(byKey.get("x-frame-options")).toBe("DENY");
    expect(byKey.get("x-content-type-options")).toBe("nosniff");
    expect(byKey.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(byKey.get("strict-transport-security")).toMatch(/^max-age=\d+/);
  });
});
