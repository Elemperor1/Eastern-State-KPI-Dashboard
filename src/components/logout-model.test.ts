import { describe, expect, it, vi } from "vitest";
import { logoutRequest } from "./logout-model";

/** Supports the stub fetch test scenario. */
function stubFetch(impl: () => Promise<Response>): typeof fetch {
  return vi.fn(impl) as unknown as typeof fetch;
}

describe("logoutRequest (S073-C1)", () => {
  it("reports success only when the server confirms the logout", async () => {
    const fetchImpl = stubFetch(async () => new Response(null, { status: 200 }));

    await expect(logoutRequest(fetchImpl)).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });

  it.each([401, 500])(
    "reports an HTTP %i failure so the UI does not navigate away",
    async (status) => {
      const fetchImpl = stubFetch(async () => new Response(null, { status }));

      await expect(logoutRequest(fetchImpl)).resolves.toEqual({
        ok: false,
        reason: "http",
        status,
      });
    },
  );

  it("reports a network failure instead of throwing", async () => {
    const fetchImpl = stubFetch(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(logoutRequest(fetchImpl)).resolves.toEqual({
      ok: false,
      reason: "network",
    });
  });
});
