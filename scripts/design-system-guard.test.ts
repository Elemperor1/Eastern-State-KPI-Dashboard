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

/**
 * S048-C4: the design-system guard passes its className regex through
 * Bash into Perl. These disposable fixture tests prove that the escaped
 * backticks are literal regex characters rather than command-substitution
 * delimiters and that template-literal class bypasses remain detectable.
 */

const GUARD_PATH = path.join(process.cwd(), "scripts", "design-system-guard.sh");
const fixtureDirectories: string[] = [];

afterEach(() => {
  while (fixtureDirectories.length > 0) {
    const directory = fixtureDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

/** Writes the real guard and one source file into a disposable repository. */
function writeFixture(source: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "eskpi-design-guard-"));
  fixtureDirectories.push(directory);
  mkdirSync(path.join(directory, "scripts"), { recursive: true });
  mkdirSync(path.join(directory, "src", "app"), { recursive: true });
  mkdirSync(path.join(directory, "src", "components"), { recursive: true });
  copyFileSync(GUARD_PATH, path.join(directory, "scripts", "design-system-guard.sh"));
  writeFileSync(path.join(directory, "src", "app", "fixture.tsx"), source);
  return directory;
}

/** Runs the copied real guard so its relative-root behavior targets the fixture. */
function runGuard(directory: string) {
  return spawnSync("bash", ["./scripts/design-system-guard.sh"], {
    cwd: directory,
    encoding: "utf8",
  });
}

describe("design-system-guard shell quoting", () => {
  it("rejects a primitive class in a JSX template literal without shell substitution", () => {
    const directory = writeFixture(
      "export const Fixture = () => <div className={`surface elevated`} />;\n",
    );

    const result = runGuard(directory);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("surface class used outside library");
    expect(result.stderr).not.toMatch(/command not found|unexpected EOF|bad substitution/i);
  });

  it("accepts a source file without primitive classes", () => {
    const result = runGuard(
      writeFixture(
        "export const Fixture = () => <div className={`layout-shell elevated`} />;\n",
      ),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Design System guard passed");
    expect(result.stderr).toBe("");
  });
});
