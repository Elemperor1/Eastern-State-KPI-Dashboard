import {
  accessSync,
  constants,
  existsSync,
  realpathSync,
} from "node:fs";
import { delimiter, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const versionProbeTimeoutMs = 15000;

/** Determines whether is executable. */
function isExecutable(path) {
  if (!existsSync(path)) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Determines whether an executable resolves inside the repository checkout. */
function isRepositoryOwnedExecutable(path) {
  const root = realpathSync(repositoryRoot);
  let candidate;
  try {
    candidate = realpathSync(path);
  } catch {
    candidate = resolve(path);
  }
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`))
  );
}

/**
 * Finds a command on PATH while refusing repository-owned executables.
 *
 * Docker is a trust boundary for the pinned scanner path: unlike scanner
 * binaries, it must never resolve through node_modules/.bin or another shim
 * supplied by the checkout under review.
 */
function findExternalExecutable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    if (
      isExecutable(candidate) &&
      !isRepositoryOwnedExecutable(candidate)
    ) {
      return candidate;
    }
  }
  return null;
}

/** Runs the run workflow. */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: scrubEnv(
      { ...process.env, ...options.env },
      options.stripEnvPrefixes ?? [],
    ),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${String(result.status)}`);
  }
}

/** Removes child-environment entries whose names start with a blocked prefix. */
function scrubEnv(env, prefixes) {
  if (prefixes.length === 0) return env;
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) => !prefixes.some((prefix) => key.startsWith(prefix)),
    ),
  );
}

/** Implements the docker args operation. */
export function dockerArgs(image, toolArgs, { network = true } = {}) {
  return [
    "run",
    "--rm",
    ...(network ? [] : ["--network=none"]),
    "--volume",
    `${repositoryRoot}:/repo:ro`,
    "--workdir",
    "/repo",
    image,
    ...toolArgs,
  ];
}

/**
 * Returns the external Docker executable when its daemon answers within the
 * bounded probe window, else null.
 */
export function dockerDaemon(timeoutMs = versionProbeTimeoutMs) {
  const docker = findExternalExecutable("docker");
  if (!docker) return null;
  const probe = spawnSync(docker, ["info"], {
    stdio: "ignore",
    timeout: timeoutMs,
  });
  return probe.status === 0 ? docker : null;
}

/**
 * Resolves the trusted container boundary for a digest-pinned scanner.
 *
 * A local binary is intentionally not a fallback: matching `--version` output
 * does not authenticate the executable bytes. The caller supplies the
 * repository-reviewed image digest, while this helper admits only an external
 * Docker executable whose daemon responds inside the bounded probe window.
 */
export function resolveScanner(name, expectedVersion) {
  const docker = dockerDaemon();
  if (docker) return { kind: "docker", docker };

  throw new Error(
    `Docker is unavailable. ${name} ${expectedVersion} must run from its ` +
      "repository-pinned image digest; local binaries are not accepted because " +
      "version output does not verify executable provenance.",
  );
}

/** Implements the fail operation. */
export function fail(error, installHint) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Security gate failed: ${message}`);
  if (installHint) console.error(installHint);
  process.exitCode = 1;
}
