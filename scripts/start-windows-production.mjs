import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WINDOWS_LOOPBACK = "127.0.0.1";
const ALLOWED_RUNTIME_KEYS = new Set([
  "APP_CANONICAL_ORIGIN",
  "AUTH_DISABLED",
  "BIND_HOST",
  "BOOTSTRAP_ADMIN_PASSWORD",
  "BOOTSTRAP_VIEWER_PASSWORD",
  "DATABASE_PATH",
  "LOGIN_LOCKOUT_DURATION_MS",
  "LOGIN_LOCKOUT_THRESHOLD",
  "LOGIN_LOCKOUT_WINDOW_MS",
  "LOGIN_THROTTLE_MAX_ENTRIES",
  "LOGIN_VERIFY_BUDGET",
  "NODE_ENV",
  "PLAN_ACTIVATION_BACKUP_DIR",
  "PORT",
  "SESSION_COOKIE_NAME",
  "SESSION_SECRET",
  "SESSION_SECURE",
  "SUCCESSOR_PLANS_ENABLED",
  "TRUST_PROXY",
]);

/** Parses the narrow Windows launcher argument surface. */
export function parseWindowsStartArguments(args) {
  let envFile = "";
  let checkOnly = false;
  for (const argument of args) {
    if (argument === "--check") {
      checkOnly = true;
    } else if (argument.startsWith("--env-file=")) {
      if (envFile) throw new Error("Only one --env-file may be supplied.");
      envFile = argument.slice("--env-file=".length);
    } else {
      throw new Error("Unsupported Windows production-start argument.");
    }
  }
  if (!envFile) throw new Error("A runtime --env-file is required.");
  return { checkOnly, envFile };
}

/** Loads an allowlisted runtime file as the authority for application settings. */
export function loadWindowsRuntimeEnvironment(envFile, inherited = process.env) {
  if (!path.win32.isAbsolute(envFile) && process.platform === "win32") {
    throw new Error("The runtime environment file path must be absolute.");
  }
  let parsed;
  try {
    parsed = parseEnv(fs.readFileSync(envFile, "utf8"));
  } catch {
    throw new Error("The runtime environment file is unavailable or invalid.");
  }

  const unsupported = Object.keys(parsed).filter(
    (key) => !ALLOWED_RUNTIME_KEYS.has(key),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `The runtime environment file contains unsupported setting name(s): ${unsupported.sort().join(", ")}.`,
    );
  }

  const runtime = { ...inherited };
  // The access-restricted file is authoritative. Stale machine/user values for
  // application settings must not silently override or supplement it.
  for (const key of ALLOWED_RUNTIME_KEYS) delete runtime[key];
  delete runtime.NODE_OPTIONS;
  delete runtime.NODE_PATH;
  Object.assign(runtime, parsed);
  return runtime;
}

/** Returns bounded configuration problems without including secret values. */
export function validateWindowsRuntimeEnvironment(runtime) {
  const problems = [];
  if (runtime.NODE_ENV !== "production") {
    problems.push("NODE_ENV must be production.");
  }
  if (runtime.AUTH_DISABLED !== "false") {
    problems.push("AUTH_DISABLED must be explicitly false.");
  }
  if (runtime.BIND_HOST && runtime.BIND_HOST !== WINDOWS_LOOPBACK) {
    problems.push("BIND_HOST must be 127.0.0.1 when provided.");
  }
  if (runtime.SESSION_SECURE !== "true") {
    problems.push("SESSION_SECURE must be true.");
  }
  if (runtime.TRUST_PROXY !== "true" && runtime.TRUST_PROXY !== "false") {
    problems.push("TRUST_PROXY must be explicitly true or false.");
  }
  if (
    !runtime.SESSION_SECRET ||
    runtime.SESSION_SECRET.length < 32 ||
    /[<>]/u.test(runtime.SESSION_SECRET)
  ) {
    problems.push("SESSION_SECRET must contain at least 32 characters.");
  }

  for (const key of [
    "BOOTSTRAP_ADMIN_PASSWORD",
    "BOOTSTRAP_VIEWER_PASSWORD",
  ]) {
    const password = runtime[key];
    if (
      password &&
      (Buffer.byteLength(password, "utf8") < 8 ||
        Buffer.byteLength(password, "utf8") > 256 ||
        /[<>]/u.test(password))
    ) {
      problems.push(`${key} must be a non-placeholder password of 8 through 256 UTF-8 bytes.`);
    }
  }

  const databasePath = runtime.DATABASE_PATH ?? "";
  if (!path.win32.isAbsolute(databasePath)) {
    problems.push("DATABASE_PATH must be an absolute Windows path.");
  } else if (
    databasePath.startsWith("\\\\") ||
    databasePath.startsWith("\\\\?\\") ||
    databasePath.startsWith("\\\\.\\")
  ) {
    problems.push("DATABASE_PATH must use a local fixed-disk path, not UNC or a device path.");
  } else if (path.win32.extname(databasePath).toLowerCase() !== ".db") {
    problems.push("DATABASE_PATH must end in .db.");
  }

  const activationBackupPath = runtime.PLAN_ACTIVATION_BACKUP_DIR;
  if (
    activationBackupPath &&
    (!path.win32.isAbsolute(activationBackupPath) ||
      activationBackupPath.startsWith("\\\\"))
  ) {
    problems.push("PLAN_ACTIVATION_BACKUP_DIR must use a local absolute Windows path.");
  }

  const port = Number(runtime.PORT);
  if (!/^\d+$/u.test(runtime.PORT ?? "") || port < 1 || port > 65_535) {
    problems.push("PORT must be an integer from 1 through 65535.");
  }

  const origins = (runtime.APP_CANONICAL_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    problems.push("APP_CANONICAL_ORIGIN must name at least one HTTPS origin.");
  } else {
    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (
          parsed.protocol !== "https:" ||
          parsed.username ||
          parsed.password ||
          parsed.pathname !== "/" ||
          parsed.search ||
          parsed.hash ||
          parsed.origin !== origin ||
          /(^|\.)example\.(com|net|org)$/u.test(parsed.hostname)
        ) {
          throw new Error("invalid origin");
        }
      } catch {
        problems.push("APP_CANONICAL_ORIGIN entries must be exact HTTPS origins without paths or credentials.");
        break;
      }
    }
  }
  if (
    runtime.SUCCESSOR_PLANS_ENABLED &&
    runtime.SUCCESSOR_PLANS_ENABLED !== "true" &&
    runtime.SUCCESSOR_PLANS_ENABLED !== "false"
  ) {
    problems.push("SUCCESSOR_PLANS_ENABLED must be true or false when provided.");
  }
  return problems;
}

/** Returns whether the Node release satisfies the repository runtime floor. */
export function windowsNodeVersionIsSupported(version = process.versions.node) {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major >= 26 || (major === 24 && minor >= 15);
}

/** Runs a blocking startup prerequisite and preserves its exit status. */
function runBlockingNodeScript(scriptPath, runtime, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: APP_ROOT,
    env: runtime,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw new Error("A production startup prerequisite could not run.");
  return result.status ?? 1;
}

/** Starts Next on Windows loopback and forwards normal termination requests. */
async function runNext(runtime) {
  const nextCli = path.join(APP_ROOT, "node_modules", "next", "dist", "bin", "next");
  const buildId = path.join(APP_ROOT, ".next", "BUILD_ID");
  if (!fs.existsSync(nextCli) || !fs.existsSync(buildId)) {
    throw new Error("The production dependencies or Next build are missing.");
  }
  const child = spawn(
    process.execPath,
    [nextCli, "start", "-H", WINDOWS_LOOPBACK, "-p", runtime.PORT],
    {
      cwd: APP_ROOT,
      env: runtime,
      stdio: "inherit",
      windowsHide: true,
    },
  );

  /** Forwards one supported termination signal to the server process. */
  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", () => forward("SIGINT"));
  process.once("SIGTERM", () => forward("SIGTERM"));

  return await new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("The Next production server could not start.")));
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

/** Executes the fail-closed native Windows production startup sequence. */
async function main() {
  const { checkOnly, envFile } = parseWindowsStartArguments(process.argv.slice(2));
  if (!windowsNodeVersionIsSupported()) {
    throw new Error("Node.js 24.15 or newer is required.");
  }
  const runtime = loadWindowsRuntimeEnvironment(envFile);
  const problems = validateWindowsRuntimeEnvironment(runtime);
  if (problems.length > 0) {
    throw new Error(`Runtime configuration refused: ${problems.join(" ")}`);
  }
  if (checkOnly) {
    console.log("[windows-start] runtime configuration passed.");
    return 0;
  }
  if (process.platform !== "win32") {
    throw new Error("Native Windows production startup requires Windows.");
  }

  const initialization = runBlockingNodeScript(
    path.join(APP_ROOT, "scripts", "ensure-seeded.mjs"),
    runtime,
  );
  if (initialization !== 0) return initialization;

  let logging = 1;
  try {
    logging = runBlockingNodeScript(
      path.join(APP_ROOT, "scripts", "operational-log.mjs"),
      runtime,
      ["startup", "server_starting"],
    );
  } catch {
    // Startup status logging is deliberately best effort on every platform.
  }
  if (logging !== 0) {
    console.error("WARNING: startup status logging failed; continuing.");
  }
  return await runNext(runtime);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(
      `[windows-start] ${error instanceof Error ? error.message : "Production startup failed."}`,
    );
    process.exitCode = 1;
  }
}
