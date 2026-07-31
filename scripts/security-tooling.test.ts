import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dockerDaemon,
  resolveScanner,
  run,
} from "./security-tooling.mjs";

// Regression suite for finding S052-C1: scanner resolution admits only the
// digest-pinned Docker path and fails closed even when a local executable
// claims the expected version. Version text is not provenance evidence.

const SCANNER_NAME = "r09-fixture-scanner";
const PINNED_VERSION = "8.30.1";

let fixtureDir: string;
let repositoryFixtureDir: string | null;
let savedPath: string | undefined;

/** Writes an executable fixture script into the fixture directory. */
function makeExecutable(
  name: string,
  body: string,
  directory = fixtureDir,
): string {
  const filePath = join(directory, name);
  writeFileSync(filePath, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  chmodSync(filePath, 0o755);
  return filePath;
}

/** Points PATH at the fixture directory only (plus /usr/bin for sh/coreutils). */
function useFixturePath(): void {
  process.env.PATH = `${fixtureDir}:/usr/bin:/bin`;
}

/** Points PATH at the fixture directory only, proving no host tool can leak in. */
function useIsolatedFixturePath(): void {
  process.env.PATH = fixtureDir;
}

beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), "r09-scanner-fixture-"));
  repositoryFixtureDir = null;
  savedPath = process.env.PATH;
});

afterEach(() => {
  if (savedPath === undefined) {
    delete process.env.PATH;
  } else {
    process.env.PATH = savedPath;
  }
  rmSync(fixtureDir, { recursive: true, force: true });
  if (repositoryFixtureDir) {
    rmSync(repositoryFixtureDir, { recursive: true, force: true });
  }
});

// POSIX-only: these cases prove scanner resolution against `#!/bin/sh`
// fixtures placed on PATH, and the code under test spawns the resolved
// executable directly. Windows cannot execute an extensionless shell
// script through CreateProcess, so the fixtures would never run and the
// assertions would pass or fail for reasons unrelated to S052-C1. The
// security scans themselves run only on the Linux CI jobs.
describe.skipIf(process.platform === "win32")("resolveScanner", () => {
  it("prefers Docker even when a shadow scanner binary is present", () => {
    makeExecutable("docker", 'if [ "$1" = "info" ]; then exit 0; fi; exit 1');
    makeExecutable(SCANNER_NAME, "exit 0");
    useFixturePath();
    const resolution = resolveScanner(SCANNER_NAME, PINNED_VERSION);
    expect(resolution.kind).toBe("docker");
  });

  it("refuses a shadow binary when Docker is unavailable", () => {
    makeExecutable("docker", "exit 1");
    makeExecutable(SCANNER_NAME, "exit 0");
    useFixturePath();
    expect(() => resolveScanner(SCANNER_NAME, PINNED_VERSION)).toThrow(
      /local binaries are not accepted/u,
    );
  });

  it("refuses an exact-version local binary because version text is not provenance", () => {
    makeExecutable("docker", "exit 1");
    makeExecutable(SCANNER_NAME, `echo "${SCANNER_NAME} version ${PINNED_VERSION}"`);
    useFixturePath();
    expect(() => resolveScanner(SCANNER_NAME, PINNED_VERSION)).toThrow(
      /version output does not verify executable provenance/u,
    );
  });

  it("fails closed when Docker is unavailable", () => {
    makeExecutable("docker", "exit 1");
    useFixturePath();
    expect(() => resolveScanner(SCANNER_NAME, PINNED_VERSION)).toThrow(
      /must run from its repository-pinned image digest/u,
    );
  });

  it("refuses a local binary when Docker is absent from PATH", () => {
    makeExecutable(SCANNER_NAME, `echo "${SCANNER_NAME} version ${PINNED_VERSION}"`);
    useIsolatedFixturePath();
    expect(() => resolveScanner(SCANNER_NAME, PINNED_VERSION)).toThrow(
      /Docker is unavailable/u,
    );
  });
});

// POSIX-only for the same reason as `resolveScanner` above: the Docker
// shim fixtures are shell scripts that Windows cannot execute.
describe.skipIf(process.platform === "win32")("dockerDaemon", () => {
  it("ignores a repository-owned Docker shim and uses an external executable", () => {
    repositoryFixtureDir = mkdtempSync(
      join(process.cwd(), ".security-tooling-fixture-"),
    );
    makeExecutable("docker", "exit 0", repositoryFixtureDir);
    const externalDocker = makeExecutable(
      "docker",
      'if [ "$1" = "info" ]; then exit 0; fi; exit 1',
    );
    process.env.PATH = `${repositoryFixtureDir}:${fixtureDir}:/usr/bin:/bin`;

    expect(dockerDaemon()).toBe(externalDocker);
  });

  it("fails closed when the Docker daemon probe exceeds its timeout", () => {
    makeExecutable("docker", "sleep 1; exit 0");
    useFixturePath();

    expect(dockerDaemon(25)).toBeNull();
  });
});

describe("run environment scrubbing", () => {
  const probe = "process.exit(process.env.GITLEAKS_CONFIG ? 1 : 0)";

  it("strips blocked env prefixes from the child environment", () => {
    process.env.GITLEAKS_CONFIG = "/tmp/r09-shadow-config.toml";
    try {
      expect(() =>
        run(process.execPath, ["-e", probe], {
          stripEnvPrefixes: ["GITLEAKS_CONFIG"],
        }),
      ).not.toThrow();
    } finally {
      delete process.env.GITLEAKS_CONFIG;
    }
  });

  it("passes the variable through when no strip list is given", () => {
    process.env.GITLEAKS_CONFIG = "/tmp/r09-shadow-config.toml";
    try {
      expect(() => run(process.execPath, ["-e", probe])).toThrow();
    } finally {
      delete process.env.GITLEAKS_CONFIG;
    }
  });
});
