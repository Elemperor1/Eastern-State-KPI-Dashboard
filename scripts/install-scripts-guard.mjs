#!/usr/bin/env node
// Exact dependency lifecycle-script policy (security finding S046-C2).
//
// npm installs are performed by scripts/install-dependencies.mjs with
// --ignore-scripts. This module validates every lockfile hasInstallScript row
// against package.json allowScripts before the controlled installer replays
// lifecycle builds for approved exact name@version identities.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Reads and parses a JSON file below the supplied repository root. */
function readJson(root, relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

/** Extracts the package name from a lockfile `packages` key. */
export function packageNameFromLockKey(lockKey) {
  const marker = "node_modules/";
  const index = lockKey.lastIndexOf(marker);
  return index === -1 ? lockKey : lockKey.slice(index + marker.length);
}

/** Lists every lockfile package that ships a lifecycle install script. */
export function lockfileInstallExecutors(lock) {
  return Object.entries(lock.packages ?? {})
    .filter(([, entry]) => entry?.hasInstallScript === true)
    .map(([lockKey, entry]) => {
      const name = packageNameFromLockKey(lockKey);
      const version = entry.version;
      return {
        identity: `${name}@${String(version)}`,
        lockKey,
        name,
        version,
        metadata: entry,
      };
    })
    .sort((left, right) =>
      left.lockKey.localeCompare(right.lockKey, "en"),
    );
}

/**
 * Loads and validates the exact install-script policy.
 *
 * Returns the approved executor rows for the controlled install wrapper.
 */
export function loadInstallScriptPolicy(root = process.cwd()) {
  const lock = readJson(root, "package-lock.json");
  const pkg = readJson(root, "package.json");
  const allowlist = new Set(
    Object.entries(pkg.allowScripts ?? {})
      .filter(([, allowed]) => allowed === true)
      .map(([identity]) => identity),
  );
  const executors = lockfileInstallExecutors(lock);
  const executorIdentities = new Set(executors.map(({ identity }) => identity));
  const violations = [];

  for (const executor of executors) {
    if (
      !executor.name ||
      typeof executor.version !== "string" ||
      !allowlist.has(executor.identity)
    ) {
      violations.push(
        `lockfile install-script executor '${executor.identity}' (${executor.lockKey}) ` +
          "is not in the package.json allowScripts allowlist",
      );
    }
  }
  for (const allowed of [...allowlist].sort()) {
    if (!executorIdentities.has(allowed)) {
      violations.push(
        `allowScripts entry '${allowed}' has no matching lockfile install-script ` +
          "executor (stale allowlist entry — remove it or restore the dependency)",
      );
    }
  }

  if (violations.length > 0) {
    throw new Error(
      "install-scripts-guard: FAILED — dependency lifecycle scripts drifted:\n" +
        violations.map((violation) => `  - ${violation}`).join("\n"),
    );
  }
  return { allowlist, executors, lock, pkg };
}

/** Runs the standalone policy check. */
export function main() {
  const { executors } = loadInstallScriptPolicy();
  console.log(
    `✅ install-scripts-guard passed: ${executors.length} lockfile install-script ` +
      "executor(s) exactly match the allowScripts allowlist.",
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
