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
  e2eDatabaseRunFromMetadata,
  E2E_DATABASE_RUN_METADATA_KEY,
} from "./e2e-database";

const createdDirectories: string[] = [];

afterEach(() => {
  createdDirectories.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
});

// POSIX-only. `createE2EDatabaseRun` proves its isolation with Unix file
// semantics that Windows does not implement: a 0o700 private run directory
// (Windows reports 0o666/0o777 regardless of the requested mode, so the
// ownership check can never hold) and symlink fixtures (unprivileged
// symlink creation fails with EPERM outside Developer Mode). The harness
// under test only ever runs on the Linux Playwright job, so the suite is
// skipped rather than asserting weaker guarantees on Windows.
describe.skipIf(process.platform === "win32")("Playwright database isolation", () => {
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

// Runs on every platform: none of these depend on POSIX file semantics.
describe("Playwright database run portability", () => {
  /** Builds Playwright-shaped metadata around one run value. */
  function metadataFor(run: unknown) {
    return { [E2E_DATABASE_RUN_METADATA_KEY]: run };
  }

  it("records device and inode exactly, beyond Number.MAX_SAFE_INTEGER", () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-identity-"),
    );
    createdDirectories.push(temporaryDirectory);

    const run = createE2EDatabaseRun({ port: 3521, temporaryDirectory });
    createdDirectories.push(run.runDirectory);

    // 64-bit identifiers. A Windows NTFS file ID routinely exceeds 2^53, so
    // storing these as JS numbers rounds them and intermittently fails the
    // metadata check; strings round-trip exactly on every platform.
    expect(run.databaseDevice).toMatch(/^\d+$/u);
    expect(run.databaseInode).toMatch(/^\d+$/u);
    expect(e2eDatabaseRunFromMetadata(metadataFor(run))).toEqual(run);

    const beyondSafeInteger = "18446744073709551615";
    expect(Number.isSafeInteger(Number(beyondSafeInteger))).toBe(false);
    const wide = { ...run, databaseInode: beyondSafeInteger };
    expect(e2eDatabaseRunFromMetadata(metadataFor(wide)).databaseInode).toBe(
      beyondSafeInteger,
    );
  });

  it("rejects a run whose identity is not an exact integer string", () => {
    const base = {
      databasePath: path.join(os.tmpdir(), "eastern-state-kpi-playwright-1.db"),
      runDirectory: os.tmpdir(),
      ownershipToken: "token",
      databaseDevice: "1",
      databaseInode: "2",
    };
    for (const invalid of [1, "", "1.5", "-1", "0x10", " 1", null]) {
      expect(() =>
        e2eDatabaseRunFromMetadata(
          metadataFor({ ...base, databaseInode: invalid }),
        ),
      ).toThrow(/metadata is invalid/iu);
    }
  });

  it("sweeps an abandoned run directory but keeps a live one", () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "es-kpi-e2e-sweep-"),
    );
    createdDirectories.push(temporaryDirectory);

    // A hard kill (CI cancellation, Ctrl-C) skips teardown on every platform,
    // and on Windows teardown can also lose the database to a still-open
    // handle, so the temp root would otherwise gain a directory per run.
    const abandoned = fs.mkdtempSync(
      path.join(temporaryDirectory, "eastern-state-kpi-playwright-run-"),
    );
    const abandonedMarker = path.join(
      abandoned,
      ".eastern-state-kpi-e2e-owner.json",
    );
    fs.writeFileSync(abandonedMarker, "{}");
    const longAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    fs.utimesSync(abandonedMarker, longAgo, longAgo);

    const recent = fs.mkdtempSync(
      path.join(temporaryDirectory, "eastern-state-kpi-playwright-run-"),
    );
    fs.writeFileSync(path.join(recent, ".eastern-state-kpi-e2e-owner.json"), "{}");

    // Unrelated directories must never be selected, prefix or not.
    const unrelated = fs.mkdtempSync(path.join(temporaryDirectory, "operator-"));
    fs.writeFileSync(path.join(unrelated, "keep.txt"), "operator data");
    const prefixedWithoutMarker = fs.mkdtempSync(
      path.join(temporaryDirectory, "eastern-state-kpi-playwright-run-"),
    );

    const run = createE2EDatabaseRun({ port: 3522, temporaryDirectory });
    createdDirectories.push(run.runDirectory);

    expect(fs.existsSync(abandoned)).toBe(false);
    expect(fs.existsSync(recent)).toBe(true);
    expect(fs.existsSync(unrelated)).toBe(true);
    expect(fs.existsSync(prefixedWithoutMarker)).toBe(true);
  });
});
