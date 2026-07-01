import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), "data", "kpi.db");
const dbDir = path.dirname(dbPath);
const schemaVersionPath = path.resolve(process.cwd(), "src", "lib", "schema-version.json");

function readExpectedSchemaVersion() {
  const raw = fs.readFileSync(schemaVersionPath, "utf8");
  const parsed = JSON.parse(raw);
  const version = Number(parsed.schemaVersion);
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(`Invalid schemaVersion in ${schemaVersionPath}`);
  }
  return version;
}

const expectedSchemaVersion = readExpectedSchemaVersion();

function queryExistingDatabase() {
  if (!fs.existsSync(dbPath)) return { needsSeed: true, reason: "database file is missing" };

  let db;
  try {
    db = new DatabaseSync(dbPath);
    const schemaRow = db
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get();
    const categoryRow = db.prepare("SELECT COUNT(*) AS count FROM categories").get();
    const sampleRow = db
      .prepare("SELECT value FROM meta WHERE key = 'sample_data'")
      .get();
    const schemaVersion = Number(schemaRow?.value ?? 0);
    const categoryCount = Number(categoryRow?.count ?? 0);
    const hasSampleFlag = String(sampleRow?.value ?? "") === "1";

    if (schemaVersion !== expectedSchemaVersion) {
      return {
        needsSeed: true,
        reason: `schema_version is ${schemaVersion || "missing"}; expected ${expectedSchemaVersion}`,
      };
    }
    if (categoryCount === 0) {
      return { needsSeed: true, reason: "database has no categories" };
    }
    if (!hasSampleFlag) {
      return { needsSeed: true, reason: "sample_data flag is missing" };
    }
    return { needsSeed: false, reason: `${categoryCount} categories already seeded` };
  } catch (error) {
    return { needsSeed: true, reason: `database check failed: ${error.message}` };
  } finally {
    db?.close();
  }
}

fs.mkdirSync(dbDir, { recursive: true });

const result = queryExistingDatabase();
if (!result.needsSeed) {
  console.log(`[seed] ${result.reason}; leaving existing data intact.`);
  process.exit(0);
}

console.log(`[seed] ${result.reason}; running sample seed.`);
const seed = spawnSync("npm", ["run", "db:seed"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (seed.status !== 0) {
  process.exit(seed.status ?? 1);
}
