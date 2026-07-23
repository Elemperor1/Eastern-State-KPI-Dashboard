import path from "node:path";
import schemaVersionConfig from "@/lib/schema-version.json";
import { checkDatabaseReadiness } from "./readiness-core.mjs";

export type ReadinessFailureReason =
  | "database_missing"
  | "database_unavailable"
  | "database_incompatible"
  | "migration_in_progress"
  | "initialization_incomplete";

export type ReadinessResult =
  | { ready: true }
  | { ready: false; reason: ReadinessFailureReason };

/** Resolves the configured SQLite path without creating its parent directory. */
export function resolveReadinessDatabasePath(): string {
  return (
    process.env.DATABASE_PATH ??
    path.resolve(process.cwd(), "data", "kpi.db")
  );
}

/**
 * Probes production readiness through an independent read-only SQLite
 * connection. This deliberately avoids getDb(), whose supported application
 * boundary performs migrations and initialization.
 */
export function checkReadiness(
  databasePath = resolveReadinessDatabasePath(),
): ReadinessResult {
  return checkDatabaseReadiness(
    databasePath,
    schemaVersionConfig.schemaVersion,
  ) as ReadinessResult;
}
