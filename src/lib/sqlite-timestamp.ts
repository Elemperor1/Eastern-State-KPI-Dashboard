/**
 * SQLite writes `datetime('now')` as UTC in "YYYY-MM-DD HH:MM:SS" — a format
 * with no timezone marker, which every JS engine parses as LOCAL time. Reading
 * one of those strings back with `new Date(value)` therefore shifts it by the
 * viewer's UTC offset: a change recorded at 4:13 PM Eastern renders as 8:13 PM.
 *
 * Every surface that formats a stored timestamp must route it through here
 * first, so the rule lives in one place rather than being re-derived (and
 * occasionally forgotten) at each call site.
 */

/** Pin a stored SQLite timestamp to UTC so it is not read as local time. */
export function asUtcTimestamp(value: string): string {
  const trimmed = value.trim();
  // Already zoned ("...Z", "+05:30", "-08:00") or empty: leave it alone.
  if (trimmed === "" || /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    return trimmed;
  }
  // "YYYY-MM-DD HH:MM:SS" is the shape SQLite emits; the space separator is
  // also what makes engines treat it as a local-time literal.
  return `${trimmed.replace(" ", "T")}Z`;
}

/**
 * Parse a stored SQLite timestamp as the UTC instant it represents. Returns an
 * invalid Date for unparseable input so callers can fall back to the raw text.
 */
export function parseUtcTimestamp(value: string): Date {
  return new Date(asUtcTimestamp(value));
}
