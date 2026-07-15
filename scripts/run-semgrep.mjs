import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  dockerArgs,
  fail,
  findExecutable,
  requireDocker,
  run,
} from "./security-tooling.mjs";

const SEMGREP_VERSION = "1.164.0";
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
    const pipx = findExecutable("pipx");
    if (pipx) {
      const cacheRoot = join(tmpdir(), "eastern-state-kpi-semgrep");
      run(
        pipx,
        ["run", "--spec", `semgrep==${SEMGREP_VERSION}`, "semgrep", ...scanArgs],
        {
          env: {
            HOME: cacheRoot,
            XDG_CACHE_HOME: join(cacheRoot, "xdg-cache"),
            XDG_DATA_HOME: join(cacheRoot, "xdg-data"),
            UV_CACHE_DIR: join(cacheRoot, "uv-cache"),
            UV_TOOL_BIN_DIR: join(cacheRoot, "uv-bin"),
            UV_TOOL_DIR: join(cacheRoot, "uv-tools"),
            PIPX_HOME: join(cacheRoot, "pipx-home"),
            PIPX_BIN_DIR: join(cacheRoot, "pipx-bin"),
            PIP_CACHE_DIR: join(cacheRoot, "pip-cache"),
          },
        },
      );
    } else {
      const docker = requireDocker();
      run(
        docker,
        dockerArgs(`semgrep/semgrep:${SEMGREP_VERSION}`, scanArgs),
      );
    }
  }
} catch (error) {
  fail(
    error,
    `Install Semgrep ${SEMGREP_VERSION} in an isolated environment, or run Docker, then retry.`,
  );
}
