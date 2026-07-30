import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * D8AD-CAN-002 / S048-C3: `scripts/auth-bypass-guard.sh` is the CI
 * assertion that no supported deployment configuration can enable the
 * AUTH_DISABLED anonymous-admin bypass. The guard previously filtered
 * start-production.sh through a pattern that required a non-comment
 * character BEFORE the AUTH_DISABLED token, so the canonical assignment
 * form (`AUTH_DISABLED=true`, including indented variants) was invisible
 * to it, and a falsey first assignment on a line could mask a truthy
 * second one. These tests run the real script against disposable
 * fixture trees so every documented evasion form fails the guard while
 * legitimate deployments keep passing.
 */

const GUARD_PATH = path.join(process.cwd(), "scripts", "auth-bypass-guard.sh");

const CLEAN_FLY_TOML = `app = "eastern-state-kpi"

[env]
  NODE_ENV = "production"
  SESSION_SECURE = "true"
`;

const CLEAN_DOCKERFILE = `FROM node:26
ENV NODE_ENV=production
CMD ["npm", "start"]
`;

const CLEAN_START_PRODUCTION = `#!/usr/bin/env bash
set -euo pipefail
exec node_modules/.bin/next start -H 0.0.0.0 -p "\${PORT:-3000}"
`;

interface FixtureOverrides {
  flyToml?: string;
  dockerfile?: string;
  startProduction?: string;
}

const fixtureDirectories: string[] = [];

afterEach(() => {
  while (fixtureDirectories.length > 0) {
    const directory = fixtureDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

/** Writes a disposable deployment-fixture tree for one guard invocation. */
function writeFixture(overrides: FixtureOverrides = {}): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "eskpi-auth-bypass-guard-"));
  fixtureDirectories.push(directory);
  mkdirSync(path.join(directory, "scripts"), { recursive: true });
  writeFileSync(path.join(directory, "fly.toml"), overrides.flyToml ?? CLEAN_FLY_TOML);
  writeFileSync(path.join(directory, "Dockerfile"), overrides.dockerfile ?? CLEAN_DOCKERFILE);
  writeFileSync(
    path.join(directory, "scripts", "start-production.sh"),
    overrides.startProduction ?? CLEAN_START_PRODUCTION,
  );
  return directory;
}

/** Implements the run guard test scenario. */
function runGuard(directory: string) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  return spawnSync("bash", [GUARD_PATH], {
    cwd: directory,
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
}

/** Supports the expect rejected test scenario. */
function expectRejected(directory: string) {
  const result = runGuard(directory);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("auth-bypass-guard");
}

/** Supports the expect accepted test scenario. */
function expectAccepted(directory: string) {
  const result = runGuard(directory);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("auth-bypass-guard passed");
}

describe("auth-bypass-guard", () => {
  it("accepts a clean deployment configuration", () => {
    expectAccepted(writeFixture());
  });

  it("rejects a first-token AUTH_DISABLED=true assignment in start-production.sh", () => {
    expectRejected(
      writeFixture({
        startProduction: `#!/usr/bin/env bash
AUTH_DISABLED=true
exec node_modules/.bin/next start
`,
      }),
    );
  });

  it("rejects an indented AUTH_DISABLED=true assignment in start-production.sh", () => {
    expectRejected(
      writeFixture({
        startProduction: `#!/usr/bin/env bash
if true; then
  AUTH_DISABLED=true
fi
exec node_modules/.bin/next start
`,
      }),
    );
  });

  it("rejects a falsey decoy line followed by a truthy assignment line", () => {
    expectRejected(
      writeFixture({
        startProduction: `#!/usr/bin/env bash
AUTH_DISABLED=false
AUTH_DISABLED=true
exec node_modules/.bin/next start
`,
      }),
    );
  });

  it("rejects a same-line falsey decoy followed by a truthy assignment", () => {
    expectRejected(
      writeFixture({
        startProduction: `#!/usr/bin/env bash
AUTH_DISABLED=false ; AUTH_DISABLED=true
exec node_modules/.bin/next start
`,
      }),
    );
  });

  it("rejects an exported truthy assignment", () => {
    expectRejected(
      writeFixture({
        startProduction: `#!/usr/bin/env bash
export AUTH_DISABLED=true
exec node_modules/.bin/next start
`,
      }),
    );
  });

  it("rejects a shell default-assign expansion that enables the bypass", () => {
    expectRejected(
      writeFixture({
        startProduction: `#!/usr/bin/env bash
: "\${AUTH_DISABLED:=true}"
exec node_modules/.bin/next start
`,
      }),
    );
  });

  it.each(["false", "0", "off", "no"])(
    "accepts a shell default-assign expansion with the falsey value %s",
    (value) => {
      expectAccepted(
        writeFixture({
          startProduction: `#!/usr/bin/env bash
: "\${AUTH_DISABLED:=${value}}"
exec node_modules/.bin/next start
`,
        }),
      );
    },
  );

  it.each(["true", "1", "on", "yes"])(
    "rejects a shell default-assign expansion with the truthy value %s",
    (value) => {
      expectRejected(
        writeFixture({
          startProduction: `#!/usr/bin/env bash
: "\${AUTH_DISABLED:=${value}}"
exec node_modules/.bin/next start
`,
        }),
      );
    },
  );

  it("accepts the no-colon assignment expansion with a falsey value", () => {
    expectAccepted(
      writeFixture({
        startProduction: `#!/usr/bin/env bash
: "\${AUTH_DISABLED=false}"
exec node_modules/.bin/next start
`,
      }),
    );
  });

  it("rejects the no-colon assignment expansion with a truthy value", () => {
    expectRejected(
      writeFixture({
        startProduction: `#!/usr/bin/env bash
: "\${AUTH_DISABLED=yes}"
exec node_modules/.bin/next start
`,
      }),
    );
  });

  it("accepts an empty shell default-assignment", () => {
    expectAccepted(
      writeFixture({
        startProduction: `#!/usr/bin/env bash
: "\${AUTH_DISABLED:=}"
exec node_modules/.bin/next start
`,
      }),
    );
  });

  it("accepts a quoted falsey shell default-assignment", () => {
    expectAccepted(
      writeFixture({
        startProduction: `#!/usr/bin/env bash
: "\${AUTH_DISABLED:='false'}"
exec node_modules/.bin/next start
`,
      }),
    );
  });

  it("accepts comment-only mentions, explicit false, and read-only expansions", () => {
    expectAccepted(
      writeFixture({
        startProduction: `#!/usr/bin/env bash
# AUTH_DISABLED=true must never ship here
AUTH_DISABLED=false
if [ -n "\${AUTH_DISABLED:-}" ]; then
  printf '%s\\n' 'bypass flag present'
fi
exec node_modules/.bin/next start
`,
      }),
    );
  });

  it("rejects ENV AUTH_DISABLED=true in the Dockerfile", () => {
    expectRejected(
      writeFixture({
        dockerfile: `FROM node:26
ENV NODE_ENV=production
ENV AUTH_DISABLED=true
CMD ["npm", "start"]
`,
      }),
    );
  });

  it("rejects AUTH_DISABLED=true hidden on a Dockerfile continuation line", () => {
    expectRejected(
      writeFixture({
        dockerfile: `FROM node:26
ENV NODE_ENV=production
ENV EXTRA=1 \\
  AUTH_DISABLED=true
CMD ["npm", "start"]
`,
      }),
    );
  });

  it("rejects the legacy space-separated ENV form in the Dockerfile", () => {
    expectRejected(
      writeFixture({
        dockerfile: `FROM node:26
ENV NODE_ENV=production
ENV AUTH_DISABLED true
CMD ["npm", "start"]
`,
      }),
    );
  });

  it("accepts a falsey Dockerfile value and comment-only mentions", () => {
    expectAccepted(
      writeFixture({
        dockerfile: `FROM node:26
ENV NODE_ENV=production
# AUTH_DISABLED=true must never be baked into the image
ENV AUTH_DISABLED=false
CMD ["npm", "start"]
`,
      }),
    );
  });

  it("rejects a truthy AUTH_DISABLED value in fly.toml [env]", () => {
    expectRejected(
      writeFixture({
        flyToml: `app = "eastern-state-kpi"

[env]
  NODE_ENV = "production"
  AUTH_DISABLED = "true"
`,
      }),
    );
  });

  it("accepts a falsey AUTH_DISABLED value in fly.toml [env]", () => {
    expectAccepted(
      writeFixture({
        flyToml: `app = "eastern-state-kpi"

[env]
  NODE_ENV = "production"
  AUTH_DISABLED = "false"
`,
      }),
    );
  });
});
