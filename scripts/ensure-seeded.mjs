import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  checkDatabaseReadiness,
  REQUIRED_TABLES,
} from "../src/features/health/readiness-core.mjs";
import {
  logMigrationFailure,
  logStartup,
  logStartupFailure,
} from "./operational-log.mjs";

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), "data", "kpi.db");
const dbDir = path.dirname(dbPath);
const schemaVersionPath = path.resolve(process.cwd(), "src", "lib", "schema-version.json");
const tsxCliPath = path.resolve(
  process.cwd(),
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs",
);

/**
 * Runs a repository TypeScript operator script without depending on npm.
 *
 * The production image deliberately removes package-manager executables after
 * installing dependencies. `tsx` is a pinned runtime dependency, so startup
 * invokes its CLI through the current Node executable directly.
 */
function runTypeScriptOperatorScript(script, args = [], env = process.env) {
  return spawnSync(process.execPath, [tsxCliPath, script, ...args], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
}

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
    // Mirror the readiness gate's required-table list so a database that
    // retains rows in ANY KPI-owned sidecar (for example orphaned targets or
    // distribution values after an out-of-band catalog wipe) refuses the
    // automatic destructive reseed. meta/users are excluded: meta is
    // bookkeeping and the seed preserves/provisions users.
    const businessTables = REQUIRED_TABLES.filter(
      (table) => table !== "meta" && table !== "users",
    );
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
    const migration = runTypeScriptOperatorScript("scripts/migrate.ts");
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
  // This is the only automatic production seed path. Reaching it means the
  // probe above proved the database missing/empty and safe to initialize; pass
  // the seed command's explicit production acknowledgement together with the
  // exact resolved-path confirmation below. Any populated, unreadable, or
  // incompatible database has already failed closed.
  const seedArgs = ["--force"];
  const seed = runTypeScriptOperatorScript("scripts/seed.ts", seedArgs, {
    // S053-C1: the seed requires SEED_CONFIRM naming the exact database.
    // This probe has already established the reset is safe, so confirm
    // the resolved path on the operator's behalf.
    ...process.env,
    SEED_CONFIRM: path.resolve(dbPath),
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
