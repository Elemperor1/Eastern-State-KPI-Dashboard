import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

// Exported so the production initialization probe in scripts/ensure-seeded.mjs
// can mirror exactly the tables the readiness gate requires; a partial
// database that retains rows in ANY required sidecar must refuse an automatic
// destructive reseed.
export const REQUIRED_TABLES = [
  "meta",
  "users",
  "user_lifecycle_audit_events",
  "organizations",
  "strategic_plans",
  "installation_audit_events",
  "categories",
  "kpis",
  "monthly_entries",
  "breakdown_entries",
  "kpi_goals",
  "entry_history",
  "strategic_goals",
  "goal_kpis",
  "kpi_measurement_configs",
  "kpi_observations",
  "kpi_components",
  "kpi_component_entries",
  "kpi_targets",
  "distribution_bands",
  "distribution_observations",
  "distribution_values",
  "strategic_audit_events",
  "board_reporting_scopes",
  "board_reporting_priorities",
  "board_reporting_statements",
  "board_reporting_statement_kpis",
  "board_reporting_audit_events",
];

/**
 * @typedef {"database_missing" | "database_unavailable" | "database_incompatible" | "migration_in_progress" | "initialization_incomplete"} ReadinessFailureReason
 */

/**
 * @typedef {{ ready: true } | { ready: false, reason: ReadinessFailureReason }} ReadinessResult
 */

/**
 * Probes production readiness through an independent read-only SQLite
 * connection. This deliberately avoids getDb(), whose supported application
 * boundary performs migrations and initialization.
 *
 * @param {string} databasePath
 * @param {number} expectedSchemaVersion
 * @returns {ReadinessResult}
 */
export function checkDatabaseReadiness(
  databasePath,
  expectedSchemaVersion,
) {
  let stat;
  try {
    stat = fs.statSync(databasePath);
  } catch (error) {
    return isMissingPathError(error)
      ? { ready: false, reason: "database_missing" }
      : { ready: false, reason: "database_unavailable" };
  }
  if (!stat.isFile()) {
    return { ready: false, reason: "database_unavailable" };
  }

  let database;
  try {
    database = new DatabaseSync(databasePath, {
      readOnly: true,
      timeout: 250,
    });
  } catch {
    return { ready: false, reason: "database_unavailable" };
  }

  try {
    // Cheap liveness gate: proves the connection can execute SQL against
    // this file. Integrity scanning (PRAGMA quick_check) is deliberately
    // OFF this anonymous, unthrottled hot path (S008-C1): the probe runs
    // on every Fly health interval and any unauthenticated request, so a
    // full-database scan here would let anonymous traffic force expensive
    // synchronous I/O on demand. Integrity scanning lives in the
    // scheduled/operator deep check (checkDatabaseIntegrity) below.
    database.prepare("SELECT 1").get();

    const migrationState = database
      .prepare(
        "SELECT value FROM meta WHERE key = 'production_migration_state'",
      )
      .get();
    if (migrationState?.value === "in_progress") {
      return { ready: false, reason: "migration_in_progress" };
    }

    const schema = database
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get();
    if (Number(schema?.value) !== expectedSchemaVersion) {
      return { ready: false, reason: "database_incompatible" };
    }

    const tableRows = database
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all();
    const tables = new Set(tableRows.map((row) => row.name));
    if (REQUIRED_TABLES.some((table) => !tables.has(table))) {
      return { ready: false, reason: "database_incompatible" };
    }

    const pendingInitialization = database
      .prepare(
        "SELECT value FROM meta WHERE key = 'schema_12_content_migration_pending'",
      )
      .get();
    if (pendingInitialization?.value === "1") {
      return { ready: false, reason: "initialization_incomplete" };
    }

    const installation = database
      .prepare(
        `SELECT EXISTS (
           SELECT 1
           FROM organizations organization
           JOIN strategic_plans plan
             ON plan.organization_id = organization.id
            AND plan.status = 'active'
           JOIN categories priority ON priority.plan_id = plan.id
           JOIN kpis measure ON measure.category_id = priority.id
           WHERE organization.status = 'active'
             AND priority.archived_at IS NULL
             AND measure.archived_at IS NULL
         ) AS initialized`,
      )
      .get();
    if (Number(installation?.initialized ?? 0) !== 1) {
      return { ready: false, reason: "initialization_incomplete" };
    }

    return { ready: true };
  } catch (error) {
    return isDatabaseBusyError(error)
      ? { ready: false, reason: "database_unavailable" }
      : { ready: false, reason: "database_incompatible" };
  } finally {
    database.close();
  }
}

/**
 * @typedef {{ integrity: true } | { integrity: false, reason: "database_unavailable" | "integrity_check_failed" }} IntegrityResult
 */

/**
 * Deep SQLite integrity probe (PRAGMA quick_check) for scheduled or
 * operator-invoked use — never wired to the anonymous /api/health/ready
 * hot path (S008-C1). Read-only, constant-shape result, and it logs or
 * returns no file content, schema detail, or raw SQLite error text.
 *
 * @param {string} databasePath
 * @returns {IntegrityResult}
 */
export function checkDatabaseIntegrity(databasePath) {
  let database;
  try {
    database = new DatabaseSync(databasePath, {
      readOnly: true,
      timeout: 250,
    });
  } catch {
    return { integrity: false, reason: "database_unavailable" };
  }

  try {
    const integrity = database.prepare("PRAGMA quick_check(1)").get();
    return integrity && Object.values(integrity).includes("ok")
      ? { integrity: true }
      : { integrity: false, reason: "integrity_check_failed" };
  } catch {
    // A file that cannot be read as a database at all (for example a
    // damaged header) fails closed as an integrity failure.
    return { integrity: false, reason: "integrity_check_failed" };
  } finally {
    database.close();
  }
}

/** Identifies a filesystem lookup that failed because the path is absent. */
function isMissingPathError(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

/** Identifies SQLite lock errors without exposing their raw messages. */
function isDatabaseBusyError(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "errcode" in error &&
    (error.errcode === 5 || error.errcode === 6)
  );
}
