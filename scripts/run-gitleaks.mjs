import {
  dockerArgs,
  fail,
  findExecutable,
  requireDocker,
  run,
} from "./security-tooling.mjs";

const GITLEAKS_VERSION = "8.30.1";
const shaPattern = /^[0-9a-f]{7,64}$/u;

function scanRevision() {
  const explicit = process.env.GITLEAKS_LOG_OPTS;
  if (explicit) {
    if (!/^(?:--all|[0-9a-f]{7,64}(?:\.\.[0-9a-f]{7,64})?)$/u.test(explicit)) {
      throw new Error("GITLEAKS_LOG_OPTS must be --all, a commit SHA, or base..head SHAs.");
    }
    return explicit;
  }

  const base = process.env.GITLEAKS_BASE_SHA;
  const head = process.env.GITLEAKS_HEAD_SHA;
  if (base && head) {
    if (!shaPattern.test(base) || !shaPattern.test(head)) {
      throw new Error("Gitleaks commit range contains an invalid SHA.");
    }
    return /^0+$/u.test(base) ? head : `${base}..${head}`;
  }
  return "--all";
}

try {
  const args = [
    "git",
    "--redact",
    "--no-banner",
    `--log-opts=${scanRevision()}`,
    ".",
  ];
  const gitleaks = findExecutable("gitleaks");
  if (gitleaks) {
    run(gitleaks, args);
  } else {
    const docker = requireDocker();
    run(
      docker,
      dockerArgs(
        `ghcr.io/gitleaks/gitleaks:v${GITLEAKS_VERSION}`,
        args,
        { network: false },
      ),
    );
  }
} catch (error) {
  fail(
    error,
    `Install Gitleaks ${GITLEAKS_VERSION}, or run Docker, then retry. Findings are always redacted.`,
  );
}
