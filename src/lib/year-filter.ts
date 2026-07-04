import { z } from "zod";

/**
 * D8AD-CAN-006/D8AD-CAN-007 defense-in-depth: bound and normalize
 * repeated `year` query filters on GET /api/entries and
 * GET /api/breakdowns before they reach the repository.
 *
 * The repository expands `filter.years` into a dynamic SQL IN list
 * (`year IN (?, ?, ...)` or `b.year IN (?, ?, ...)`). An authenticated
 * client could previously send an unbounded number of repeated `year`
 * parameters, forcing the server to build and prepare a statement with
 * an unbounded placeholder list — a CPU/memory availability lever.
 * Values were always parameter-bound (no SQL injection) and the route
 * requires a session, which is why the audit suppressed the finding as
 * low/ignore; this module is the requested defense-in-depth cap so the
 * surface is bounded regardless of how the underlying SQL driver handles
 * large placeholder lists.
 *
 * Both routes use the same constant and parser from this module so
 * validation is consistent and never duplicated.
 */

/** Earliest year accepted. Mirrors the existing upsert schema
 *  (`z.number().int().min(1900).max(2100)`) so read filters and writes
 *  accept the same year domain. */
export const MIN_YEAR = 1900;

/** Latest year accepted. See MIN_YEAR. */
export const MAX_YEAR = 2100;

/**
 * Maximum number of `year` query parameters a single request may carry.
 *
 * Legitimate product usage selects a handful of years for trend
 * comparison (the dashboard trend explorer multi-selects years); 50
 * covers any realistic multi-year selection with a wide margin while
 * bounding the SQL placeholder list the repository must build. The
 * check counts raw parameters BEFORE deduplication so an attacker
 * cannot bypass it by repeating a single valid year many times.
 */
export const MAX_YEAR_FILTERS = 50;

/**
 * Strict per-value integer schema. Accepts an optional leading `-` so
 * negative years parse cleanly and are rejected by the range check
 * (rather than as malformed), and rejects every non-integer shape:
 * decimals (`2024.5`), scientific notation (`1e3`), hex (`0x7e8`),
 * empty strings, whitespace, and anything with a `+` sign or
 * non-digit characters. `Number(s)` then `z.number().int().finite()`
 * additionally rejects values whose magnitude exceeds Number.MAX_SAFE_INTEGER
 * (extremely large inputs collapse to Infinity / lossy floats and
 * fail `.int()` / `.finite()`), and the range check rejects the rest.
 */
const YearString = z
  .string()
  .regex(/^-?\d+$/, "year must be an integer string")
  .transform((s) => Number(s))
  .pipe(z.number().int().finite().min(MIN_YEAR).max(MAX_YEAR));

export interface YearFilterOk {
  ok: true;
  /** Deduplicated, ascending-sorted, in-range years. Empty when the
   *  request supplied zero `year` parameters — the caller omits
   *  `years` from the repository filter and returns all entries. */
  years: number[];
}

export interface YearFilterErr {
  ok: false;
  /** Controlled 400 response. */
  status: 400;
  /** Non-sensitive, generic reason code. Never echoes the input. */
  error: string;
}

/**
 * Parse the raw `year` query parameter values from a request into a
 * bounded, deduplicated, ascending list of in-range integers.
 *
 * Empty input is explicitly defined: returns `{ ok: true, years: [] }`,
 * meaning "no year filter" — the caller omits `years` from the repo
 * filter and returns all entries. An explicit-but-empty value
 * (`?year=`) is NOT empty input; it is a single malformed value and is
 * rejected.
 *
 * Rejection is fail-closed and happens BEFORE the repository is touched:
 *   - over-limit:    raw count > MAX_YEAR_FILTERS
 *   - malformed:     non-integer strings (decimals, hex, empty, NaN-ish)
 *   - out-of-range:  integers outside [MIN_YEAR, MAX_YEAR], including
 *                    negative and extremely large values
 *   - mixed-validity: rejected as a whole (one bad value rejects the
 *                    request) so a partially-bad filter never silently
 *                    widens into a broader query than the caller intended.
 *
 * On success the SQL values are the returned integers; the repository
 * emits them via `?` placeholders, so they stay parameter-bound.
 */
export function parseYearFilters(
  values: string[],
): YearFilterOk | YearFilterErr {
  if (values.length === 0) return { ok: true, years: [] };
  if (values.length > MAX_YEAR_FILTERS) {
    return { ok: false, status: 400, error: "too_many_year_filters" };
  }
  const years: number[] = [];
  for (const raw of values) {
    const parsed = YearString.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, status: 400, error: "invalid_year_filter" };
    }
    years.push(parsed.data);
  }
  // Dedupe + sort for deterministic SQL placeholder order so identical
  // logical queries produce identical statements regardless of input
  // order or duplication.
  const unique = Array.from(new Set(years)).sort((a, b) => a - b);
  return { ok: true, years: unique };
}