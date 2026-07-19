const NEEDS_QUOTE = /[",\n\r]/;
const CRLF = "\r\n";
const FORMULA_MARKERS = new Set(["=", "+", "-", "@"]);

/** Determines whether is leading whitespace or control. */
function isLeadingWhitespaceOrControl(char: string): boolean {
  const code = char.charCodeAt(0);
  return /\s/u.test(char) || code <= 0x1f || code === 0x7f;
}

/** Neutralize text that spreadsheet applications could evaluate as a formula. */
function neutralizeFormulaPrefix(value: string): string {
  if (value.length === 0) return value;
  // Tab and CR are themselves formula triggers in common spreadsheet
  // guidance. Other whitespace/control prefixes are skipped so consumers
  // that normalize them cannot expose a hidden marker afterward.
  if (value[0] === "\t" || value[0] === "\r") return `'${value}`;
  let markerIndex = 0;
  while (
    markerIndex < value.length &&
    isLeadingWhitespaceOrControl(value[markerIndex]!)
  ) {
    markerIndex += 1;
  }
  if (FORMULA_MARKERS.has(value[markerIndex] ?? "")) {
    return `'${value}`;
  }
  return value;
}

/** Escape one cell per RFC-4180 after neutralizing spreadsheet formulas. */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
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

/** Assemble a CSV body with CRLF row separators and a trailing CRLF. */
export function buildCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(escapeCell).join(",");
  const body = rows
    .map((row) => columns.map((column) => escapeCell(row[column])).join(","))
    .join(CRLF);
  return body ? `${header}${CRLF}${body}${CRLF}` : `${header}${CRLF}`;
}

/** Implements the ensure csv ext operation. */
export function ensureCsvExt(name: string): string {
  return name.toLowerCase().endsWith(".csv") ? name : `${name}.csv`;
}
