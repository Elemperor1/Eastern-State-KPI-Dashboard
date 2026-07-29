import { readFileSync } from "node:fs";

/** Reads one tracked deployment file as UTF-8 text. */
function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

/** Adds a deployment-contract failure when a required pattern is absent. */
function requirePattern(problems, source, pattern, message) {
  if (!pattern.test(source)) problems.push(message);
}

const dockerfile = read("Dockerfile");
const fly = read("fly.toml");
const workflow = read(".github/workflows/container-security.yml");
const runbook = read("docs/production-observability.md");
const problems = [];

requirePattern(
  problems,
  dockerfile,
  /rm -rf \/app\/data \/app\/\.next\/cache/u,
  "Dockerfile must remove the build cache before the runtime-stage copy",
);
requirePattern(
  problems,
  dockerfile,
  /^ENTRYPOINT \["\/app\/scripts\/container-entrypoint\.sh"\]$/mu,
  "Dockerfile must enter through the volume-ownership and privilege-drop boundary",
);
requirePattern(
  problems,
  dockerfile,
  /mkdir -p \/app\/data[\s\S]*chown app:app \/app\/data/u,
  "Dockerfile must provision a writable /app/data directory for the app user",
);
requirePattern(
  problems,
  workflow,
  /root-owned[\s\S]*test "\$\(id -u\)" -eq 10001[\s\S]*test -w \/app\/data\/root-owned[\s\S]*test ! -e \/app\/\.next\/cache/u,
  "container-security workflow must prove privilege drop and root-owned-volume recovery",
);
requirePattern(
  problems,
  fly,
  /\[deploy\][\s\S]*?strategy = "immediate"/u,
  "fly.toml must use the immediate deployment strategy for its single SQLite volume",
);
requirePattern(
  problems,
  fly,
  /\[\[vm\]\][\s\S]*?size = "shared-cpu-1x"[\s\S]*?memory = "512mb"/u,
  "fly.toml must declare the reviewed VM size and memory",
);
requirePattern(
  problems,
  fly,
  /SINGLE_MACHINE_SQLITE_CONTRACT[\s\S]*?min_machines_running = 1/u,
  "fly.toml must retain the explicit single-Machine SQLite contract marker",
);
requirePattern(
  problems,
  runbook,
  /fly scale count 1 --process-group app --app eastern-state-kpi-dashboard/u,
  "production runbook must scope the single-Machine scale command to the default process group",
);
requirePattern(
  problems,
  runbook,
  /fly scale show --app eastern-state-kpi-dashboard[\s\S]*fly machine list --app eastern-state-kpi-dashboard[\s\S]*fly volumes list --app eastern-state-kpi-dashboard/u,
  "production runbook must inventory process groups, Machines, and volumes before scaling",
);
requirePattern(
  problems,
  runbook,
  /fly volumes snapshots create <volume-id> --app eastern-state-kpi-dashboard[\s\S]*fly volumes snapshots list <volume-id> --app eastern-state-kpi-dashboard[\s\S]*fly scale count 1 --process-group app/u,
  "production runbook must back up attached volumes before any scale-down",
);
requirePattern(
  problems,
  runbook,
  /unmanaged Machines?[\s\S]*other process groups/u,
  "production runbook must disclose fly scale count limits for unmanaged Machines and other process groups",
);

if (problems.length > 0) {
  console.error("Deployment configuration guard failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("Deployment configuration guard passed.");
