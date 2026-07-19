import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();

/** Retrieves executable. */
export function findExecutable(name) {
  const localExecutable = join(repositoryRoot, "node_modules", ".bin", name);
  if (isExecutable(localExecutable)) return localExecutable;

  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

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

/** Runs the run workflow. */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${String(result.status)}`);
  }
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

/** Implements the require docker operation. */
export function requireDocker() {
  const docker = findExecutable("docker");
  if (!docker) {
    throw new Error("Docker is required when the scanner CLI is not installed locally.");
  }
  const probe = spawnSync(docker, ["info"], { stdio: "ignore" });
  if (probe.status !== 0) {
    throw new Error("Docker is installed, but its daemon is not running.");
  }
  return docker;
}

/** Implements the fail operation. */
export function fail(error, installHint) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Security gate failed: ${message}`);
  if (installHint) console.error(installHint);
  process.exitCode = 1;
}
