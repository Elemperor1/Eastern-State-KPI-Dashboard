import {
  dockerArgs,
  fail,
  findExecutable,
  requireDocker,
  run,
} from "./security-tooling.mjs";

const OSV_SCANNER_VERSION = "2.3.8";
const scanArgs = [
  "scan",
  "source",
  "--lockfile=package-lock.json",
  "--config=osv-scanner.toml",
];

try {
  const scanner = findExecutable("osv-scanner");
  if (scanner) {
    run(scanner, scanArgs);
  } else {
    const docker = requireDocker();
    run(
      docker,
      dockerArgs(
        `ghcr.io/google/osv-scanner:v${OSV_SCANNER_VERSION}`,
        [
          "scan",
          "source",
          "--lockfile=/repo/package-lock.json",
          "--config=/repo/osv-scanner.toml",
        ],
      ),
    );
  }
} catch (error) {
  fail(
    error,
    `Install OSV-Scanner ${OSV_SCANNER_VERSION}, or run Docker, then retry.`,
  );
}
