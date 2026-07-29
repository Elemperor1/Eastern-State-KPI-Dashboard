import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  configureConnectionPragmas,
  DB_BUSY_TIMEOUT_MS,
  getDb,
  resetDb,
} from "./db";

const testDirectories: string[] = [];
let previousDatabasePath: string | undefined;

afterEach(() => {
  resetDb();
  if (previousDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = previousDatabasePath;
  }
});

afterAll(() => {
  for (const directory of testDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("app connection busy_timeout (DB-002)", () => {
  it("configures an explicit bounded busy_timeout on the getDb connection", () => {
    const db = getDbFor("pragma-readback");

    // SQLite names the readback column `timeout` (not `busy_timeout`), so
    // read the first column value positionally.
    const row = db.prepare("PRAGMA busy_timeout").get() as
      | Record<string, number | bigint>
      | undefined;
    const readback = Number(Object.values(row ?? { timeout: 0 })[0] ?? 0);

    expect(readback).toBe(DB_BUSY_TIMEOUT_MS);
    expect(DB_BUSY_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DB_BUSY_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it(
    "waits out a short competing write lock instead of failing immediately",
    { timeout: 15_000 },
    async () => {
      const db = getDbFor("contended-writer");
      const dbPath = process.env.DATABASE_PATH as string;

      const holdMs = 400;
      const holder = new Worker(LOCK_HOLDER_SOURCE, {
        eval: true,
        workerData: { dbPath, holdMs },
      });
      await waitForMessage(holder, "locked");

      try {
        // Negative control: a raw connection without a busy timeout rejects
        // the same write immediately, proving the lock is genuinely held.
        const control = new DatabaseSync(dbPath);
        const controlStarted = Date.now();
        expect(() =>
          control.exec(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('busy_probe', 'control')",
          ),
        ).toThrow();
        expect(Date.now() - controlStarted).toBeLessThan(holdMs / 2);
        control.close();

        // The app connection must wait out the short lock and then succeed.
        const started = Date.now();
        db.exec(
          "INSERT OR REPLACE INTO meta (key, value) VALUES ('busy_probe', 'app')",
        );
        const elapsed = Date.now() - started;
        expect(elapsed).toBeGreaterThanOrEqual(holdMs / 2);

        await waitForMessage(holder, "released");
        expect(
          db.prepare("SELECT value FROM meta WHERE key = 'busy_probe'").get(),
        ).toEqual({ value: "app" });
      } finally {
        await holder.terminate();
      }
    },
  );
});

describe("app connection foreign-key enforcement", () => {
  it("still enables and verifies foreign keys when a tuning pragma fails", () => {
    const connection = pragmaConnection({
      failExec: "PRAGMA journal_mode = WAL;",
      foreignKeysReadback: 1,
    });

    expect(() => configureConnectionPragmas(connection.raw)).not.toThrow();
    expect(connection.execCalls).toContain("PRAGMA foreign_keys = ON;");
    expect(connection.prepareCalls).toContain("PRAGMA foreign_keys");
    expect(connection.closed).toBe(false);
  });

  it.each([
    {
      name: "enable",
      options: {
        failExec: "PRAGMA foreign_keys = ON;",
        foreignKeysReadback: 1,
      },
    },
    {
      name: "readback",
      options: {
        foreignKeysReadback: 0,
      },
    },
  ])("closes and aborts when foreign-key $name fails", ({ options }) => {
    const connection = pragmaConnection(options);

    expect(() => configureConnectionPragmas(connection.raw)).toThrow(
      /foreign-key enforcement/i,
    );
    expect(connection.closed).toBe(true);
  });
});

/**
 * Worker source: holds an exclusive write lock on the database for a
 * bounded time, posting "locked" once held and "released" after commit.
 */
const LOCK_HOLDER_SOURCE = `
  const { parentPort, workerData } = require("node:worker_threads");
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(workerData.dbPath);
  db.exec("BEGIN EXCLUSIVE");
  parentPort.postMessage("locked");
  setTimeout(() => {
    try {
      db.exec("COMMIT");
      db.close();
      parentPort.postMessage("released");
    } finally {
      process.exit(0);
    }
  }, workerData.holdMs);
`;

/** Opens the app connection against an isolated temporary database. */
function getDbFor(name: string) {
  previousDatabasePath = process.env.DATABASE_PATH;
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), `eastern-state-kpi-busy-${name}-`),
  );
  testDirectories.push(directory);
  process.env.DATABASE_PATH = path.join(directory, "kpi.db");
  resetDb();
  return getDb();
}

/** Resolves when the worker posts the expected message. */
function waitForMessage(worker: Worker, expected: string): Promise<void> {
  return new Promise((resolve, reject) => {
    /** Resolves the promise when the worker posts the expected message. */
    const onMessage = (message: unknown) => {
      if (message === expected) {
        worker.off("message", onMessage);
        resolve();
      }
    };
    worker.on("message", onMessage);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`lock-holder worker exited with code ${code}`));
      }
    });
  });
}

/** Builds a deterministic SQLite pragma connection double. */
function pragmaConnection(options: {
  failExec?: string;
  foreignKeysReadback: number;
}) {
  const execCalls: string[] = [];
  const prepareCalls: string[] = [];
  let closed = false;
  return {
    execCalls,
    prepareCalls,
    /** Reports whether the rejected connection was closed. */
    get closed() {
      return closed;
    },
    raw: {
      /** Records pragma execution and injects the requested failure. */
      exec(sql: string) {
        execCalls.push(sql);
        if (sql === options.failExec) {
          throw new Error("injected pragma failure");
        }
      },
      /** Returns the configured foreign-key readback. */
      prepare(sql: string) {
        prepareCalls.push(sql);
        return {
          /** Returns the configured pragma row. */
          get() {
            return { foreign_keys: options.foreignKeysReadback };
          },
        };
      },
      /** Records that the rejected connection was closed. */
      close() {
        closed = true;
      },
    },
  };
}
