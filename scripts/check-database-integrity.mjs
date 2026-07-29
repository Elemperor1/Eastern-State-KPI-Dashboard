import path from "node:path";
import { checkDatabaseIntegrity } from "../src/features/health/readiness-core.mjs";

/** Runs the bounded, read-only deep database integrity operator check. */
function main() {
  const databasePath =
    process.env.DATABASE_PATH ??
    path.resolve(process.cwd(), "data", "kpi.db");
  const result = checkDatabaseIntegrity(databasePath);
  if (result.integrity) {
    console.log("[integrity] database integrity check passed.");
    return;
  }
  console.error(
    `[integrity] database integrity check failed (${result.reason}).`,
  );
  process.exitCode = 1;
}

main();
