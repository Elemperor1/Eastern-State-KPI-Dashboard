import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, readCsrfToken, readJsonObject } from "./api-client";

describe("readJsonObject", () => {
  it("returns a parsed object without exposing an any-typed payload", async () => {
    const response = Response.json({ error: "Invalid request" });

    await expect(readJsonObject(response)).resolves.toEqual({
      error: "Invalid request",
    });
  });

  it.each([null, [], "text", 42])(
    "rejects non-object JSON payload %j",
    async (payload) => {
      const response = Response.json(payload);
      await expect(readJsonObject(response)).resolves.toEqual({});
    },
  );

  it("returns an empty object for malformed JSON", async () => {
    const response = new Response("not-json", {
      headers: { "content-type": "application/json" },
    });

    await expect(readJsonObject(response)).resolves.toEqual({});
  });
});

describe("readCsrfToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null outside a browser document", () => {
    expect(readCsrfToken()).toBeNull();
  });

  it("decodes a stored token value", () => {
    vi.stubGlobal("document", {
      cookie: "other=1; eastern_state_kpi_csrf=tok%20en-123",
    } as unknown as Document);

    expect(readCsrfToken()).toBe("tok en-123");
  });

  it("treats a malformed percent-encoded value as absent instead of throwing (S086-C1)", () => {
    vi.stubGlobal("document", {
      cookie: "eastern_state_kpi_csrf=%E0%A4%A",
    } as unknown as Document);

    expect(readCsrfToken()).toBeNull();
  });
});

/**
 * D8AD-CAN-004 client wiring (S063-C1): the double-submit CSRF control
 * depends on apiFetch echoing the `eastern_state_kpi_csrf` cookie in the
 * `X-CSRF-Token` header with an exact JSON content type, bootstrapping
 * the cookie through /api/auth/me when it is absent, and never
 * bootstrapping on plain reads. A regression in any of these silently
 * turns every legitimate mutation into a generic 403, so each behavior
 * is pinned here.
 */
describe("apiFetch CSRF wiring (S063-C1)", () => {
  /** Current document.cookie value backing the stubbed document. */
  let cookieValue: string;
  /** Recorded fetch calls as (input, init) pairs. */
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cookieValue = "";
    vi.stubGlobal("document", {
      /** Current cookie jar contents, as the browser would serialize them. */
      get cookie() {
        return cookieValue;
      },
    });
    // ensureCsrfToken only bootstraps when a window exists (browser).
    vi.stubGlobal("window", {});
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/auth/me") {
        // Simulate the server issuing the double-submit cookie in
        // response to the bootstrap read.
        cookieValue = "eastern_state_kpi_csrf=bootstrapped-token";
      }
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Headers captured for the last fetch call as a plain lookup. */
  function lastCallHeaders(): Headers {
    const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    return init.headers as Headers;
  }

  /** Inputs of every recorded fetch call, in order. */
  function calledInputs(): string[] {
    return fetchMock.mock.calls.map((call) => String(call[0]));
  }

  it("echoes the decoded cookie value in X-CSRF-Token on a mutation", async () => {
    cookieValue = "other=1; eastern_state_kpi_csrf=tok%20en-123";

    const res = await apiFetch("/api/strategy/observations", {
      method: "POST",
      body: { kpi_id: 1, value: 2 },
    });

    expect(res.status).toBe(200);
    // The cookie was already present, so no bootstrap fetch happens.
    expect(calledInputs()).toEqual(["/api/strategy/observations"]);
    const headers = lastCallHeaders();
    expect(headers.get("x-csrf-token")).toBe("tok en-123");
    expect(headers.get("content-type")).toBe("application/json");
    const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ kpi_id: 1, value: 2 }));
    expect(init.credentials).toBe("same-origin");
  });

  it("bootstraps the cookie through /api/auth/me when it is missing, then retries with the header", async () => {
    cookieValue = "";

    await apiFetch("/api/users", {
      method: "POST",
      body: { name: "Viewer" },
    });

    // First call is the bootstrap read; the mutation follows once the
    // cookie has been issued.
    expect(calledInputs()).toEqual(["/api/auth/me", "/api/users"]);
    const bootstrapInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(bootstrapInit.method).toBe("GET");
    expect(bootstrapInit.cache).toBe("no-store");
    expect(bootstrapInit.credentials).toBe("same-origin");
    expect(lastCallHeaders().get("x-csrf-token")).toBe("bootstrapped-token");
  });

  it("sends no CSRF header when the cookie is absent and the bootstrap issues none", async () => {
    cookieValue = "";
    fetchMock.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await apiFetch("/api/users", { method: "DELETE", body: { id: 3 } });

    expect(calledInputs()).toEqual(["/api/auth/me", "/api/users"]);
    expect(lastCallHeaders().get("x-csrf-token")).toBeNull();
  });

  it("never bootstraps /api/auth/me for a plain GET, even without a cookie", async () => {
    cookieValue = "";

    await apiFetch("/api/strategy/export?year=2029");

    expect(calledInputs()).toEqual(["/api/strategy/export?year=2029"]);
    expect(lastCallHeaders().get("x-csrf-token")).toBeNull();
  });

  it("still echoes the cookie on a GET when one is present (no bootstrap)", async () => {
    cookieValue = "eastern_state_kpi_csrf=get-token";

    await apiFetch("/api/auth/me");

    expect(calledInputs()).toEqual(["/api/auth/me"]);
    expect(lastCallHeaders().get("x-csrf-token")).toBe("get-token");
  });

  it("treats a malformed percent-encoded cookie as absent and bootstraps a fresh one (S086-C1)", async () => {
    cookieValue = "eastern_state_kpi_csrf=%E0%A4%A";

    await apiFetch("/api/kpis", { method: "PATCH", body: { id: 1 } });

    // The malformed value must not be echoed; the bootstrap path
    // replaces it with the freshly issued token.
    expect(calledInputs()).toEqual(["/api/auth/me", "/api/kpis"]);
    expect(lastCallHeaders().get("x-csrf-token")).toBe("bootstrapped-token");
  });

  it("preserves a caller-provided content type and string body", async () => {
    cookieValue = "eastern_state_kpi_csrf=csv-token";

    await apiFetch("/api/strategy/observations", {
      method: "POST",
      headers: { "content-type": "application/vnd.custom+json" },
      body: "{\"raw\":true}",
    });

    const headers = lastCallHeaders();
    expect(headers.get("content-type")).toBe("application/vnd.custom+json");
    expect(headers.get("x-csrf-token")).toBe("csv-token");
    const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect(init.body).toBe("{\"raw\":true}");
  });
});
