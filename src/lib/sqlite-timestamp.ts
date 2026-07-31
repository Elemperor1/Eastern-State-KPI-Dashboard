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

/**
 * The organization's own clock. Every stored timestamp is displayed in it so
 * that two people reading the same row agree on what time a change happened,
 * and — because these tables render inside client components that Next also
 * renders on the server — so the server's locale and timezone cannot produce
 * different text from the browser's and trip a hydration mismatch.
 */
const ORGANIZATION_LOCALE = "en-US";
const ORGANIZATION_TIME_ZONE = "America/New_York";

const timestampFormatter = new Intl.DateTimeFormat(ORGANIZATION_LOCALE, {
  timeZone: ORGANIZATION_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat(ORGANIZATION_LOCALE, {
  timeZone: ORGANIZATION_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/**
 * Formats a stored SQLite timestamp as a date and time in the organization's
 * clock. Unparseable input falls back to the raw stored text.
 */
export function formatUtcTimestamp(value: string): string {
  const date = parseUtcTimestamp(value);
  return Number.isNaN(date.getTime()) ? value : timestampFormatter.format(date);
}

/** Formats a stored SQLite timestamp as a date in the organization's clock. */
export function formatUtcDate(value: string): string {
  const date = parseUtcTimestamp(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}
