import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";
import globalTeardown from "../e2e/global-teardown";
import {
  cleanupE2EDatabaseRun,
  createE2EDatabaseRun,
  e2eDatabaseFiles,
} from "./e2e-database";

const createdDirectories: string[] = [];

afterEach(() => {
  createdDirectories.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
});

describe("Playwright database isolation", () => {
  it("creates each default database inside a private unique run directory", () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-run-root-"),
    );
    createdDirectories.push(temporaryDirectory);

    const first = createE2EDatabaseRun({
      port: 3291,
      temporaryDirectory,
    });
    const second = createE2EDatabaseRun({
      port: 3291,
      temporaryDirectory,
    });

    expect(first.runDirectory).not.toBe(second.runDirectory);
    expect(path.dirname(first.runDirectory)).toBe(
      fs.realpathSync(temporaryDirectory),
    );
    expect(path.dirname(first.databasePath)).toBe(first.runDirectory);
    expect(path.basename(first.databasePath)).toBe(
      "eastern-state-kpi-playwright-3291.db",
    );
    expect(fs.lstatSync(first.runDirectory).mode & 0o777).toBe(0o700);
    const databaseStat = fs.lstatSync(first.databasePath);
    expect(databaseStat.isFile()).toBe(true);
    expect(databaseStat.nlink).toBe(1);
  });

  it("rejects an explicit database path outside the temporary directory", () => {
    expect(() => createE2EDatabaseRun({
      port: 3291,
      explicitPath: path.join(process.cwd(), "data", "kpi.db"),
      temporaryDirectory: "/tmp",
    })).toThrow(/must stay inside the temporary directory/i);
  });

  it("rejects a temporary-directory prefix lookalike", () => {
    expect(() => createE2EDatabaseRun({
      port: 3291,
      explicitPath: "/tmp-not-safe/operator.db",
      temporaryDirectory: "/tmp",
    })).toThrow(/must stay inside the temporary directory/i);
  });

  it("rejects an arbitrary existing-style database name inside the temp directory", () => {
    expect(() => createE2EDatabaseRun({
      port: 3291,
      explicitPath: "/tmp/important-operator-database.db",
      temporaryDirectory: "/tmp",
    })).toThrow(/must use the acceptance-test filename prefix/i);
  });

  it("refuses a symbolic-link override before reserving an E2E run", () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-create-symlink-"),
    );
    createdDirectories.push(temporaryDirectory);
    const externalDatabase = path.join(temporaryDirectory, "operator.db");
    const selectedPath = path.join(
      temporaryDirectory,
      "eastern-state-kpi-playwright-linked.db",
    );
    fs.writeFileSync(externalDatabase, "operator data");
    fs.symlinkSync(externalDatabase, selectedPath);

    expect(() => createE2EDatabaseRun({
      port: 3291,
      explicitPath: selectedPath,
      temporaryDirectory,
    })).toThrow(/must not already exist/i);
    expect(fs.readFileSync(externalDatabase, "utf8")).toBe("operator data");
  });

  it("refuses a hard-link override before reserving an E2E run", () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-create-hardlink-"),
    );
    createdDirectories.push(temporaryDirectory);
    const externalDatabase = path.join(temporaryDirectory, "operator.db");
    const selectedPath = path.join(
      temporaryDirectory,
      "eastern-state-kpi-playwright-linked.db",
    );
    fs.writeFileSync(externalDatabase, "operator data");
    fs.linkSync(externalDatabase, selectedPath);

    expect(() => createE2EDatabaseRun({
      port: 3291,
      explicitPath: selectedPath,
      temporaryDirectory,
    })).toThrow(/must not already exist/i);
    expect(fs.readFileSync(externalDatabase, "utf8")).toBe("operator data");
  });

  it("refuses existing regular and non-regular override paths", () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-create-existing-"),
    );
    createdDirectories.push(temporaryDirectory);
    const regularPath = path.join(
      temporaryDirectory,
      "eastern-state-kpi-playwright-existing.db",
    );
    const directoryPath = path.join(
      temporaryDirectory,
      "eastern-state-kpi-playwright-directory.db",
    );
    fs.writeFileSync(regularPath, "operator data");
    fs.mkdirSync(directoryPath);

    for (const explicitPath of [regularPath, directoryPath]) {
      expect(() => createE2EDatabaseRun({
        port: 3291,
        explicitPath,
        temporaryDirectory,
      })).toThrow(/must not already exist/i);
    }
  });

  it("refuses an override whose in-temp parent resolves outside the temp root", () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-create-parent-link-"),
    );
    const externalDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-external-parent-"),
    );
    createdDirectories.push(temporaryDirectory, externalDirectory);
    const linkedParent = path.join(temporaryDirectory, "linked-parent");
    fs.symlinkSync(externalDirectory, linkedParent);

    expect(() => createE2EDatabaseRun({
      port: 3291,
      explicitPath: path.join(
        linkedParent,
        "eastern-state-kpi-playwright-escaped.db",
      ),
      temporaryDirectory,
    })).toThrow(/must stay inside the temporary directory/i);
  });

  it("reserves a new explicit override as a singly linked regular file", async () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-create-explicit-"),
    );
    createdDirectories.push(temporaryDirectory);
    const explicitPath = path.join(
      temporaryDirectory,
      "eastern-state-kpi-playwright-selected.db",
    );

    const run = createE2EDatabaseRun({
      port: 3291,
      explicitPath,
      temporaryDirectory,
    });

    expect(run.databasePath).toBe(path.join(
      fs.realpathSync(temporaryDirectory),
      path.basename(explicitPath),
    ));
    const databaseStat = fs.lstatSync(run.databasePath);
    expect(databaseStat.isFile()).toBe(true);
    expect(databaseStat.nlink).toBe(1);
    await cleanupE2EDatabaseRun(run);
  });

  it("removes the owned database files and private run directory together", async () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-owned-cleanup-"),
    );
    createdDirectories.push(temporaryDirectory);
    const run = createE2EDatabaseRun({
      port: 3291,
      temporaryDirectory,
    });
    fs.writeFileSync(`${run.databasePath}-wal`, "temporary WAL");
    fs.writeFileSync(`${run.databasePath}-shm`, "temporary SHM");

    await cleanupE2EDatabaseRun(run);

    expect(e2eDatabaseFiles(run.databasePath).every(
      (file) => !fs.existsSync(file),
    )).toBe(true);
    expect(fs.existsSync(run.runDirectory)).toBe(false);
  });

  it("preserves files when cleanup metadata does not match the ownership marker", async () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-owner-mismatch-"),
    );
    createdDirectories.push(temporaryDirectory);
    const run = createE2EDatabaseRun({
      port: 3291,
      temporaryDirectory,
    });

    await expect(cleanupE2EDatabaseRun({
      ...run,
      ownershipToken: "forged-token",
    })).rejects.toThrow(/ownership marker does not match/i);

    expect(fs.existsSync(run.databasePath)).toBe(true);
    expect(fs.existsSync(run.runDirectory)).toBe(true);
  });

  it("global teardown cleans the exact owned run propagated in Playwright metadata", async () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-metadata-cleanup-"),
    );
    createdDirectories.push(temporaryDirectory);
    const run = createE2EDatabaseRun({
      port: 3291,
      temporaryDirectory,
    });
    const decoyPath = path.join(
      temporaryDirectory,
      "eastern-state-kpi-playwright-env-decoy.db",
    );
    fs.writeFileSync(decoyPath, "operator data");
    const previousOverride = process.env.E2E_DATABASE_PATH;
    process.env.E2E_DATABASE_PATH = decoyPath;
    try {
      await (globalTeardown as (config: FullConfig) => Promise<void>)({
        metadata: { e2eDatabaseRun: run },
      } as unknown as FullConfig);
    } finally {
      if (previousOverride === undefined) {
        delete process.env.E2E_DATABASE_PATH;
      } else {
        process.env.E2E_DATABASE_PATH = previousOverride;
      }
    }

    expect(fs.existsSync(run.databasePath)).toBe(false);
    expect(fs.existsSync(run.runDirectory)).toBe(false);
    expect(fs.readFileSync(decoyPath, "utf8")).toBe("operator data");
  });

});
