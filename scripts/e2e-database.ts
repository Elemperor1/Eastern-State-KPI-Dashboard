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
  databaseDevice: number;
  databaseInode: number;
}

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
    typeof run.databaseDevice !== "number" ||
    !Number.isSafeInteger(run.databaseDevice) ||
    typeof run.databaseInode !== "number" ||
    !Number.isSafeInteger(run.databaseInode)
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
    let databaseStat: fs.Stats;
    try {
      databaseStat = fs.fstatSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    const run: E2EDatabaseRun = {
      databasePath,
      runDirectory,
      ownershipToken: randomUUID(),
      databaseDevice: databaseStat.dev,
      databaseInode: databaseStat.ino,
    };
    fs.writeFileSync(
      path.join(runDirectory, E2E_OWNERSHIP_MARKER),
      JSON.stringify(run),
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    return run;
  } catch (error) {
    if (databaseReserved) fs.rmSync(databasePath, { force: true });
    fs.rmSync(runDirectory, { recursive: true, force: true });
    throw error;
  }
}

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

export function e2eDatabaseFiles(databasePath: string): string[] {
  return [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
}

function ownedByCurrentUser(stat: fs.Stats): boolean {
  return typeof process.getuid !== "function" || stat.uid === process.getuid();
}

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
    (runDirectoryStat.mode & 0o777) !== 0o700
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
    if (
      index === 0 &&
      (stat.dev !== run.databaseDevice || stat.ino !== run.databaseInode)
    ) {
      throw new Error(
        "Refusing E2E database cleanup because the database identity changed.",
      );
    }
  }

  await Promise.all(
    files.map((file, index) =>
      fileStats[index] ? fsPromises.unlink(file) : Promise.resolve(),
    ),
  );
  await fsPromises.unlink(markerPath);
  await fsPromises.rmdir(run.runDirectory);
}
