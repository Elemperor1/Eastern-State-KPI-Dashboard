/**
 * Pure helpers for CSV serialization. Kept in a separate .ts file (no JSX)
 * so unit tests can import them without dragging the React component into
 * vitest's transform pipeline.
 */

const NEEDS_QUOTE = /[",\n\r]/;
const CRLF = "\r\n";

/**
 * Characters that spreadsheet applications (Excel, LibreOffice Calc,
 * Google Sheets) treat as the start of a formula. A cell beginning with
 * any of these is evaluated as code when the file is opened, which is
 * the CSV-injection vector.
 *
 * The check ignores leading whitespace because some spreadsheets strip
 * whitespace before the formula check, so a payload like " =cmd|..."
 * would otherwise slip through. A tab or carriage return in the
 * whitespace is itself a formula trigger and is matched directly.
 */
const FORMULA_LEADING = /^[=+\-@\t\r\s]/;

/**
 * Prefix a string that begins with a spreadsheet-formula trigger so
 * the cell is treated as literal text. We use a single quote (') which
 * is the standard "force text" prefix in Excel, LibreOffice, and Google
 * Sheets; the prefix is hidden on display but the value is preserved
 * verbatim on round-trip.
 *
 * The check looks at `value[0]` only — but the FORMULA_LEADING regex
 * includes `\s` in its character class, so a leading space/tab/CR
 * still triggers the prefix and the original whitespace is preserved
 * in the output (e.g. `"  =cmd"` becomes `"'  =cmd"`). Numbers that
 * happen to start with a minus sign (e.g. -3.14) are not affected
 * because this helper is only called on string values.
 */
export function neutralizeFormulaPrefix(value: string): string {
  if (value.length === 0) return value;
  if (FORMULA_LEADING.test(value[0])) {
    return `'${value}`;
  }
  return value;
}

/** Escape one cell per RFC-4180. */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Numbers and booleans are stringified with their natural representation
  // (e.g. -3.14, true) and intentionally NOT formula-neutralized: a
  // numeric -3.14 in a CSV is the standard way to write a negative
  // number, not a formula. The CSV-injection risk only applies to text
  // that was *stored* with a formula-leading character (KPI notes,
  // labels, breakdown text).
  if (typeof value !== "string") return String(value);
  const neutralized = neutralizeFormulaPrefix(value);
  if (NEEDS_QUOTE.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

/** Union of keys in first-seen order. */
export function inferColumns(rows: Record<string, unknown>[]): string[] {
  const seen: string[] = [];
  const seenSet = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row)) {
      if (!seenSet.has(key)) {
        seenSet.add(key);
        seen.push(key);
      }
    }
  }
  return seen;
}

/** Assemble the CSV body (header + CRLF-separated rows + trailing CRLF). */
export function buildCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(escapeCell).join(",");
  const body = rows
    .map((row) => columns.map((col) => escapeCell(row[col])).join(","))
    .join(CRLF);
  return body ? `${header}${CRLF}${body}${CRLF}` : `${header}${CRLF}`;
}

/** Ensure the filename ends in .csv (case-insensitive). */
export function ensureCsvExt(name: string): string {
  return name.toLowerCase().endsWith(".csv") ? name : `${name}.csv`;
}
