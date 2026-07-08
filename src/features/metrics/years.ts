import { getDb } from "@/lib/db";

/** All distinct years present across monthly + breakdown entries. */
export function listAvailableYears(): number[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT year FROM (
        SELECT year FROM monthly_entries
        UNION ALL
        SELECT year FROM breakdown_entries
      ) ORDER BY year ASC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => Number(r.year));
}
