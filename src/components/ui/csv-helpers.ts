/**
 * Pure helpers for CSV serialization. Kept in a separate .ts file (no JSX)
 * so unit tests can import them without dragging the React component into
 * vitest's transform pipeline.
 */

const NEEDS_QUOTE = /[",\n\r]/;
const CRLF = "\r\n";

/** Escape one cell per RFC-4180. */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (NEEDS_QUOTE.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
