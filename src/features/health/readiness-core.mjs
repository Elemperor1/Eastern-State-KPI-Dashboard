import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const REQUIRED_TABLES = [
  "meta",
  "users",
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

    const integrity = database.prepare("PRAGMA quick_check(1)").get();
    if (!integrity || !Object.values(integrity).includes("ok")) {
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
