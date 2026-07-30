import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const GUARD_PATH = path.join(
  process.cwd(),
  "scripts",
  "architecture-boundary-guard.sh",
);
const fixtureDirectories: string[] = [];

afterEach(() => {
  while (fixtureDirectories.length > 0) {
    const directory = fixtureDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

/** Writes the real architecture guard and one server-owned source fixture. */
function writeFixture(source: string): string {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "eskpi-architecture-guard-"),
  );
  fixtureDirectories.push(directory);
  mkdirSync(path.join(directory, "scripts"), { recursive: true });
  for (const sourceDirectory of [
    "src/app",
    "src/components",
    "src/features",
    "src/lib",
  ]) {
    mkdirSync(path.join(directory, sourceDirectory), { recursive: true });
  }
  copyFileSync(
    GUARD_PATH,
    path.join(directory, "scripts", "architecture-boundary-guard.sh"),
  );
  writeFileSync(path.join(directory, "src", "lib", "fixture.ts"), source);
  return directory;
}

/** Runs the copied guard so all relative scans stay inside the fixture tree. */
function runGuard(source: string) {
  const directory = writeFixture(source);
  return spawnSync("bash", ["./scripts/architecture-boundary-guard.sh"], {
    cwd: directory,
    encoding: "utf8",
  });
}

/** Asserts that one server self-HTTP fixture is rejected by the real guard. */
function expectSelfHttpRejected(source: string) {
  const result = runGuard(source);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain(
    "server-owned code calls the app's own API boundary",
  );
}

describe("architecture boundary server self-HTTP detection", () => {
  it("accepts a server fetch through a bare external URL identifier", () => {
    const result = runGuard(`
export async function loadExternal(url: string) {
  return fetch(url);
}
`);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Architecture boundary guard passed");
  });

  it("rejects a nearby bare identifier bound to an internal API path", () => {
    expectSelfHttpRejected(`
export async function loadInternal() {
  const url = "/api/strategy/export";
  return fetch(url);
}
`);
  });

  it("still rejects a direct multiline internal fetch", () => {
    expectSelfHttpRejected(`
export async function loadInternal() {
  return fetch(
    "/api/strategy/export",
  );
}
`);
  });

  it("still rejects apiFetch in server-owned code", () => {
    expectSelfHttpRejected(`
export async function loadInternal() {
  return apiFetch("/strategy/export");
}
`);
  });
});
