#!/usr/bin/env node
// Controlled npm install boundary.
//
// 1. Validate the exact lockfile lifecycle-script allowlist.
// 2. Install the lockfile with every lifecycle script disabled.
// 3. Verify the installed paths still match approved name@version identities.
// 4. Rebuild only those approved identities, in deterministic order.

import { existsSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadInstallScriptPolicy } from "./install-scripts-guard.mjs";

const OMIT_KINDS = new Set(["dev", "optional", "peer"]);

/** Parses the intentionally narrow npm-ci option surface. */
export function parseOmitArguments(args) {
  const omitted = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    let value;
    if (argument.startsWith("--omit=")) {
      value = argument.slice("--omit=".length);
    } else if (argument === "--omit") {
      value = args[index + 1];
      index += 1;
    } else {
      throw new Error(
        `Unsupported controlled-install argument: ${argument}. Only --omit=dev, --omit=peer, and --omit=optional are accepted.`,
      );
    }
    if (!value || !OMIT_KINDS.has(value)) {
      throw new Error(`Unsupported npm omit value: ${String(value)}`);
    }
    omitted.add(value);
  }
  return [...omitted].sort();
}

/** Runs npm without a shell so arguments remain literal on every platform. */
function runNpm(args, root) {
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(executable, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm ${args[0]} exited with status ${String(result.status)}`);
  }
}

/** Returns whether npm may legitimately omit this lockfile package. */
function mayBeOmitted(metadata, omitted) {
  return (
    metadata.optional === true ||
    (omitted.has("dev") &&
      (metadata.dev === true || metadata.devOptional === true)) ||
    (omitted.has("peer") && metadata.peer === true) ||
    (omitted.has("optional") && metadata.optional === true)
  );
}

/** Verifies installed executor identities and returns exact rebuild specs. */
export function approvedInstalledSpecs(root, executors, omittedKinds) {
  const omitted = new Set(omittedKinds);
  const specs = new Set();
  for (const executor of executors) {
    const packageDirectory = resolve(root, executor.lockKey);
    const pathFromRoot = relative(root, packageDirectory);
    if (
      pathFromRoot === ".." ||
      pathFromRoot.startsWith(`..${sep}`) ||
      resolve(root, pathFromRoot) !== packageDirectory
    ) {
      throw new Error(`Install-script package path escapes the repository: ${executor.lockKey}`);
    }
    const manifestPath = resolve(packageDirectory, "package.json");
    if (!existsSync(manifestPath)) {
      if (mayBeOmitted(executor.metadata, omitted)) continue;
      throw new Error(
        `Approved required install-script package is missing after npm ci: ${executor.identity} (${executor.lockKey})`,
      );
    }
    const installed = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (
      installed.name !== executor.name ||
      installed.version !== executor.version
    ) {
      throw new Error(
        `Installed lifecycle package identity mismatch at ${executor.lockKey}: ` +
          `expected ${executor.identity}, found ${String(installed.name)}@${String(installed.version)}`,
      );
    }
    specs.add(executor.identity);
  }
  return [...specs].sort();
}

/** Executes the controlled install; npmRunner is injectable for policy tests. */
export function runControlledInstall({
  root = process.cwd(),
  args = process.argv.slice(2),
  npmRunner = runNpm,
} = {}) {
  const omittedKinds = parseOmitArguments(args);
  // Validate before even the script-disabled install so malformed policy fails
  // without invoking npm at all.
  const { executors } = loadInstallScriptPolicy(root);
  const omitArgs = omittedKinds.map((kind) => `--omit=${kind}`);
  // OSV-Scanner is the repository's explicit advisory gate. Disable npm's
  // separate live audit/funding output here so a deterministic lockfile
  // install does not mix an unconfigured advisory feed into install evidence.
  npmRunner(
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund", ...omitArgs],
    root,
  );

  const specs = approvedInstalledSpecs(root, executors, omittedKinds);
  if (specs.length > 0) {
    npmRunner(
      [
        "rebuild",
        "--ignore-scripts=false",
        "--foreground-scripts",
        ...specs,
      ],
      root,
    );
  }
  return { executors: executors.length, rebuilt: specs };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const result = runControlledInstall();
    console.log(
      `✅ controlled dependency install passed: ${result.executors} approved executor row(s), ` +
        `${result.rebuilt.length} installed exact package identity/identities rebuilt.`,
    );
  } catch (error) {
    console.error(
      `Controlled dependency install failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
