import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

const E2E_DATABASE_FILENAME_PREFIX = "eastern-state-kpi-playwright-";
const E2E_RUN_DIRECTORY_PREFIX = `${E2E_DATABASE_FILENAME_PREFIX}run-`;
const E2E_OWNERSHIP_MARKER = ".eastern-state-kpi-e2e-owner.json";
export const E2E_DATABASE_RUN_METADATA_KEY = "e2eDatabaseRun";

export interface CreateE2EDatabaseRunOptions {
  port: number;
  explicitPath?: string;
  temporaryDirectory?: string;
}

export interface E2EDatabaseRun {
  databasePath: string;
  runDirectory: string;
  ownershipToken: string;
  /**
   * Device and inode are recorded as exact decimal strings, not numbers.
   * They are 64-bit values, and an NTFS file ID routinely exceeds
   * `Number.MAX_SAFE_INTEGER`; reading them as JS numbers silently rounds,
   * which both breaks the identity comparison and intermittently fails
   * metadata validation on Windows.
   */
  databaseDevice: string;
  databaseInode: string;
}

/**
 * A run directory is only swept once it is older than this. A live run is
 * never a candidate, so the window is far longer than any acceptance run.
 */
const ABANDONED_RUN_AGE_MS = 60 * 60 * 1000;

/**
 * Best-effort removal of run directories a previous run could not delete.
 *
 * Teardown can lose the file to a still-open handle on Windows, and a hard
 * kill (CI cancellation, Ctrl-C) skips teardown on every platform, so without
 * this the OS temp root accumulates one directory per abandoned run. Only
 * directories under the temp root that carry this harness's prefix AND its
 * private ownership marker are considered, so nothing outside the harness's
 * own output can ever be selected.
 */
function sweepAbandonedRunDirectories(temporaryRoot: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(temporaryRoot, { withFileTypes: true });
  } catch {
    return;
  }
  const cutoff = Date.now() - ABANDONED_RUN_AGE_MS;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(E2E_RUN_DIRECTORY_PREFIX)) {
      continue;
    }
    const candidate = path.join(temporaryRoot, entry.name);
    try {
      const markerPath = path.join(candidate, E2E_OWNERSHIP_MARKER);
      const marker = fs.lstatSync(markerPath);
      if (!marker.isFile() || marker.mtimeMs > cutoff) continue;
      if (!abandonedRunMarker(markerPath, candidate)) continue;
      fs.rmSync(candidate, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      });
    } catch {
      // A missing marker, a live run, or a still-locked file all mean "not
      // ours to remove right now". Never fail a run over cleanup of a
      // previous one.
    }
  }
}

/**
 * True only when the marker proves its run is over.
 *
 * Age alone is not proof: a slow or hung acceptance run stays alive well past
 * any threshold, and deleting its directory would unlink the SQLite database
 * out from under it on POSIX, or half-remove its sidecars on Windows, and
 * break its identity-checked teardown. So the marker must parse, must name
 * the directory it sits in — proving it is this harness's own record and not
 * a lookalike file — and must name a process that is no longer running.
 */
function abandonedRunMarker(markerPath: string, runDirectory: string): boolean {
  let marker: { runDirectory?: unknown; createdByPid?: unknown };
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as typeof marker;
  } catch {
    return false;
  }
  if (marker.runDirectory !== runDirectory) return false;
  const pid = marker.createdByPid;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  return !processIsRunning(pid);
}

/** True when a process with this id currently exists. */
function processIsRunning(pid: number): boolean {
  try {
    // Signal 0 performs the existence check without delivering a signal.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error instanceof Error && "code" in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
    // EPERM means the process exists but belongs to someone else. Treat
    // anything other than "no such process" as still running, so the sweep
    // errs toward leaving a directory alone.
    return code !== "ESRCH";
  }
}

/** True for an exact non-negative decimal integer written as a string. */
function isIdentityString(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/u.test(value);
}

/** Implements the e2e database run from metadata operation. */
export function e2eDatabaseRunFromMetadata(
  metadata: unknown,
): E2EDatabaseRun {
  const candidate = metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>)[E2E_DATABASE_RUN_METADATA_KEY]
    : undefined;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Playwright metadata is missing its E2E database run.");
  }
  const run = candidate as Partial<E2EDatabaseRun>;
  if (
    typeof run.databasePath !== "string" ||
    !path.isAbsolute(run.databasePath) ||
    typeof run.runDirectory !== "string" ||
    !path.isAbsolute(run.runDirectory) ||
    typeof run.ownershipToken !== "string" ||
    run.ownershipToken.length === 0 ||
    !isIdentityString(run.databaseDevice) ||
    !isIdentityString(run.databaseInode)
  ) {
    throw new Error("Playwright E2E database metadata is invalid.");
  }
  return run as E2EDatabaseRun;
}

/** Create a private, uniquely named run directory and reserve its database. */
export function createE2EDatabaseRun({
  port,
  explicitPath,
  temporaryDirectory = os.tmpdir(),
}: CreateE2EDatabaseRunOptions): E2EDatabaseRun {
  const temporaryRoot = fs.realpathSync(path.resolve(temporaryDirectory));
  const explicitDatabasePath = explicitPath?.trim()
    ? resolveExplicitE2EDatabasePath(explicitPath, temporaryDirectory)
    : undefined;
  sweepAbandonedRunDirectories(temporaryRoot);
  const runDirectory = fs.mkdtempSync(
    path.join(temporaryRoot, E2E_RUN_DIRECTORY_PREFIX),
  );
  fs.chmodSync(runDirectory, 0o700);
  const databasePath = explicitDatabasePath ?? path.join(
    runDirectory,
    `${E2E_DATABASE_FILENAME_PREFIX}${port}.db`,
  );
  let databaseReserved = false;
  try {
    const descriptor = fs.openSync(databasePath, "wx+", 0o600);
    databaseReserved = true;
    let databaseStat: fs.BigIntStats;
    try {
      databaseStat = fs.fstatSync(descriptor, { bigint: true });
    } finally {
      fs.closeSync(descriptor);
    }
    const run: E2EDatabaseRun = {
      databasePath,
      runDirectory,
      ownershipToken: randomUUID(),
      databaseDevice: databaseStat.dev.toString(),
      databaseInode: databaseStat.ino.toString(),
    };
    // `createdByPid` is sweep evidence, not part of the run contract: a later
    // run uses it to prove this one is over instead of guessing from a
    // timestamp. Cleanup compares the run fields individually, so the extra
    // key is inert there.
    fs.writeFileSync(
      path.join(runDirectory, E2E_OWNERSHIP_MARKER),
      JSON.stringify({ ...run, createdByPid: process.pid }),
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    return run;
  } catch (error) {
    if (databaseReserved) fs.rmSync(databasePath, { force: true });
    fs.rmSync(runDirectory, { recursive: true, force: true });
    throw error;
  }
}

/** Retrieves explicit e2 edatabase path. */
function resolveExplicitE2EDatabasePath(
  explicitPath: string,
  temporaryDirectory: string,
): string {
  const lexicalTemporaryRoot = path.resolve(temporaryDirectory);
  const temporaryRoot = fs.realpathSync(lexicalTemporaryRoot);
  const providedPath = path.resolve(explicitPath);
  const lexicalRelative = path.relative(
    lexicalTemporaryRoot,
    providedPath,
  );
  if (
    lexicalRelative === "" ||
    lexicalRelative === ".." ||
    lexicalRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(lexicalRelative)
  ) {
    throw new Error(
      `E2E_DATABASE_PATH must stay inside the temporary directory (${temporaryRoot}).`,
    );
  }
  const filename = path.basename(providedPath);
  if (
    !filename.startsWith(E2E_DATABASE_FILENAME_PREFIX) ||
    !filename.endsWith(".db")
  ) {
    throw new Error(
      `E2E_DATABASE_PATH must use the acceptance-test filename prefix ${E2E_DATABASE_FILENAME_PREFIX}.`,
    );
  }
  const resolvedParent = fs.realpathSync(path.dirname(providedPath));
  const resolved = path.join(resolvedParent, filename);
  const physicalRelative = path.relative(temporaryRoot, resolved);
  if (
    physicalRelative === "" ||
    physicalRelative === ".." ||
    physicalRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(physicalRelative)
  ) {
    throw new Error(
      `E2E_DATABASE_PATH must stay inside the temporary directory (${temporaryRoot}).`,
    );
  }
  try {
    fs.lstatSync(resolved);
    throw new Error("E2E_DATABASE_PATH must not already exist.");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return resolved;
    }
    throw error;
  }
}

/** Implements the e2e database files operation. */
export function e2eDatabaseFiles(databasePath: string): string[] {
  return [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
}

/** Implements the owned by current user operation. */
function ownedByCurrentUser(stat: fs.Stats): boolean {
  return typeof process.getuid !== "function" || stat.uid === process.getuid();
}

/**
 * True when the run directory still carries the private mode we created it
 * with.
 *
 * Windows does not implement POSIX permission bits: `chmod(0o700)` is a no-op
 * there and the directory reports `0o666`, so asserting the mode would refuse
 * every cleanup on that platform. The per-user temp directory is already
 * ACL-restricted on Windows, and every structural guarantee still applies on
 * both platforms — real directory, not a symlink, matching private ownership
 * marker, singly linked files, and an exact device/inode identity match.
 */
function privateRunDirectoryMode(stat: fs.Stats): boolean {
  if (process.platform === "win32") return true;
  return (stat.mode & 0o777) === 0o700;
}

/** Reads a file's exact device/inode identity, or null when it is absent. */
async function fileIdentityIfPresent(
  file: string,
): Promise<{ device: string; inode: string } | null> {
  try {
    const stat = await fsPromises.lstat(file, { bigint: true });
    return { device: stat.dev.toString(), inode: stat.ino.toString() };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** Implements the lstat if present operation. */
async function lstatIfPresent(file: string): Promise<fs.Stats | null> {
  try {
    return await fsPromises.lstat(file);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** Remove only the exact run whose private ownership marker matches metadata. */
export async function cleanupE2EDatabaseRun(
  run: E2EDatabaseRun,
): Promise<void> {
  const runDirectoryStat = await lstatIfPresent(run.runDirectory);
  if (!runDirectoryStat) {
    const databaseFiles = await Promise.all(
      e2eDatabaseFiles(run.databasePath).map(lstatIfPresent),
    );
    if (databaseFiles.some(Boolean)) {
      throw new Error(
        "Refusing E2E database cleanup because its ownership directory is missing.",
      );
    }
    return;
  }
  if (
    !runDirectoryStat.isDirectory() ||
    runDirectoryStat.isSymbolicLink() ||
    !ownedByCurrentUser(runDirectoryStat) ||
    !privateRunDirectoryMode(runDirectoryStat)
  ) {
    throw new Error(
      "Refusing E2E database cleanup because the run directory is not privately owned.",
    );
  }

  const markerPath = path.join(run.runDirectory, E2E_OWNERSHIP_MARKER);
  const markerStat = await lstatIfPresent(markerPath);
  if (
    !markerStat ||
    !markerStat.isFile() ||
    markerStat.isSymbolicLink() ||
    markerStat.nlink !== 1 ||
    !ownedByCurrentUser(markerStat)
  ) {
    throw new Error(
      "Refusing E2E database cleanup because the ownership marker is invalid.",
    );
  }
  let marker: E2EDatabaseRun;
  try {
    marker = JSON.parse(await fsPromises.readFile(markerPath, "utf8")) as
      E2EDatabaseRun;
  } catch {
    throw new Error(
      "Refusing E2E database cleanup because the ownership marker is unreadable.",
    );
  }
  if (
    marker.databasePath !== run.databasePath ||
    marker.runDirectory !== run.runDirectory ||
    marker.ownershipToken !== run.ownershipToken ||
    marker.databaseDevice !== run.databaseDevice ||
    marker.databaseInode !== run.databaseInode
  ) {
    throw new Error(
      "Refusing E2E database cleanup because the ownership marker does not match.",
    );
  }

  const files = e2eDatabaseFiles(run.databasePath);
  const fileStats = await Promise.all(files.map(lstatIfPresent));
  for (const [index, stat] of fileStats.entries()) {
    if (!stat) continue;
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      !ownedByCurrentUser(stat)
    ) {
      throw new Error(
        `Refusing E2E database cleanup because ${files[index]} is not a singly linked owned file.`,
      );
    }
    if (index === 0) {
      const identity = await fileIdentityIfPresent(files[index]!);
      if (
        !identity ||
        identity.device !== run.databaseDevice ||
        identity.inode !== run.databaseInode
      ) {
        throw new Error(
          "Refusing E2E database cleanup because the database identity changed.",
        );
      }
    }
  }

  const removal = { force: true, maxRetries: 20, retryDelay: 100 } as const;
  try {
    await Promise.all(
      files.map((file, index) =>
        fileStats[index] ? fsPromises.rm(file, removal) : Promise.resolve(),
      ),
    );
    await fsPromises.rm(markerPath, removal);
    await fsPromises.rm(run.runDirectory, { ...removal, recursive: true });
  } catch (error) {
    if (!windowsFileStillOpen(error)) throw error;
    // Windows refuses to unlink a file another process still holds open, and
    // POSIX does not — this is the only platform where teardown can lose that
    // race. Playwright stops the web server AFTER global teardown returns, so
    // retrying here waits on a handle that cannot be released until we give
    // up; the deletion has to happen once the run is over instead. Ownership
    // was fully verified above, and the exit handler re-resolves nothing: it
    // removes the exact directory this run created.
    deferRemovalToProcessExit([...files, markerPath], run.runDirectory);
  }
}

/** True for the Windows error raised when another process holds the file. */
function windowsFileStillOpen(error: unknown): boolean {
  if (process.platform !== "win32") return false;
  const code = error instanceof Error && "code" in error
    ? (error as NodeJS.ErrnoException).code
    : undefined;
  return code === "EBUSY" || code === "EPERM";
}

/**
 * Removes the already-verified run once the web server has exited.
 *
 * The files are removed explicitly rather than relying on the recursive
 * directory removal: an `E2E_DATABASE_PATH` override places the database
 * directly under the temp root instead of inside the run directory, so
 * deleting only the directory would leave that database and its WAL/SHM
 * sidecars behind — which then makes the next run with the same override
 * refuse to start, because it reserves the path with `wx+`.
 */
function deferRemovalToProcessExit(
  files: string[],
  runDirectory: string,
): void {
  process.once("exit", () => {
    const removal = {
      force: true,
      maxRetries: 20,
      retryDelay: 50,
    } as const;
    for (const file of files) {
      try {
        fs.rmSync(file, removal);
      } catch {
        // Best effort by construction: the process is already exiting.
      }
    }
    try {
      fs.rmSync(runDirectory, { ...removal, recursive: true });
    } catch {
      // Best effort by construction: the process is already exiting, and the
      // directory is a uniquely named disposable run under the OS temp root.
      // `createE2EDatabaseRun` sweeps anything a hard kill leaves behind.
    }
  });
}
