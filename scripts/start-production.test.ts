import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("production startup", () => {
  it("continues to Next when the best-effort startup logger fails", () => {
    const binDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "start-production-"),
    );
    tempDirectories.push(binDirectory);
    const fakeNode = path.join(binDirectory, "node");
    fs.writeFileSync(
      fakeNode,
      `#!/bin/sh
case "$1" in
  *ensure-seeded.mjs) exit 0 ;;
  *operational-log.mjs) exit 73 ;;
  *) printf '%s\\n' "next-started:$*"; exit 0 ;;
esac
`,
      { mode: 0o755 },
    );

    const result = spawnSync("bash", ["scripts/start-production.sh"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
        PORT: "3399",
      },
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain(
      "WARNING: startup status logging failed; continuing.",
    );
    expect(result.stdout).toMatch(
      /next-started:.*node_modules\/\.bin\/next start -H 0\.0\.0\.0 -p 3399/,
    );
  });
});
