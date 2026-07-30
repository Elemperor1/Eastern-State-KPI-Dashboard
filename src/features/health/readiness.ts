import path from "node:path";
import schemaVersionConfig from "@/lib/schema-version.json";
import {
  checkDatabaseIntegrity as checkDatabaseIntegrityCore,
  checkDatabaseReadiness,
} from "./readiness-core.mjs";

export type ReadinessFailureReason =
  | "database_missing"
  | "database_unavailable"
  | "database_incompatible"
  | "migration_in_progress"
  | "initialization_incomplete";

export type ReadinessResult =
  | { ready: true }
  | { ready: false; reason: ReadinessFailureReason };

export type IntegrityResult =
  | { integrity: true }
  | {
      integrity: false;
      reason: "database_unavailable" | "integrity_check_failed";
    };

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

/**
 * Deep SQLite integrity probe (PRAGMA quick_check) for scheduled or
 * operator-invoked use. Deliberately NOT part of checkReadiness: the
 * anonymous readiness hot path stays shallow so unauthenticated traffic
 * cannot force a full-database scan (S008-C1).
 */
export function checkDatabaseIntegrity(
  databasePath = resolveReadinessDatabasePath(),
): IntegrityResult {
  return checkDatabaseIntegrityCore(databasePath) as IntegrityResult;
}
