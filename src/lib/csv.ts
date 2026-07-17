const NEEDS_QUOTE = /[",\n\r]/;
const CRLF = "\r\n";
const FORMULA_LEADING = /^[=+\-@\t\r]/;
const FORMULA_LEADING_AFTER_SPACES = /^ +[=+\-@]/;

/** Neutralize text that spreadsheet applications could evaluate as a formula. */
function neutralizeFormulaPrefix(value: string): string {
  if (value.length === 0) return value;
  if (FORMULA_LEADING.test(value) || FORMULA_LEADING_AFTER_SPACES.test(value)) {
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

export function ensureCsvExt(name: string): string {
  return name.toLowerCase().endsWith(".csv") ? name : `${name}.csv`;
}
