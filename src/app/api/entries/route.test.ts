/**
 * D8AD-CAN-006 hardening — route tests for the bounded, normalized
 * `year` filter on GET /api/entries.
 *
 * The route previously mapped every repeated `year` query param with
 * `Number()` and expanded the result into a dynamic SQL IN list with
 * no cap. These tests prove the new `parseYearFilters` chokepoint:
 *   - bounds the count (max / over-max),
 *   - parses strictly (malformed, negative, extremely large, mixed),
 *   - deduplicates deterministically (duplicate),
 *   - defines empty-input behavior (zero → no filter),
 *   - returns a controlled, non-sensitive 400 body, and
 *   - never invokes the repository query on a rejected request.
 *
 * Authorization is mocked to a fixed viewer so `requireSession` is not
 * the layer under test, and `listEntries` is mocked so we can both
 * assert call args (valid requests) and assert non-invocation
 * (rejected requests).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const VIEWER = {
  id: 2,
  email: "viewer@easternstate.org",
  name: "Viewer",
  role: "viewer" as const,
  must_change_password: false,
};

vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => VIEWER),
  authErrorResponse: (err: { status?: number }) => {
    const status = err?.status ?? 401;
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  },
  AuthError: class AuthError extends Error {
    constructor(message: string, public status: number) {
      super(message);
      this.name = "AuthError";
    }
  },
}));

// vi.mock factories are hoisted above imports, so the mock handle must
// be created with vi.hoisted to be referenceable inside the factory.
const { listEntriesMock } = vi.hoisted(() => ({ listEntriesMock: vi.fn() }));
vi.mock("@/lib/repository", () => ({
  listEntries: listEntriesMock,
  upsertEntry: vi.fn(() => ({ id: 1 })),
  deleteEntry: vi.fn(),
}));

import { GET } from "./route";
import {
  MAX_YEAR,
  MAX_YEAR_FILTERS,
  MIN_YEAR,
} from "@/lib/year-filter";

/** Build a GET /api/entries request with the given repeated `year`
 *  values (and no other query params). Values are URL-encoded so
 *  whitespace / signs are preserved exactly as a client would send. */
function req(years: string[] = []): NextRequest {
  const qs = years
    .map((y) => `year=${encodeURIComponent(y)}`)
    .join("&");
  const url = `http://localhost/api/entries${qs ? `?${qs}` : ""}`;
  return new NextRequest(url);
}

/** Distinct, in-range years starting at MIN_YEAR. */
function distinctYears(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(MIN_YEAR + i));
}

beforeEach(() => {
  listEntriesMock.mockReset();
  listEntriesMock.mockReturnValue([]);
});

describe("GET /api/entries year-filter hardening (D8AD-CAN-006)", () => {
  it("zero year params → 200, no `years` key in the repo filter", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(listEntriesMock).toHaveBeenCalledTimes(1);
    const filter = listEntriesMock.mock.calls[0][0];
    expect(filter).toBeDefined();
    expect(filter.years).toBeUndefined();
  });

  it("one valid year → 200, filter carries [year]", async () => {
    const res = await GET(req(["2024"]));
    expect(res.status).toBe(200);
    expect(listEntriesMock).toHaveBeenCalledTimes(1);
    expect(listEntriesMock.mock.calls[0][0].years).toEqual([2024]);
  });

  it("maximum accepted count → 200, deduped + sorted", async () => {
    const years = distinctYears(MAX_YEAR_FILTERS);
    const res = await GET(req(years));
    expect(res.status).toBe(200);
    expect(listEntriesMock).toHaveBeenCalledTimes(1);
    expect(listEntriesMock.mock.calls[0][0].years).toEqual(
      years.map(Number),
    );
    expect(listEntriesMock.mock.calls[0][0].years.length).toBe(
      MAX_YEAR_FILTERS,
    );
  });

  it("over-maximum count → 400, repository not invoked", async () => {
    const res = await GET(req(distinctYears(MAX_YEAR_FILTERS + 1)));
    expect(res.status).toBe(400);
    expect(listEntriesMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual({ error: "too_many_year_filters" });
    // Non-sensitive: the input is never echoed.
    expect(JSON.stringify(body)).not.toContain(String(MAX_YEAR + 1));
  });

  it("duplicates within the limit → 200, deduped + sorted", async () => {
    const res = await GET(req(["2024", "2023", "2024", "2023", "2025"]));
    expect(res.status).toBe(200);
    expect(listEntriesMock).toHaveBeenCalledTimes(1);
    // Deduped and ascending regardless of input order/repetition.
    expect(listEntriesMock.mock.calls[0][0].years).toEqual([
      2023, 2024, 2025,
    ]);
  });

  it("duplicates used to inflate past the limit → 400 (raw count gate)", async () => {
    // MAX_YEAR_FILTERS+1 raw params, all the same valid year.
    const res = await GET(req(Array(MAX_YEAR_FILTERS + 1).fill("2024")));
    expect(res.status).toBe(400);
    expect(listEntriesMock).not.toHaveBeenCalled();
    expect((await res.json()).error).toBe("too_many_year_filters");
  });

  it("malformed value → 400, repository not invoked", async () => {
    for (const bad of ["abc", "2024.5", "1e3", "0x7e8", "", " ", "20 24", "+2024"]) {
      listEntriesMock.mockReset();
      listEntriesMock.mockReturnValue([]);
      const res = await GET(req([bad]));
      expect(res.status).toBe(400);
      expect(listEntriesMock).not.toHaveBeenCalled();
      expect((await res.json()).error).toBe("invalid_year_filter");
    }
  });

  it("negative value → 400 (out of range), repository not invoked", async () => {
    for (const bad of ["-1", "-2024", "-999999"]) {
      listEntriesMock.mockReset();
      listEntriesMock.mockReturnValue([]);
      const res = await GET(req([bad]));
      expect(res.status).toBe(400);
      expect(listEntriesMock).not.toHaveBeenCalled();
      expect((await res.json()).error).toBe("invalid_year_filter");
    }
  });

  it("extremely large value → 400, repository not invoked", async () => {
    for (const bad of [
      "99999999999999999999", // > MAX_SAFE_INTEGER magnitude
      "9".repeat(400), // collapses to Infinity → not finite/int
      String(MAX_YEAR + 1),
      "2101",
    ]) {
      listEntriesMock.mockReset();
      listEntriesMock.mockReturnValue([]);
      const res = await GET(req([bad]));
      expect(res.status).toBe(400);
      expect(listEntriesMock).not.toHaveBeenCalled();
      expect((await res.json()).error).toBe("invalid_year_filter");
    }
  });

  it("mixed-validity values → 400 (whole request rejected), repo not invoked", async () => {
    const res = await GET(req(["2024", "abc", "2025"]));
    expect(res.status).toBe(400);
    expect(listEntriesMock).not.toHaveBeenCalled();
    expect((await res.json()).error).toBe("invalid_year_filter");
  });

  it("rejected requests never invoke the repository query", async () => {
    // A representative set of every rejection shape. None may reach
    // listEntries(); a trailing valid request proves the mock IS
    // callable in this test context (so a non-call is meaningful).
    const rejected = [
      distinctYears(MAX_YEAR_FILTERS + 1), // over-limit
      Array(MAX_YEAR_FILTERS + 1).fill("2024"), // duplicate-excessive
      ["abc"], // malformed
      ["-1"], // negative / out of range
      ["9".repeat(400)], // extremely large
      ["2024", "abc"], // mixed-validity
      [""], // explicit empty value
    ];
    for (const years of rejected) {
      listEntriesMock.mockReset();
      listEntriesMock.mockReturnValue([]);
      const res = await GET(req(years));
      expect(res.status).toBe(400);
      expect(listEntriesMock).not.toHaveBeenCalled();
    }
    // Sanity: a valid request DOES invoke the repository.
    listEntriesMock.mockReset();
    listEntriesMock.mockReturnValue([]);
    const ok = await GET(req(["2024"]));
    expect(ok.status).toBe(200);
    expect(listEntriesMock).toHaveBeenCalledTimes(1);
  });

  it("empty filter is explicitly no-op (no `years` key), not a 400", async () => {
    // Absent param and the boundary years both accepted.
    const res1 = await GET(req());
    expect(res1.status).toBe(200);
    expect(listEntriesMock.mock.calls.at(-1)![0].years).toBeUndefined();

    listEntriesMock.mockReset();
    listEntriesMock.mockReturnValue([]);
    const res2 = await GET(req([String(MIN_YEAR), String(MAX_YEAR)]));
    expect(res2.status).toBe(200);
    expect(listEntriesMock.mock.calls[0][0].years).toEqual([
      MIN_YEAR,
      MAX_YEAR,
    ]);
  });

  it("400 body is non-sensitive and generic — never echoes input", async () => {
    const secret = "9".repeat(400);
    const res = await GET(req([secret]));
    const text = await res.text();
    expect(text).not.toContain(secret);
    expect(text).not.toContain("Infinity");
    expect(text).toBe(`{"error":"invalid_year_filter"}`);
  });
});