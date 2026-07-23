import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkReadiness, logReadinessFailure } = vi.hoisted(() => ({
  checkReadiness: vi.fn(),
  logReadinessFailure: vi.fn(),
}));

vi.mock("@/features/health/readiness", () => ({ checkReadiness }));
vi.mock("@/lib/operational-log", () => ({ logReadinessFailure }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health/ready", () => {
  it("returns only a minimal ready response without authentication", async () => {
    checkReadiness.mockReturnValue({ ready: true });

    const response = GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toBe('{"status":"ready"}');
    expect(body).not.toMatch(
      /account|auth_disabled|cookie|credential|database|path|plan|row|schema|secret|session|stack/i,
    );
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(logReadinessFailure).not.toHaveBeenCalled();
  });

  it.each([
    "database_missing",
    "database_unavailable",
    "database_incompatible",
    "migration_in_progress",
    "initialization_incomplete",
  ])("returns the same privacy-safe 503 body for %s", async (reason) => {
    checkReadiness.mockReturnValue({ ready: false, reason });

    const response = GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"status":"unavailable"}');
    expect(body).not.toContain(reason);
    expect(body).not.toMatch(
      /account|auth_disabled|cookie|credential|database|path|plan|row|schema|secret|session|stack/i,
    );
    expect(logReadinessFailure).toHaveBeenCalledWith(reason);
  });
});
