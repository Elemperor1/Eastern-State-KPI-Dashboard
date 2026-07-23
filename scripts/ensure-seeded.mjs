import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { checkDatabaseReadiness } from "../src/features/health/readiness-core.mjs";
import {
  logMigrationFailure,
  logStartup,
  logStartupFailure,
} from "./operational-log.mjs";

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), "data", "kpi.db");
const dbDir = path.dirname(dbPath);
const schemaVersionPath = path.resolve(process.cwd(), "src", "lib", "schema-version.json");

/** Retrieves schema policy. */
function readSchemaPolicy() {
  const raw = fs.readFileSync(schemaVersionPath, "utf8");
  const parsed = JSON.parse(raw);
  const version = Number(parsed.schemaVersion);
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(`Invalid schemaVersion in ${schemaVersionPath}`);
  }
  const additiveFrom = Array.isArray(parsed.additiveFrom)
    ? parsed.additiveFrom.map(Number).filter(Number.isInteger)
    : [];
  return { expectedSchemaVersion: version, additiveFrom };
}

logStartup("initialization_started");
let expectedSchemaVersion = 0;

/** Retrieves existing database. */
function queryExistingDatabase() {
  if (!fs.existsSync(dbPath)) {
    return {
      needsSeed: true,
      safeToSeed: true,
      reason: "database file is missing",
      schemaVersion: 0,
      categoryCount: 0,
      businessRowCount: 0,
    };
  }

  let db;
  try {
    db = new DatabaseSync(dbPath);
    const schemaRow = db
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get();
    const categoryRow = db.prepare("SELECT COUNT(*) AS count FROM categories").get();
    const schemaVersion = Number(schemaRow?.value ?? 0);
    const categoryCount = Number(categoryRow?.count ?? 0);
    const businessTables = [
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
      "kpi_measurement_configs",
      "kpi_observations",
      "kpi_component_entries",
      "distribution_observations",
      "strategic_audit_events",
      "board_reporting_scopes",
      "board_reporting_priorities",
      "board_reporting_statements",
      "board_reporting_statement_kpis",
      "board_reporting_audit_events",
    ];
    const businessRowCount = businessTables.reduce((total, table) => {
      const exists = db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(table);
      if (!exists) return total;
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
      return total + Number(row?.count ?? 0);
    }, 0);

    if (schemaVersion !== expectedSchemaVersion) {
      return {
        needsSeed: true,
        safeToSeed: businessRowCount === 0,
        reason: `schema_version is ${schemaVersion || "missing"}; expected ${expectedSchemaVersion}`,
        schemaVersion,
        categoryCount,
        businessRowCount,
      };
    }
    if (categoryCount === 0) {
      return {
        needsSeed: true,
        safeToSeed: businessRowCount === 0,
        reason:
          businessRowCount === 0
            ? "database has no KPI-owned business data"
            : "database has no categories but retains KPI-owned business or audit rows",
        schemaVersion,
        categoryCount,
        businessRowCount,
      };
    }
    return {
      needsSeed: false,
      safeToSeed: false,
      reason: "database already contains application data",
      schemaVersion,
      categoryCount,
      businessRowCount,
    };
  } catch {
    return {
      needsSeed: true,
      safeToSeed: false,
      reason: "database check failed",
      failureReason: "database_unavailable",
      schemaVersion: 0,
      categoryCount: 0,
      businessRowCount: 0,
    };
  } finally {
    db?.close();
  }
}

/** Exits successfully only when the shared production preflight is ready. */
function finishInitializationOrExit() {
  const readiness = checkDatabaseReadiness(dbPath, expectedSchemaVersion);
  if (!readiness.ready) {
    logStartupFailure(readiness.reason);
    console.error(
      "[seed] production initialization is incomplete; refusing to start.",
    );
    process.exit(1);
  }
  logStartup("initialization_completed");
  process.exit(0);
}

/** Runs the production database initialization decision. */
function main() {
  const schemaPolicy = readSchemaPolicy();
  expectedSchemaVersion = schemaPolicy.expectedSchemaVersion;
  fs.mkdirSync(dbDir, { recursive: true });

  let result = queryExistingDatabase();
  if (!result.needsSeed) {
    console.log(`[seed] ${result.reason}; leaving existing data intact.`);
    finishInitializationOrExit();
  }

  if (
    result.categoryCount > 0 &&
    schemaPolicy.additiveFrom.includes(result.schemaVersion)
  ) {
    console.log(
      `[seed] schema ${result.schemaVersion} is an additive predecessor; running migration before seed checks.`,
    );
    const migration = spawnSync("npm", ["run", "db:migrate"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (migration.status !== 0) {
      const exitCode = migration.status ?? 1;
      logMigrationFailure("migration_command_failed", exitCode);
      logStartupFailure("migration_command_failed", exitCode);
      process.exit(exitCode);
    }
    result = queryExistingDatabase();
    if (!result.needsSeed) {
      console.log(`[seed] ${result.reason}; leaving migrated data intact.`);
      finishInitializationOrExit();
    }
    logStartupFailure("migration_postcheck_failed");
    console.error(
      "[seed] additive migration did not produce a ready database. Refusing destructive reseed.",
    );
    process.exit(1);
  }

  if (!result.safeToSeed) {
    logStartupFailure(result.failureReason ?? "unsafe_seed_refused");
    console.error(
      "[seed] database state is not safe for an automatic sample reseed; back up and run an explicit migration or npm run db:seed only if replacement is intended.",
    );
    process.exit(1);
  }

  console.log(`[seed] ${result.reason}; running sample seed.`);
  const seed = spawnSync("npm", ["run", "db:seed"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (seed.status !== 0) {
    const exitCode = seed.status ?? 1;
    logStartupFailure("seed_command_failed", exitCode);
    process.exit(exitCode);
  }
  finishInitializationOrExit();
}

try {
  main();
} catch {
  logStartupFailure("initialization_failed");
  console.error("[seed] production initialization failed; refusing to start.");
  process.exitCode = 1;
}
