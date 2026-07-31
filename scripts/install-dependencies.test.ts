import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approvedInstalledSpecs,
  resolveNpmCli,
  runControlledInstall,
} from "./install-dependencies.mjs";

let directory = "";

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "eskpi-controlled-install-"));
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Writes the minimum package and lock manifests for one lifecycle executor. */
function writePolicy(allowed: boolean, metadata: Record<string, unknown> = {}): void {
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({
      name: "fixture",
      version: "1.0.0",
      allowScripts: allowed ? { "approved-package@1.2.3": true } : {},
    }),
  );
  fs.writeFileSync(
    path.join(directory, "package-lock.json"),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "fixture", version: "1.0.0" },
        "node_modules/approved-package": {
          version: "1.2.3",
          hasInstallScript: true,
          ...metadata,
        },
      },
    }),
  );
}

describe("controlled dependency install", () => {
  it("fails before invoking npm when a lockfile executor is not approved", () => {
    writePolicy(false);
    const npmRunner = vi.fn();

    expect(() =>
      runControlledInstall({ root: directory, npmRunner }),
    ).toThrow(/not in the package\.json allowScripts allowlist/u);
    expect(npmRunner).not.toHaveBeenCalled();
  });

  it("installs with scripts disabled, then rebuilds only the approved exact identity", () => {
    writePolicy(true);
    const npmRunner = vi.fn((args: string[]) => {
      if (args[0] !== "ci") return;
      const packageDirectory = path.join(
        directory,
        "node_modules",
        "approved-package",
      );
      fs.mkdirSync(packageDirectory, { recursive: true });
      fs.writeFileSync(
        path.join(packageDirectory, "package.json"),
        JSON.stringify({ name: "approved-package", version: "1.2.3" }),
      );
    });

    const result = runControlledInstall({ root: directory, npmRunner });

    expect(npmRunner.mock.calls).toEqual([
      [
        ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
        directory,
      ],
      [
        [
          "rebuild",
          "--ignore-scripts=false",
          "--foreground-scripts",
          "approved-package@1.2.3",
        ],
        directory,
      ],
    ]);
    expect(result.rebuilt).toEqual(["approved-package@1.2.3"]);
  });

  it("preserves absent optional and omitted development executors", () => {
    writePolicy(true, { optional: true, os: ["darwin"] });
    expect(
      approvedInstalledSpecs(
        directory,
        [
          {
            identity: "approved-package@1.2.3",
            lockKey: "node_modules/approved-package",
            name: "approved-package",
            version: "1.2.3",
            metadata: { optional: true, os: ["darwin"] },
          },
        ],
        [],
      ),
    ).toEqual([]);

    writePolicy(true, { dev: true });
    const npmRunner = vi.fn();
    runControlledInstall({
      root: directory,
      args: ["--omit=dev"],
      npmRunner,
    });
    expect(npmRunner).toHaveBeenCalledTimes(1);
    expect(npmRunner).toHaveBeenCalledWith(
      [
        "ci",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--omit=dev",
      ],
      directory,
    );
  });

  // Windows cannot spawn npm.cmd with shell: false, so the installer runs
  // npm's CLI file with the current Node binary instead of the launcher shim.
  it("resolves npm's CLI file beside the Node executable", () => {
    const nodeDirectory = path.join(directory, "node-install");
    const cli = path.join(
      nodeDirectory,
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, "");

    expect(resolveNpmCli("", path.join(nodeDirectory, "node.exe"))).toBe(cli);
    expect(resolveNpmCli(nodeDirectory, path.join(directory, "node.exe"))).toBe(
      cli,
    );
    expect(() => resolveNpmCli("", path.join(directory, "node.exe"))).toThrow(
      /npm's CLI entry point was not found/u,
    );
  });
});
