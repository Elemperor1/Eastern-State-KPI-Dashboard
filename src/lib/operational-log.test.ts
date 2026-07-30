import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logReadinessFailure,
  logUnexpectedServerError,
} from "./operational-log";
import { logStartupFailure } from "./operational-log-core.mjs";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("operational logging", () => {
  it("emits a structured readiness event with only a bounded reason code", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    logReadinessFailure("database_unavailable");

    expect(consoleError).toHaveBeenCalledOnce();
    const record = JSON.parse(String(consoleError.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >;
    expect(record).toMatchObject({
      level: "error",
      service: "eastern-state-kpi",
      event: "readiness_failure",
      reason: "database_unavailable",
    });
    expect(Object.keys(record).sort()).toEqual(
      ["event", "level", "reason", "service", "timestamp"].sort(),
    );
  });

  it("drops query strings and unrecognized server-error metadata", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    logUnexpectedServerError({
      method: "CUSTOM",
      route: "/api/strategy/export?token=do-not-log",
      routeType: "custom",
      renderSource: "custom",
    });

    const serialized = String(consoleError.mock.calls[0]?.[0]);
    expect(serialized).not.toContain("do-not-log");
    // S088-C1 (R-08): a field carrying exception text, a stack, request
    // headers, cookies, or user context must never appear on this record.
    expect(serialized).not.toMatch(/stack|headers|cookie|message|secret/i);
    const record = JSON.parse(serialized) as Record<string, unknown>;
    expect(record).toMatchObject({
      event: "unexpected_server_error",
      method: "UNKNOWN",
      route: "/api/strategy/export",
      route_type: "unknown",
      render_source: "unknown",
    });
    // Pin the exact key set (mirroring the readiness_failure assertion
    // above) so a future field addition cannot silently leak request
    // detail into the log stream.
    expect(Object.keys(record).sort()).toEqual(
      [
        "event",
        "level",
        "method",
        "route",
        "route_type",
        "render_source",
        "service",
        "timestamp",
      ].sort(),
    );
  });

  it("redacts unsafe route templates on the server-error record", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const unsafeRoutes = [
      "/api/strategy/export with spaces",
      "/api/strategy/export\twith-tab",
      "/api/strategy/export\ncookie: session=abc",
      "not-a-route",
      "",
    ];
    for (const route of unsafeRoutes) {
      consoleError.mockClear();
      logUnexpectedServerError({
        method: "GET",
        route,
        routeType: "route",
      });
      const serialized = String(consoleError.mock.calls[0]?.[0]);
      expect(serialized).not.toContain("session=abc");
      expect(JSON.parse(serialized)).toMatchObject({ route: "unknown" });
    }
  });

  it("emits startup failures with only bounded fields", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    logStartupFailure("database_unavailable", 1);

    const serialized = String(consoleError.mock.calls[0]?.[0]);
    expect(serialized).not.toMatch(/path|stack|secret|sqlite/i);
    expect(JSON.parse(serialized)).toMatchObject({
      event: "startup_failure",
      reason: "database_unavailable",
      exit_code: 1,
    });
  });
});
