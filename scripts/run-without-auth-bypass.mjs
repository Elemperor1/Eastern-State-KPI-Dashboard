#!/usr/bin/env node
// Runs a fixed verification task with the AUTH_DISABLED bypass cleared.
//
// The npm scripts previously used the POSIX inline env-var prefix
// (`AUTH_DISABLED= next typegen`). npm runs scripts through cmd.exe on
// Windows, which has no such syntax, so `npm run typecheck` — and with it
// the whole `design-system:test` CI gate — failed with
// `'AUTH_DISABLED' is not recognized as an internal or external command`
// before doing any work.
//
// Clearing the variable is the point of the prefix: `next.config.mjs`
// refuses a production build while the anonymous-admin bypass is set
// (D8AD-CAN-002), and typegen/build must therefore never inherit a
// developer's `AUTH_DISABLED=true`. Deleting the key is equivalent to the
// empty-string assignment the prefix performed — both `authFlagIsSet` and
// `src/lib/auth-flag.ts` treat unset and empty identically.
//
// Tasks are a fixed table rather than an arbitrary command line: this
// runner exists to clear one env var, not to become a general shell.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveNpmCli } from "./install-dependencies.mjs";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Resolves a repository-local JavaScript CLI entry point. */
function localCli(...segments) {
  const cli = join(APP_ROOT, "node_modules", ...segments);
  if (!existsSync(cli)) {
    throw new Error(
      `Required CLI entry point is missing: ${segments.join("/")}. Run the controlled dependency install first.`,
    );
  }
  return cli;
}

/**
 * The exact verification tasks that must not inherit AUTH_DISABLED.
 *
 * Repository-local tools resolve to a JavaScript entry point run with the
 * current Node binary, so no `.cmd` shim or shell is involved anywhere.
 * `npm` is not repository-local: it ships beside the Node installation,
 * and only Windows needs the CLI-file treatment.
 */
const TASKS = {
  "next-typegen": { cli: ["next", "dist", "bin", "next"], args: ["typegen"] },
  tsc: { cli: ["typescript", "bin", "tsc"], args: ["--noEmit"] },
  build: { cli: null, args: ["run", "build"] },
};

/**
 * Resolves one task name to the executable and argument vector to spawn.
 *
 * The npm task stays platform-aware, mirroring
 * `scripts/install-dependencies.mjs`: POSIX layouts put the CLI under
 * `<prefix>/lib/node_modules/npm`, which `resolveNpmCli()` deliberately
 * does not probe (it exists to dodge the Windows `npm.cmd` EINVAL), so
 * calling it on Linux would fail the required CI gate before the
 * production build ever started.
 */
export function resolveTask(name, platform = process.platform) {
  const task = TASKS[name];
  if (task.cli === null) {
    return platform === "win32"
      ? [process.execPath, [resolveNpmCli(), ...task.args]]
      : ["npm", task.args];
  }
  return [process.execPath, [localCli(...task.cli), ...task.args]];
}

/** Parses the fixed task-name argument surface. */
export function parseTaskNames(args) {
  if (args.length === 0) {
    throw new Error(
      `At least one task is required. Supported tasks: ${Object.keys(TASKS).sort().join(", ")}.`,
    );
  }
  for (const name of args) {
    if (!Object.hasOwn(TASKS, name)) {
      throw new Error(
        `Unsupported task: ${name}. Supported tasks: ${Object.keys(TASKS).sort().join(", ")}.`,
      );
    }
  }
  return args;
}

/**
 * Returns the process environment with the auth bypass cleared.
 *
 * Every key whose uppercase form is `AUTH_DISABLED` is removed, not just
 * the exact-case one. Windows environment lookup is case-insensitive, so
 * an inherited `auth_disabled=true` would survive a case-sensitive delete
 * on the spread copy and still be visible to the child as
 * `process.env.AUTH_DISABLED` — re-arming the bypass the gate exists to
 * clear.
 *
 * @param {Record<string, string | undefined>} [inherited]
 * @returns {Record<string, string | undefined>}
 */
export function environmentWithoutAuthBypass(inherited = process.env) {
  const environment = { ...inherited };
  for (const key of Object.keys(environment)) {
    if (key.toUpperCase() === "AUTH_DISABLED") delete environment[key];
  }
  return environment;
}

/** Runs each named task in order and returns the first failing status. */
export function runTasks({
  names = process.argv.slice(2),
  runner = defaultRunner,
} = {}) {
  for (const name of parseTaskNames(names)) {
    const [executable, executableArgs] = resolveTask(name);
    const status = runner(executable, executableArgs);
    if (status !== 0) return status;
  }
  return 0;
}

/** Executes one resolved task without a shell, bypass cleared. */
function defaultRunner(executable, executableArgs) {
  const result = spawnSync(executable, executableArgs, {
    cwd: APP_ROOT,
    env: environmentWithoutAuthBypass(),
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    process.exitCode = runTasks();
  } catch (error) {
    console.error(
      `Verification task failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
