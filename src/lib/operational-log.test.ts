import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logReadinessFailure,
  logUnexpectedServerError,
} from "./operational-log";
import { logStartupFailure } from "../../scripts/operational-log.mjs";

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
    expect(JSON.parse(serialized)).toMatchObject({
      event: "unexpected_server_error",
      method: "UNKNOWN",
      route: "/api/strategy/export",
      route_type: "unknown",
      render_source: "unknown",
    });
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
