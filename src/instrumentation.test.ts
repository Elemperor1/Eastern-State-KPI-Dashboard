import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "./instrumentation";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server error instrumentation", () => {
  it("does not serialize the exception, request URL, headers, or session data", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await onRequestError(
      new Error("database path /private/secret.db"),
      {
        path: "/reports?credential=do-not-log",
        method: "GET",
        headers: {
          cookie: "session=do-not-log",
          authorization: "Bearer do-not-log",
        },
      },
      {
        routerKind: "App Router",
        routePath: "/app/reports/page",
        routeType: "render",
        renderSource: "server-rendering",
        revalidateReason: undefined,
      },
    );

    expect(consoleError).toHaveBeenCalledOnce();
    const serialized = String(consoleError.mock.calls[0]?.[0]);
    expect(serialized).not.toMatch(
      /authorization|bearer|cookie|credential|do-not-log|private|secret\.db|session=|stack/i,
    );
    expect(JSON.parse(serialized)).toMatchObject({
      event: "unexpected_server_error",
      method: "GET",
      route: "/app/reports/page",
      route_type: "render",
      render_source: "server-rendering",
    });
  });
});
