import {
  dockerArgs,
  fail,
  resolveScanner,
  run,
} from "./security-tooling.mjs";

const SEMGREP_VERSION = "1.164.0";
const SEMGREP_IMAGE = `semgrep/semgrep:${SEMGREP_VERSION}@sha256:207983631beecdbe7fa29196c7f4a7a5f29033933cdb76c687ce4a672e07618d`;
// Finding S046-C1: registry packs (p/nodejs, p/react) are vendored under
// security/semgrep/ so scan coverage cannot drift with the live registry.
// See security/semgrep/SNAPSHOT.md for provenance and refresh steps.
const scanArgs = [
  "scan",
  "--config",
  "security/semgrep/p-nodejs.yml",
  "--config",
  "security/semgrep/p-react.yml",
  "--config",
  ".semgrep.yml",
  "--severity",
  "ERROR",
  "--error",
  "--metrics=off",
  "--disable-version-check",
  "--no-git-ignore",
  ".",
];

try {
  const scanner = resolveScanner("semgrep", SEMGREP_VERSION);
  run(
    scanner.docker,
    dockerArgs(SEMGREP_IMAGE, ["semgrep", ...scanArgs], {
      network: false,
    }),
  );
} catch (error) {
  fail(
    error,
    `Start Docker to run the digest-pinned Semgrep ${SEMGREP_VERSION} image, then retry.`,
  );
}
