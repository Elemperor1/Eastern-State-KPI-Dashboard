import {
  dockerArgs,
  fail,
  findExecutable,
  requireDocker,
  run,
} from "./security-tooling.mjs";

const OSV_SCANNER_VERSION = "2.3.8";
const OSV_SCANNER_IMAGE =
  `ghcr.io/google/osv-scanner:v${OSV_SCANNER_VERSION}@sha256:64e86bec6df2466feea5137fc7c78fb3b7c21ec077f014d7130f64810e50676b`;
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
        OSV_SCANNER_IMAGE,
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
