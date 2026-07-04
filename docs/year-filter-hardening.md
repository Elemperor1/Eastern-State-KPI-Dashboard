# Year-filter hardening (D8AD-CAN-006)

This document records the defense-in-depth controls that bound and
normalize the repeated `year` query-parameter filter accepted by
`GET /api/entries`. The same shared module is available for any other
route that expands repeated year params into a dynamic SQL `IN` list
(e.g. `GET /api/breakdowns`, D8AD-CAN-007).

## Threat model and disposition

D8AD-CAN-006 established that `GET /api/entries` accepted an unbounded
number of repeated `year` query parameters and expanded them into a
dynamic SQL `IN (?, ?, ...)` placeholder list. The values were always
parameter-bound (no SQL injection) and the route requires an
authenticated session, so the audit suppressed the finding as
low/ignore with a proof gap ("a much larger request might consume
CPU/memory"). This hardening closes that proof gap regardless of how
the underlying SQL driver handles large placeholder lists.

## Primary control: application-level bound and normalization

`src/lib/year-filter.ts` exports `parseYearFilters(values)`, invoked by
the route handler before the repository is touched:

1. **Empty input is explicitly defined.** Zero `year` parameters return
   `{ ok: true, years: [] }`. The route then omits `years` from the
   repository filter, meaning "no year constraint" — every entry is
   eligible. An explicit-but-empty value (`?year=`) is **not** empty
   input; it is a single malformed value and is rejected.
2. **Over-limit gate (raw count).** If the raw parameter count exceeds
   `MAX_YEAR_FILTERS` (50), the request is rejected with
   `400 {"error":"too_many_year_filters"}`. This check runs on the raw
   count **before** deduplication, so an attacker cannot bypass it by
   repeating a single valid year many times.
3. **Strict per-value integer schema.** Each value must match
   `^-?\d+$`, then `Number(s)`, then `z.number().int().finite()`. This
   rejects decimals (`2024.5`), scientific notation (`1e3`), hex
   (`0x7e8`), empty strings, whitespace, signed (`+2024`) forms, and
   values whose magnitude exceeds `Number.MAX_SAFE_INTEGER` (they
   collapse to `Infinity` / lossy floats and fail `.int()` / `.finite()`).
4. **Range check.** Integers must fall in `[MIN_YEAR, MAX_YEAR]` =
   `[1900, 2100]`, mirroring the existing write schema
   (`z.number().int().min(1900).max(2100)`). Negative and extremely
   large values fail here.
5. **Mixed validity is rejected as a whole.** One bad value rejects
   the entire request with `400 {"error":"invalid_year_filter"}` so a
   partially-bad filter never silently widens into a broader query than
   the caller intended.
6. **Deduplicate + sort.** Valid values are deduplicated and sorted
   ascending so identical logical queries produce identical SQL
   statements regardless of input order or repetition.
7. **Parameterized SQL preserved.** The repository still emits the
   years via `?` placeholders (`year IN (?, ?, ...)`); the bound values
   are the returned integers, so SQL values stay parameter-bound.

### Choice of `MAX_YEAR_FILTERS = 50`

Legitimate product usage selects a handful of years for trend
comparison (the dashboard trend explorer multi-selects years). 50
covers any realistic multi-year selection with a wide margin while
bounding the SQL placeholder list the repository must build. The
valid year domain is `[1900, 2100]` (201 distinct years); the cap is
well below that, so an attacker cannot enumerate every valid year to
produce a maximal-but-still-bounded list.

### Error body

The 400 body is `{ "error": "<reason-code>" }` — a generic,
non-sensitive reason code (`too_many_year_filters` or
`invalid_year_filter`). It never echoes the input, never reports
internal paths, and never distinguishes malformed from out-of-range to
avoid leaking validation detail. Rejection happens before
`listEntries()` runs, so rejected requests do not invoke the repository
query (verified by `src/app/api/entries/route.test.ts`).

## Secondary control: platform HTTP request-line / header size

The application-level bound is the primary control and does not rely on
any reverse-proxy or platform URL-length limit. As a secondary backstop
— relevant only if the application cap were somehow bypassed — the
underlying Node.js HTTP parser imposes a default maximum on the
combined size of the request line (method + URL + version) and headers,
configurable via `--max-http-header-size` (default **16 KiB**). Because
the query string lives in the request line, this bounds the raw number
of `year` parameters any single request can carry regardless of the
application cap. The Fly.io edge proxy terminates TLS and forwards HTTP
to the Node process; no Fly-specific URL-length limit is relied upon,
and none is assumed. The application cap is intentionally tighter than
this platform backstop so the platform limit is never the binding
constraint in practice.

## Test coverage

`src/app/api/entries/route.test.ts` exercises the route across the
required matrix:

- zero year params (empty filter is a no-op),
- one valid year,
- exactly `MAX_YEAR_FILTERS` distinct valid years (maximum),
- `MAX_YEAR_FILTERS + 1` distinct valid years (over-maximum),
- duplicates within the limit (deduped + sorted),
- duplicates used to inflate past the limit (raw-count gate),
- malformed values (`abc`, `2024.5`, `1e3`, `0x7e8`, `""`, `" "`,
  `20 24`, `+2024`),
- negative values (`-1`, `-2024`, `-999999`),
- extremely large values (`9`.repeat(400), `MAX_YEAR + 1`, etc.),
- mixed-validity values,
- and a dedicated test proving rejected requests never invoke
  `listEntries()` while a valid request does.

All 400 bodies are asserted to be non-sensitive and input-echo-free.