/**
 * Removes seeded sample *results* while preserving the strategic plan itself.
 *
 * `scripts/seed.ts` initializes a fresh production database with the real
 * Eastern State catalog (priorities, goals, measures, configurations,
 * components, and targets) but also writes fabricated annual values for
 * 2024-2026 so a development instance has something to render. Those values
 * must never reach a live installation: they are plausible-looking numbers
 * that are not Eastern State's.
 *
 * This operator script clears exactly the value-bearing tables and flips
 * `meta.sample_data` to `0`, leaving the catalog, configuration, targets,
 * users, and creation provenance intact. It is the supported step between
 * first boot and user onboarding on a new installation.
 *
 * It is deliberately NOT a reseed: it never drops or recreates catalog rows,
 * so every measure slug, component identity, and target survives untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  checkDatabaseReadiness,
} from "../src/features/health/readiness-core.mjs";

/**
 * Value-bearing tables in foreign-key-safe deletion order.
 *
 * Every table here holds reported results or values derived from them.
 * `kpi_goals` is the legacy per-KPI target archive whose stored deltas are
 * computed against the sample baseline year, so it is meaningless once the
 * sample values are gone. `entry_history` is the immutable value-change log.
 */
const VALUE_TABLES = [
  "distribution_values",
  "distribution_observations",
  "kpi_component_entries",
  "kpi_observations",
  "breakdown_entries",
  "monthly_entries",
  "kpi_goals",
  "entry_history",
];

/**
 * Tables that must retain rows after clearing.
 *
 * Emptying any of these would mean the catalog itself was damaged rather than
 * the sample results, so the script verifies them before committing.
 */
const CATALOG_TABLES = [
  "organizations",
  "strategic_plans",
  "categories",
  "kpis",
  "strategic_goals",
  "goal_kpis",
  "kpi_measurement_configs",
  "kpi_components",
  "users",
];

/** Parses the narrow operator argument surface. */
export function parseClearArguments(args) {
  let dryRun = false;
  for (const argument of args) {
    if (argument === "--dry-run") {
      dryRun = true;
    } else {
      throw new Error(`Unsupported argument: ${argument}`);
    }
  }
  return { dryRun };
}

/** Reads the schema version this checkout expects. */
function readExpectedSchemaVersion() {
  const raw = fs.readFileSync(
    path.resolve(process.cwd(), "src", "lib", "schema-version.json"),
    "utf8",
  );
  const version = Number(JSON.parse(raw).schemaVersion);
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error("Invalid schemaVersion in src/lib/schema-version.json.");
  }
  return version;
}

/** Returns the resolved database path the operator explicitly named. */
function resolveDatabasePath() {
  const configured = process.env.DATABASE_PATH;
  if (!configured) {
    throw new Error(
      "DATABASE_PATH must name the database to clear. This script refuses to " +
        "guess a default path.",
    );
  }
  const resolved = path.resolve(configured);
  if (!fs.existsSync(resolved)) {
    throw new Error(`No database exists at ${resolved}.`);
  }
  if (process.env.CLEAR_CONFIRM !== resolved) {
    throw new Error(
      `Refusing to clear results from ${resolved}. Set ` +
        `CLEAR_CONFIRM="${resolved}" to confirm this exact database.`,
    );
  }
  return resolved;
}

/** Reads one meta value, or null when the key is absent. */
function readMeta(db, key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row?.value ?? null;
}

/** Counts rows in each named table. */
function countRows(db, tables) {
  const counts = {};
  for (const table of tables) {
    counts[table] = Number(
      db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()?.count ?? 0,
    );
  }
  return counts;
}

/**
 * Refuses any database that is not an untouched sample installation.
 *
 * `meta.sample_data` is the seed's own marker. A database that has already
 * been cleared, or that was migrated from a real predecessor, never carries
 * it, so this gate keeps the script from destroying real reported results.
 */
function assertSafeToClear(db, expectedSchemaVersion) {
  const schemaVersion = Number(readMeta(db, "schema_version") ?? 0);
  if (schemaVersion !== expectedSchemaVersion) {
    throw new Error(
      `Database schema is ${schemaVersion || "missing"}; this checkout expects ` +
        `${expectedSchemaVersion}. Run the migration before clearing.`,
    );
  }
  if (readMeta(db, "sample_data") !== "1") {
    throw new Error(
      "This database is not flagged as sample data (meta.sample_data is not " +
        "'1'). It may hold real reported results; refusing to clear.",
    );
  }
  if (readMeta(db, "plan_activation_write_pause") === "1") {
    throw new Error(
      "A plan activation is in progress; refusing to clear. Let it finish " +
        "or complete the documented recovery first.",
    );
  }
}

/** Deletes the sample results inside one transaction. */
function clearSampleResults(db) {
  const deleted = {};
  db.exec("BEGIN IMMEDIATE");
  try {
    // entry_history carries an immutable-delete trigger, and the value tables
    // carry plan-state guards. This is the repository's own documented
    // reset flag, mirroring scripts/seed.ts. A rollback restores it to '0'
    // automatically because the write is part of this transaction.
    db.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_reset_internal_write', '1');",
    );
    for (const table of VALUE_TABLES) {
      const before = Number(
        db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()?.count ?? 0,
      );
      db.exec(`DELETE FROM "${table}";`);
      deleted[table] = before;
    }
    db.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_reset_internal_write', '0');",
    );
    db.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('sample_data', '0');",
    );
    // Tombstone so the clearing remains auditable after the fact.
    db.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('sample_data_cleared_at', datetime('now'));",
    );

    const remaining = countRows(db, VALUE_TABLES);
    const stillPopulated = Object.entries(remaining).filter(
      ([, count]) => count > 0,
    );
    if (stillPopulated.length > 0) {
      throw new Error(
        `Sample results survived the clear in: ${stillPopulated
          .map(([table]) => table)
          .join(", ")}.`,
      );
    }
    const catalog = countRows(db, CATALOG_TABLES);
    const emptied = Object.entries(catalog).filter(([, count]) => count === 0);
    if (emptied.length > 0) {
      throw new Error(
        `The catalog would be left empty in: ${emptied
          .map(([table]) => table)
          .join(", ")}.`,
      );
    }
    db.exec("COMMIT");
    return deleted;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Prints a stable, non-sensitive table of row counts. */
function reportCounts(label, counts) {
  console.log(`[clear-sample-data] ${label}`);
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${String(count).padStart(6)}  ${table}`);
  }
}

/** Runs the guarded sample-result clearing workflow. */
function main() {
  const { dryRun } = parseClearArguments(process.argv.slice(2));
  const expectedSchemaVersion = readExpectedSchemaVersion();
  const databasePath = resolveDatabasePath();

  let db;
  try {
    db = new DatabaseSync(databasePath, { timeout: 5000 });
  } catch {
    throw new Error(
      "The database could not be opened for writing. Stop the application " +
        "task so exactly one process holds the database, then retry.",
    );
  }

  try {
    db.exec("PRAGMA foreign_keys = ON;");
    assertSafeToClear(db, expectedSchemaVersion);

    const present = countRows(db, VALUE_TABLES);
    const total = Object.values(present).reduce((sum, n) => sum + n, 0);
    reportCounts(`sample results found in ${databasePath}:`, present);

    if (dryRun) {
      console.log(
        `[clear-sample-data] dry run: ${total} row(s) would be removed. ` +
          "No changes were written.",
      );
      return;
    }
    if (total === 0) {
      console.log(
        "[clear-sample-data] no sample results present; nothing to remove.",
      );
    }

    const deleted = clearSampleResults(db);
    reportCounts("removed:", deleted);
    reportCounts("catalog preserved:", countRows(db, CATALOG_TABLES));
  } finally {
    db.close();
  }

  const readiness = checkDatabaseReadiness(databasePath, expectedSchemaVersion);
  if (!readiness.ready) {
    throw new Error(
      `The cleared database is not ready to serve (${readiness.reason}). ` +
        "Restore the pre-clear backup before starting the application.",
    );
  }
  console.log(
    "[clear-sample-data] sample results removed; catalog intact and database ready.",
  );
}

try {
  main();
} catch (error) {
  console.error(
    `[clear-sample-data] ${error instanceof Error ? error.message : "Clearing failed."}`,
  );
  process.exitCode = 1;
}
