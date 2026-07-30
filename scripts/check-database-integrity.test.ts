import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("database integrity operator command", () => {
  it("is exposed through the documented npm command", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["db:integrity"]).toBe(
      "node scripts/check-database-integrity.mjs",
    );
  });

  it("accepts a healthy database without changing it", () => {
    const databasePath = path.join(tempDirectory("healthy"), "kpi.db");
    const db = new DatabaseSync(databasePath);
    db.exec("CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES ('keep');");
    db.close();
    const before = digest(databasePath);

    const result = runIntegrityCheck(databasePath);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(
      "[integrity] database integrity check passed.\n",
    );
    expect(result.stderr).toBe("");
    expect(digest(databasePath)).toBe(before);
  });

  it("fails closed with bounded output for a corrupted database", () => {
    const databasePath = path.join(tempDirectory("corrupt"), "kpi.db");
    fs.writeFileSync(databasePath, "CORRUPTED-HEADER!");

    const result = runIntegrityCheck(databasePath);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "[integrity] database integrity check failed (integrity_check_failed).\n",
    );
    expect(result.stderr).not.toContain(databasePath);
    expect(result.stderr).not.toMatch(/sqlite|stack|malformed|corrupt/i);
  });

  it("fails closed with bounded output when the database is unavailable", () => {
    const databasePath = path.join(tempDirectory("missing"), "missing.db");

    const result = runIntegrityCheck(databasePath);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "[integrity] database integrity check failed (database_unavailable).\n",
    );
    expect(fs.existsSync(databasePath)).toBe(false);
  });
});

/** Runs the real operator command against the selected database. */
function runIntegrityCheck(databasePath: string) {
  return spawnSync(
    process.execPath,
    [path.join(process.cwd(), "scripts", "check-database-integrity.mjs")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
      },
    },
  );
}

/** Creates and tracks an isolated directory for one command invocation. */
function tempDirectory(name: string): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), `eastern-state-kpi-integrity-${name}-`),
  );
  tempDirectories.push(directory);
  return directory;
}

/** Calculates a stable digest for the command's read-only assertion. */
function digest(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
