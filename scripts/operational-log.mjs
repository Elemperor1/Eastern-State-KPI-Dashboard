import { pathToFileURL } from "node:url";
import { logStartup } from "../src/lib/operational-log-core.mjs";

export {
  logMigration,
  logMigrationFailure,
  logReadinessFailure,
  logStartup,
  logStartupFailure,
  logUnexpectedServerError,
} from "../src/lib/operational-log-core.mjs";

/** Handles the tiny startup logging CLI used by start-production.sh. */
function runCli() {
  if (process.argv[2] === "startup") {
    logStartup(process.argv[3]);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli();
}
