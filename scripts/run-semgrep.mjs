import {
  dockerArgs,
  fail,
  findExecutable,
  requireDocker,
  run,
} from "./security-tooling.mjs";

const SEMGREP_VERSION = "1.164.0";
const SEMGREP_IMAGE = `semgrep/semgrep:${SEMGREP_VERSION}@sha256:207983631beecdbe7fa29196c7f4a7a5f29033933cdb76c687ce4a672e07618d`;
const scanArgs = [
  "scan",
  "--config",
  "p/nodejs",
  "--config",
  "p/react",
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
  const semgrep = findExecutable("semgrep");
  if (semgrep) {
    run(semgrep, scanArgs);
  } else {
    const docker = requireDocker();
    run(docker, dockerArgs(SEMGREP_IMAGE, ["semgrep", ...scanArgs]));
  }
} catch (error) {
  fail(
    error,
    `Install Semgrep ${SEMGREP_VERSION} in an isolated environment, or run Docker, then retry.`,
  );
}
