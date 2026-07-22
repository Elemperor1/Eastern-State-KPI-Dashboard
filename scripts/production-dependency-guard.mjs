import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const BRACE_EXPANSION_ADVISORY = "CVE-2026-13149 / GHSA-3jxr-9vmj-r5cp";
const SHARP_ADVISORY = "GHSA-f88m-g3jw-g9cj";
const DOMPURIFY_ADVISORY = "GHSA-c2j3-45gr-mqc4";
const REQUIRED_RUNTIME_PACKAGES = [
  "jspdf",
  "next",
  "react",
  "react-dom",
  "sharp",
  "tsx",
];

/** Parses a strict semantic version into comparable identifiers. */
function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    version,
  );
  if (!match) throw new Error(`Unsupported package version: ${version}`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

/** Compares semantic versions without depending on the tree being audited. */
function compareVersions(leftVersion, rightVersion) {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);
  for (let index = 0; index < left.core.length; index += 1) {
    const difference = left.core[index] - right.core[index];
    if (difference !== 0) return Math.sign(difference);
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
    if (leftNumber !== null && rightNumber !== null) {
      return Math.sign(leftNumber - rightNumber);
    }
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

/** Returns whether a brace-expansion version is covered by CVE-2026-13149. */
function braceExpansionIsVulnerable(version) {
  return (
    compareVersions(version, "1.1.16") < 0 ||
    (compareVersions(version, "2.0.0") >= 0 &&
      compareVersions(version, "2.1.2") < 0) ||
    (compareVersions(version, "3.0.0") >= 0 &&
      compareVersions(version, "5.0.7") < 0)
  );
}

/** Returns whether a sharp version is covered by GHSA-f88m-g3jw-g9cj. */
function sharpIsVulnerable(version) {
  return compareVersions(version, "0.35.0") < 0;
}

/** Returns whether a DOMPurify version is covered by GHSA-c2j3-45gr-mqc4. */
function domPurifyIsVulnerable(version) {
  return compareVersions(version, "3.4.12") < 0;
}

/** Reads and parses one JSON file with a useful failure label. */
function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${label} at ${path}: ${reason}`);
  }
}

/** Extracts an npm package name from a lockfile package path. */
function packageNameFromLockPath(packagePath) {
  const marker = "node_modules/";
  const markerIndex = packagePath.lastIndexOf(marker);
  return markerIndex === -1 ? null : packagePath.slice(markerIndex + marker.length);
}

/** Returns the advisory that covers a package version, when one is active. */
function activeAdvisory(packageName, version) {
  if (packageName === "brace-expansion" && braceExpansionIsVulnerable(version)) {
    return BRACE_EXPANSION_ADVISORY;
  }
  if (packageName === "sharp" && sharpIsVulnerable(version)) {
    return SHARP_ADVISORY;
  }
  if (packageName === "dompurify" && domPurifyIsVulnerable(version)) {
    return DOMPURIFY_ADVISORY;
  }
  return null;
}

/** Parses the supported command-line options. */
function parseArguments(argv) {
  let lockfilePath = null;
  let runtimeRoot = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--lockfile") {
      lockfilePath = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--runtime-root") {
      runtimeRoot = argv[index + 1] ?? null;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (lockfilePath === null) {
    lockfilePath = join(runtimeRoot ?? process.cwd(), "package-lock.json");
  }
  return {
    lockfilePath: resolve(lockfilePath),
    runtimeRoot: runtimeRoot === null ? null : resolve(runtimeRoot),
  };
}

/** Validates manifest ownership of runtime-critical dependencies. */
function validateManifest(repositoryRoot, problems) {
  const manifest = readJson(join(repositoryRoot, "package.json"), "package manifest");
  for (const packageName of REQUIRED_RUNTIME_PACKAGES) {
    if (manifest.dependencies?.[packageName] === undefined) {
      problems.push(`${packageName} must remain a production dependency`);
    }
  }
  if (manifest.devDependencies?.tsx !== undefined) {
    problems.push("tsx must not return to devDependencies; production seed and migration use it");
  }
  if (manifest.overrides?.sharp !== "$sharp") {
    problems.push("the sharp override must follow the direct production dependency via $sharp");
  }
}

/** Validates every advisory-relevant version recorded in the npm lockfile. */
function validateLockfile(lockfile, problems) {
  for (const [packagePath, metadata] of Object.entries(lockfile.packages ?? {})) {
    const packageName = packageNameFromLockPath(packagePath);
    if (packageName === null || typeof metadata.version !== "string") continue;
    const advisory = activeAdvisory(packageName, metadata.version);
    if (advisory !== null) {
      problems.push(`${packageName}@${metadata.version} at ${packagePath} is covered by ${advisory}`);
    }
  }
}

/** Returns whether npm marks a lock entry as development-only or dev-optional. */
function isDevelopmentOnly(metadata) {
  return metadata.dev === true || metadata.devOptional === true;
}

/** Validates the installed final-image tree against the committed lock metadata. */
function validateRuntimeTree(lockfile, runtimeRoot, problems) {
  let installedCount = 0;
  let omittedDevelopmentCount = 0;
  for (const [packagePath, metadata] of Object.entries(lockfile.packages ?? {})) {
    const packageName = packageNameFromLockPath(packagePath);
    if (packageName === null || typeof metadata.version !== "string") continue;
    const installedManifestPath = join(runtimeRoot, packagePath, "package.json");
    if (!existsSync(installedManifestPath)) {
      if (isDevelopmentOnly(metadata)) omittedDevelopmentCount += 1;
      continue;
    }
    installedCount += 1;
    const installed = readJson(installedManifestPath, `${packageName} runtime manifest`);
    if (installed.version !== metadata.version) {
      problems.push(
        `${packagePath} is ${String(installed.version)} but package-lock.json records ${metadata.version}`,
      );
    }
    if (isDevelopmentOnly(metadata)) {
      problems.push(`${packagePath} is development-only but is present in the runtime image`);
    }
    if (typeof installed.version === "string") {
      const advisory = activeAdvisory(packageName, installed.version);
      if (advisory !== null) {
        problems.push(`${packageName}@${installed.version} in the runtime image is covered by ${advisory}`);
      }
    }
  }
  for (const packageName of REQUIRED_RUNTIME_PACKAGES) {
    const installedManifestPath = join(runtimeRoot, "node_modules", packageName, "package.json");
    if (!existsSync(installedManifestPath)) {
      problems.push(`${packageName} is missing from the runtime image`);
    }
  }
  return { installedCount, omittedDevelopmentCount };
}

/** Runs the dependency-policy guard. */
function main() {
  const { lockfilePath, runtimeRoot } = parseArguments(process.argv.slice(2));
  const lockfile = readJson(lockfilePath, "npm lockfile");
  const repositoryRoot = dirname(lockfilePath);
  const problems = [];
  validateManifest(repositoryRoot, problems);
  validateLockfile(lockfile, problems);
  const runtimeSummary =
    runtimeRoot === null
      ? null
      : validateRuntimeTree(lockfile, runtimeRoot, problems);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`production dependency guard: ${problem}`);
    process.exitCode = 1;
    return;
  }
  if (runtimeSummary === null) {
    console.log("Production dependency lock policy passed.");
    return;
  }
  console.log(
    `Production dependency runtime policy passed (${runtimeSummary.installedCount} installed packages; ${runtimeSummary.omittedDevelopmentCount} development-only lock entries omitted).`,
  );
}

main();
