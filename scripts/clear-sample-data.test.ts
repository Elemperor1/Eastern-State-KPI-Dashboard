import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

/** Value-bearing tables the operator command must empty. */
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

/** Catalog tables that must survive with rows intact. */
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

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("sample-result clearing operator command", () => {
  it("matches the invocation the runbook tells the operator to run", () => {
    // The runbook is the only place this command is documented, so the two
    // must not drift apart.
    const runbook = fs.readFileSync(
      path.join(process.cwd(), "docs", "windows-server-deployment.md"),
      "utf8",
    );

    expect(runbook).toContain("node scripts\\clear-sample-data.mjs --dry-run");
    expect(runbook).toMatch(/node scripts\\clear-sample-data\.mjs *\r?\n/u);
  });

  it("refuses without a confirmation naming the exact resolved database", () => {
    const databasePath = seededSampleDatabase();
    const before = digest(databasePath);
    const valuesBefore = countRows(databasePath, VALUE_TABLES);

    const unconfirmed = runClear(databasePath, [], { CLEAR_CONFIRM: "" });
    expect(unconfirmed.status).toBe(1);
    expect(unconfirmed.stderr).toMatch(/CLEAR_CONFIRM/u);

    const wrong = runClear(databasePath, [], {
      CLEAR_CONFIRM: `${databasePath}.other`,
    });
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toMatch(/CLEAR_CONFIRM/u);

    expect(digest(databasePath)).toBe(before);
    expect(countRows(databasePath, VALUE_TABLES)).toEqual(valuesBefore);
  });

  it("reports what a dry run would remove without writing anything", () => {
    const databasePath = seededSampleDatabase();
    const before = digest(databasePath);
    const present = countRows(databasePath, VALUE_TABLES);
    const total = Object.values(present).reduce((sum, count) => sum + count, 0);

    const result = runClear(databasePath, ["--dry-run"]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`dry run: ${total} row(s) would be removed`);
    expect(digest(databasePath)).toBe(before);
    expect(countRows(databasePath, VALUE_TABLES)).toEqual(present);
    expect(readMeta(databasePath, "sample_data")).toBe("1");
    expect(readMeta(databasePath, "sample_data_cleared_at")).toBeNull();
  });

  it("empties every value table and leaves the catalog populated", () => {
    const databasePath = seededSampleDatabase();
    const catalogBefore = countRows(databasePath, CATALOG_TABLES);
    expect(
      Object.values(countRows(databasePath, VALUE_TABLES)).reduce((a, b) => a + b, 0),
    ).toBeGreaterThan(0);

    const result = runClear(databasePath);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("catalog intact and database ready");
    for (const [table, count] of Object.entries(countRows(databasePath, VALUE_TABLES))) {
      expect(count, table).toBe(0);
    }
    // The catalog is preserved exactly: this is not a reseed, so every
    // measure, component, target, and account survives untouched.
    expect(countRows(databasePath, CATALOG_TABLES)).toEqual(catalogBefore);
    expect(readMeta(databasePath, "sample_data")).toBe("0");
    expect(readMeta(databasePath, "sample_data_cleared_at")).toEqual(expect.any(String));
  });

  it("refuses a database that is not flagged as sample data", () => {
    // The sample_data gate only holds on an untouched sample database, so a
    // second run cannot wipe results a real installation has since reported.
    const databasePath = seededSampleDatabase();
    expect(runClear(databasePath).status).toBe(0);

    const again = runClear(databasePath);

    expect(again.status).toBe(1);
    expect(again.stderr).toMatch(/not flagged as sample data/u);
  });

  it("refuses a database whose schema does not match this checkout", () => {
    const databasePath = seededSampleDatabase();
    writeMeta(databasePath, "schema_version", "3");
    const before = digest(databasePath);

    const result = runClear(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Run the migration before clearing/u);
    expect(digest(databasePath)).toBe(before);
  });

  it("refuses while a plan activation holds the write pause", () => {
    const databasePath = seededSampleDatabase();
    writeMeta(databasePath, "plan_activation_write_pause", "1");

    const result = runClear(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/plan activation is in progress/u);
    expect(readMeta(databasePath, "sample_data")).toBe("1");
  });

  it("rolls the whole clear back when the post-delete verification fails", () => {
    // Emptying a catalog table means the catalog itself was damaged rather
    // than the sample results, so the transaction must abort with every
    // reported value still present.
    const databasePath = seededSampleDatabase();
    execute(databasePath, "DELETE FROM goal_kpis;");
    const valuesBefore = countRows(databasePath, VALUE_TABLES);
    expect(Object.values(valuesBefore).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

    const result = runClear(databasePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/catalog would be left empty in: goal_kpis/u);
    expect(countRows(databasePath, VALUE_TABLES)).toEqual(valuesBefore);
    expect(readMeta(databasePath, "sample_data")).toBe("1");
    expect(readMeta(databasePath, "sample_data_cleared_at")).toBeNull();
    // The internal write flag is part of the same transaction, so a rollback
    // must not leave the plan-state guards disarmed.
    expect(readMeta(databasePath, "seed_reset_internal_write")).not.toBe("1");
  });

  it("rejects arguments outside the documented operator surface", () => {
    const databasePath = seededSampleDatabase();

    const result = runClear(databasePath, ["--force"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unsupported argument: --force/u);
  });

  it("refuses when DATABASE_PATH names no existing database", () => {
    const missing = path.join(tempDirectory("missing"), "kpi.db");

    const result = runClear(missing);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/No database exists at/u);
    expect(fs.existsSync(missing)).toBe(false);
  });
});

/** Builds a real seeded sample database matching the production schema. */
function seededSampleDatabase(): string {
  const databasePath = path.join(tempDirectory("seeded"), "kpi.db");
  const seeded = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/seed.ts"],
    {
      cwd: process.cwd(),
      // The destructive seed requires SEED_CONFIRM naming the exact resolved
      // database; these disposable test databases are deliberate targets.
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        SEED_CONFIRM: databasePath,
      },
      encoding: "utf8",
    },
  );
  expect(seeded.status, seeded.stderr).toBe(0);
  expect(readMeta(databasePath, "sample_data")).toBe("1");
  return databasePath;
}

/** Runs the real operator command against the selected database. */
function runClear(
  databasePath: string,
  args: string[] = [],
  env: Record<string, string> = {},
) {
  return spawnSync(
    process.execPath,
    [path.join(process.cwd(), "scripts", "clear-sample-data.mjs"), ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        CLEAR_CONFIRM: path.resolve(databasePath),
        ...env,
      },
    },
  );
}

/** Creates and tracks an isolated directory for one database fixture. */
function tempDirectory(name: string): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), `eastern-state-kpi-clear-${name}-`),
  );
  tempDirectories.push(directory);
  return directory;
}

/** Counts rows in each named table. */
function countRows(databasePath: string, tables: string[]): Record<string, number> {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const counts: Record<string, number> = {};
    for (const table of tables) {
      counts[table] = Number(
        (db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as
          | { count: number }
          | undefined)?.count ?? 0,
      );
    }
    return counts;
  } finally {
    db.close();
  }
}

/** Reads one meta value, or null when the key is absent. */
function readMeta(databasePath: string, key: string): string | null {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  } finally {
    db.close();
  }
}

/** Writes one meta value directly into a fixture database. */
function writeMeta(databasePath: string, key: string, value: string): void {
  const db = new DatabaseSync(databasePath);
  try {
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
  } finally {
    db.close();
  }
}

/** Applies one statement directly to a fixture database. */
function execute(databasePath: string, statement: string): void {
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(statement);
  } finally {
    db.close();
  }
}

/** Calculates a stable digest for the no-write assertions. */
function digest(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
