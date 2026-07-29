import {
  dockerArgs,
  fail,
  resolveScanner,
  run,
} from "./security-tooling.mjs";

const OSV_SCANNER_VERSION = "2.3.8";
const OSV_SCANNER_IMAGE =
  `ghcr.io/google/osv-scanner:v${OSV_SCANNER_VERSION}@sha256:64e86bec6df2466feea5137fc7c78fb3b7c21ec077f014d7130f64810e50676b`;
// Finding S052-C3: the scanner engine is digest-pinned, but advisory data is
// fetched live from api.osv.dev on every run by design. The accepted
// variance, corroborating controls, and outage policy are documented in
// security/osv-advisory-data.md — do not cache or vendor the advisory feed.
const scanArgs = [
  "scan",
  "source",
  "--lockfile=package-lock.json",
  "--config=osv-scanner.toml",
];

try {
  const scanner = resolveScanner("osv-scanner", OSV_SCANNER_VERSION);
  run(
    scanner.docker,
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
} catch (error) {
  fail(
    error,
    `Start Docker to run the digest-pinned OSV-Scanner ${OSV_SCANNER_VERSION} image, then retry.`,
  );
}
