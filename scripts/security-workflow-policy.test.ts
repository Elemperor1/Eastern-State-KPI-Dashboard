import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = process.cwd();

type WorkflowStep = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  "continue-on-error"?: boolean;
  with?: Record<string, unknown>;
};

type WorkflowJob = {
  name?: string;
  uses?: string;
  needs?: string | string[];
  if?: string;
  "runs-on"?: unknown;
  "timeout-minutes"?: number;
  permissions?: Record<string, unknown>;
  steps?: WorkflowStep[];
};

type Workflow = {
  on?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  concurrency?: {
    group?: string;
    "cancel-in-progress"?: boolean;
  };
  jobs?: Record<string, WorkflowJob>;
};

/** Supports the read test scenario. */
function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

/** Parses one workflow as YAML so policy checks inspect semantic fields. */
function readWorkflow(relativePath: string): Workflow {
  return parse(read(relativePath)) as Workflow;
}

/** Lists every repository workflow with its parsed document. */
function workflowEntries(): Array<[string, Workflow]> {
  const workflowDirectory = path.join(root, ".github", "workflows");
  return fs
    .readdirSync(workflowDirectory)
    .filter((filename) => /\.ya?ml$/u.test(filename))
    .sort()
    .map((filename) => [filename, readWorkflow(`.github/workflows/${filename}`)]);
}

/** Returns a required workflow job or fails with a precise fixture error. */
function requiredJob(workflow: Workflow, jobId: string): WorkflowJob {
  const job = workflow.jobs?.[jobId];
  if (!job) throw new Error(`Missing workflow job: ${jobId}`);
  return job;
}

/** Returns a uniquely named step from a workflow job. */
function requiredStep(job: WorkflowJob, stepName: string): WorkflowStep {
  const matches = (job.steps ?? []).filter((step) => step.name === stepName);
  if (matches.length !== 1) {
    throw new Error(`Expected one workflow step named ${stepName}; found ${matches.length}`);
  }
  return matches[0];
}

describe("security workflow policy", () => {
  it("pins every external GitHub Action to a full commit SHA", () => {
    const unpinned: string[] = [];

    for (const [filename, workflow] of workflowEntries()) {
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        if (job.uses && !job.uses.startsWith("./")) {
          const ref = job.uses.slice(job.uses.lastIndexOf("@") + 1);
          if (!/^[0-9a-f]{40}$/u.test(ref)) {
            unpinned.push(`${filename}:${jobId}: ${job.uses}`);
          }
        }
        for (const step of job.steps ?? []) {
          const action = step.uses;
          if (!action) continue;
          if (action.startsWith("./")) continue;
          const ref = action.slice(action.lastIndexOf("@") + 1);
          if (!/^[0-9a-f]{40}$/u.test(ref)) {
            unpinned.push(`${filename}: ${action}`);
          }
        }
      }
    }

    expect(unpinned).toEqual([]);
  });

  it("disables credential persistence for every workflow checkout", () => {
    const violations: string[] = [];

    for (const [filename, workflow] of workflowEntries()) {
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        for (const step of job.steps ?? []) {
          if (
            step.uses?.startsWith("actions/checkout@") &&
            step.with?.["persist-credentials"] !== false
          ) {
            violations.push(`${filename}:${jobId}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the required-check names stable", () => {
    const quality = readWorkflow(".github/workflows/quality.yml");
    const actualQualityNames = Object.fromEntries(
      Object.entries(quality.jobs ?? {}).map(([jobId, job]) => [jobId, job.name]),
    );

    expect(actualQualityNames).toEqual({
      typecheck: "Typecheck",
      lint: "Lint",
      "unit-tests": "Unit and Integration Tests",
      build: "Required CI Gate",
      "windows-native": "Windows Native Build",
      e2e: "End-to-End Tests",
      dependencies: "Dependency Vulnerabilities",
      secrets: "Secret Scan",
      semgrep: "Semgrep",
    });
    expect(requiredJob(readWorkflow(".github/workflows/codeql.yml"), "analyze").name).toBe(
      "CodeQL (${{ matrix.language }})",
    );
    expect(
      requiredJob(
        readWorkflow(".github/workflows/dependency-review.yml"),
        "dependency-review",
      ).name,
    ).toBe("Dependency Review");
    expect(
      requiredJob(
        readWorkflow(".github/workflows/container-security.yml"),
        "container_security",
      ).name,
    ).toBe("Production container security");
  });

  it("gives every workflow concurrency cancellation and every runner a timeout", () => {
    const violations: string[] = [];

    for (const [filename, workflow] of workflowEntries()) {
      if (!workflow.concurrency?.group || workflow.concurrency["cancel-in-progress"] !== true) {
        violations.push(`${filename}: concurrency`);
      }
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        if (
          job["runs-on"] &&
          !(
            typeof job["timeout-minutes"] === "number" &&
            job["timeout-minutes"] > 0
          )
        ) {
          violations.push(`${filename}:${jobId}: timeout`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps pull-request workflows secretless and fork-safe", () => {
    for (const [filename, workflow] of workflowEntries()) {
      expect(workflow.on, filename).not.toHaveProperty("pull_request_target");
      expect(workflow.on, filename).not.toHaveProperty("workflow_run");
      expect(JSON.stringify(workflow), filename).not.toMatch(/\bsecrets\./u);
    }

    const container = readWorkflow(".github/workflows/container-security.yml");
    const trivy = requiredJob(container, "trivy");
    const sarifPolicy = requiredStep(trivy, "Classify SARIF publication policy");
    const sarifUpload = requiredStep(trivy, "Upload SARIF report to code scanning");
    const sarifEnforcement = requiredStep(trivy, "Enforce SARIF publication policy");
    const stepNames = (trivy.steps ?? []).map((step) => step.name);
    expect(sarifPolicy.run).toContain(
      '"$EVENT_NAME" == "pull_request" && "$HEAD_REPOSITORY" != "$BASE_REPOSITORY"',
    );
    expect(sarifPolicy.run).toContain('"$PUSH_ACTOR" == "dependabot[bot]"');
    expect(sarifUpload.if).toContain(
      "steps.sarif_policy.outputs.publication_required == 'true'",
    );
    expect(sarifUpload["continue-on-error"]).toBe(true);
    expect(sarifEnforcement.run).toContain(
      '"$ALLOW_READ_ONLY_FAILURE" == "true" && "$UPLOAD_OUTCOME" == "failure"',
    );
    expect(sarifEnforcement.run).toContain("exit 1");
    expect(stepNames.indexOf("Block fixable high and critical vulnerabilities")).toBeLessThan(
      stepNames.indexOf("Classify SARIF publication policy"),
    );
  });

  it("pins the external production base image and npm bootstrap", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toMatch(
      /^FROM node:24-bookworm-slim@sha256:[0-9a-f]{64} AS base$/mu,
    );
    expect(dockerfile).not.toContain("npm install --global");
    expect(dockerfile).toContain("npm-11.18.0.tgz");
    expect(dockerfile).toMatch(
      /[0-9a-f]{128}  \/tmp\/npm\.tgz" \| sha512sum -c -/u,
    );
  });

  it("keeps the production runtime non-root, writable, and free of build cache", () => {
    const dockerfile = read("Dockerfile");
    const workflow = read(".github/workflows/container-security.yml");
    const initialization = read("scripts/ensure-seeded.mjs");

    expect(dockerfile).toContain("rm -rf /app/data /app/.next/cache");
    expect(dockerfile).toContain(
      'ENTRYPOINT ["/app/scripts/container-entrypoint.sh"]',
    );
    expect(dockerfile).toContain("chown app:app /app/data");
    expect(dockerfile).toContain("rm -rf /usr/local/lib/node_modules/npm");
    expect(dockerfile).toContain("/usr/local/lib/node_modules/corepack");
    expect(dockerfile).toContain('CMD ["bash", "./scripts/start-production.sh"]');
    expect(workflow).toContain("root-owned");
    expect(workflow).toContain('test "$(id -u)" -eq 10001');
    expect(workflow).toContain("test -w /app/data/root-owned");
    expect(workflow).toContain("test ! -e /app/.next/cache");
    expect(workflow).toContain(
      "for package_manager in npm npx corepack yarn yarnpkg pnpm pnpx",
    );
    expect(workflow).toContain(
      "test -z \"$(find /usr/local -type f",
    );
    expect(initialization).not.toMatch(/spawnSync\(\s*["']npm["']/u);
    expect(initialization).toContain("process.execPath");
    expect(initialization).toContain('"tsx"');
    expect(initialization).toContain('"cli.mjs"');
  });

  it("records the private-license boundary for the committed brand fonts", () => {
    const fontDirectory = path.join(root, "public", "fonts");
    const fontAssets = fs
      .readdirSync(fontDirectory)
      .filter((fileName) =>
        [".otf", ".ttf", ".woff", ".woff2"].includes(
          path.extname(fileName).toLowerCase(),
        ),
      );
    const fontPolicy = read("public/fonts/LICENSE.txt");
    const designSystem = read("docs/design-system.md");
    const layout = read("src/app/layout.tsx");
    const stylesheet = read("src/app/globals.css");

    expect(fontAssets.sort()).toEqual([
      "galano-grotesque-bold.otf",
      "galano-grotesque-light.otf",
      "galano-grotesque-medium.otf",
      "galano-grotesque-regular.otf",
    ]);
    expect(fontPolicy).toContain("Privately held");
    expect(fontPolicy).toContain("repository owner attested");
    expect(fontPolicy).toContain("This notice is not the license");
    expect(fontPolicy).not.toContain("License file:   (pending");
    expect(designSystem).toContain(
      "Galano Grotesque (licensed brand face, © 2014 René Bieder) for every non-code product UI role",
    );
    expect(designSystem).toContain("Monaco is the sole exception");
    expect(layout).toMatch(/\/fonts\/.*\.otf/u);
    expect(stylesheet).toMatch(/@font-face|\/fonts\/.*\.otf/u);
  });

  it("documents post-deploy recovery when bootstrap passwords were unset", () => {
    const runbook = read("docs/operator-provisioning.md");

    expect(runbook).toContain(
      "If its `BOOTSTRAP_*_PASSWORD` was unset at first database access",
    );
    expect(runbook).toContain(
      "fly ssh console --app eastern-state-kpi-dashboard",
    );
    expect(runbook).toContain(
      'read -r -s -p "New password: " SETUP_ADMIN_PASSWORD',
    );
    expect(runbook).toContain(
      'SETUP_ADMIN_EMAIL="zach@easternstate.org"',
    );
    expect(runbook).toContain(
      "node node_modules/tsx/dist/cli.mjs scripts/setup-admin.ts",
    );
    expect(runbook).toMatch(/there is no\s+password to recover or share/u);
  });

  it("pins the reviewed Fly VM and single-Machine deployment contract", () => {
    const fly = read("fly.toml");
    const runbook = read("docs/production-observability.md");

    expect(fly).toMatch(/\[deploy\][\s\S]*?strategy = "immediate"/u);
    expect(fly).toMatch(
      /\[\[vm\]\][\s\S]*?size = "shared-cpu-1x"[\s\S]*?memory = "512mb"/u,
    );
    expect(fly).toContain("SINGLE_MACHINE_SQLITE_CONTRACT");
    expect(runbook).toContain(
      "fly scale count 1 --process-group app --app eastern-state-kpi-dashboard",
    );
    for (const inventoryCommand of [
      "fly scale show --app eastern-state-kpi-dashboard",
      "fly status --app eastern-state-kpi-dashboard",
      "fly machine list --app eastern-state-kpi-dashboard",
      "fly volumes list --app eastern-state-kpi-dashboard",
    ]) {
      expect(runbook).toContain(inventoryCommand);
    }
    expect(runbook).toContain(
      "fly volumes snapshots create <volume-id> --app eastern-state-kpi-dashboard",
    );
    expect(runbook).toContain(
      "fly volumes snapshots list <volume-id> --app eastern-state-kpi-dashboard",
    );
    expect(runbook).toContain("unmanaged Machine");
    expect(runbook).toContain("other process groups");

    const initialInventory = runbook.indexOf(
      "fly scale show --app eastern-state-kpi-dashboard",
    );
    const snapshot = runbook.indexOf(
      "fly volumes snapshots create <volume-id> --app eastern-state-kpi-dashboard",
    );
    const scaleDown = runbook.indexOf(
      "fly scale count 1 --process-group app --app eastern-state-kpi-dashboard",
    );
    expect(initialInventory).toBeGreaterThan(-1);
    expect(snapshot).toBeGreaterThan(initialInventory);
    expect(scaleDown).toBeGreaterThan(snapshot);
  });

  it("publishes only actionable container findings to code scanning", () => {
    const workflow = read(".github/workflows/container-security.yml");
    const sarif = workflow.slice(
      workflow.indexOf("- name: Generate actionable SARIF report"),
      workflow.indexOf("- name: Generate human-readable report"),
    );
    const table = workflow.slice(
      workflow.indexOf("- name: Generate human-readable report"),
      workflow.indexOf("- name: Add report to job summary"),
    );
    const blocking = workflow.slice(
      workflow.indexOf("- name: Block fixable high and critical vulnerabilities"),
    );

    expect(sarif).toContain("severity: HIGH,CRITICAL");
    expect(sarif).toContain("ignore-unfixed: true");
    expect(table).toContain("severity: UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL");
    expect(table).toContain("ignore-unfixed: false");
    expect(blocking).toContain("severity: HIGH,CRITICAL");
    expect(blocking).toContain("ignore-unfixed: true");
  });

  it("always emits a stable container-security contract", () => {
    const workflow = readWorkflow(".github/workflows/container-security.yml");
    const pullRequestTrigger = workflow.on?.pull_request;
    const scope = requiredJob(workflow, "scan_scope");
    const trivy = requiredJob(workflow, "trivy");
    const gate = requiredJob(workflow, "container_security");
    const classifier =
      requiredStep(scope, "Decide whether the production image changed").run ?? "";
    const enforcement =
      requiredStep(gate, "Enforce the container scan contract").run ?? "";

    expect(pullRequestTrigger).toEqual({ branches: ["master"] });
    expect(scope.name).toBe("Container scan decision");
    expect(trivy.if).toBe("needs.scan_scope.outputs.scan_required == 'true'");
    expect(gate.name).toBe("Production container security");
    expect(gate.needs).toEqual(["scan_scope", "trivy"]);
    expect(gate.if).toBe("${{ always() }}");
    expect(classifier).toContain("git diff --no-renames --name-only -z");
    expect(classifier).toContain(
      'if ! git diff --no-renames --name-only -z "$BASE_SHA" "$HEAD_SHA" > "$changed_paths_file"; then',
    );
    expect(classifier).not.toContain("done < <(");
    expect(classifier).toContain("docs/*|security-audit/*|wiki/*|*.md|*.pdf|*.txt)");
    expect(classifier).toMatch(/\*\)\s+scan_required=true/u);
    expect(enforcement).toContain('if [[ "$SCOPE_RESULT" != "success" ]]');
    expect(enforcement).toContain('if [[ "$SCAN_RESULT" != "success" ]]');
    expect(enforcement).toContain('if [[ "$SCAN_RESULT" != "skipped" ]]');
  });

  it("fails release readiness closed on stale or red exact-commit scans", () => {
    const workflow = readWorkflow(".github/workflows/release-security.yml");
    const job = requiredJob(workflow, "verify_container");
    const verification = requiredStep(job, "Verify the latest exact-commit container scan").run ?? "";

    expect(workflow.on).toEqual({ workflow_dispatch: null });
    expect(workflow.permissions).toEqual({ actions: "read", contents: "read" });
    expect(job.name).toBe("Release container readiness");
    expect(verification).toContain('if [[ "$RELEASE_REF" != "$default_ref" ]]');
    expect(verification).toContain('if [[ "$RELEASE_SHA" != "$current_default_sha" ]]');
    expect(verification.match(/container-security\.yml\/runs/gu)).toHaveLength(2);
    expect(verification.match(/commits\/\$default_branch/gu)).toHaveLength(2);
    expect(verification.match(/sort_by\(\[\.updated_at, \.id\]\)/gu)).toHaveLength(2);
    expect(verification).toContain('if [[ "$run_status" != "completed" || "$run_conclusion" != "success" ]]');
    expect(verification).toContain('if [[ "$scan_conclusion" != "success" ]]');
    expect(verification).toContain('if [[ "$gate_conclusion" != "success" ]]');
    expect(verification).toContain('"$final_run_attempt" != "$run_attempt"');
    expect(verification).toContain('if [[ "$final_run_status" != "completed" || "$final_run_conclusion" != "success" ]]');
  });

  it("pins top-level and per-job permissions for every workflow", () => {
    // Finding S052-C4: GITHUB_TOKEN privilege drift (write scopes, OIDC
    // id-token minting) must fail this suite, not pass silently. Every
    // workflow's top-level map and every job-level override is pinned
    // exactly; adding or widening a permission requires editing this map.
    const expected: Record<
      string,
      { top: Record<string, unknown>; jobs: Record<string, Record<string, unknown> | undefined> }
    > = {
      "codeql.yml": {
        top: { contents: "read" },
        jobs: { analyze: { contents: "read", "security-events": "write" } },
      },
      "container-security.yml": {
        top: { contents: "read" },
        jobs: {
          scan_scope: undefined,
          trivy: { contents: "read", "security-events": "write" },
          container_security: undefined,
        },
      },
      "dependency-review.yml": {
        top: { contents: "read" },
        jobs: { "dependency-review": undefined },
      },
      "quality.yml": {
        top: { contents: "read" },
        jobs: {
          typecheck: undefined,
          lint: undefined,
          "unit-tests": undefined,
          build: undefined,
          e2e: undefined,
          dependencies: undefined,
          secrets: undefined,
          semgrep: undefined,
        },
      },
      "release-security.yml": {
        top: { actions: "read", contents: "read" },
        jobs: { verify_container: undefined },
      },
      "scorecard.yml": {
        top: { contents: "read" },
        jobs: {
          analysis: {
            contents: "read",
            "security-events": "write",
            "id-token": "write",
          },
        },
      },
    };

    const seen = new Set<string>();
    for (const [filename, workflow] of workflowEntries()) {
      const policy = expected[filename];
      expect(policy, `no permissions policy pinned for ${filename}`).toBeDefined();
      seen.add(filename);
      expect(workflow.permissions, `${filename} top-level permissions`).toEqual(policy.top);
      const actualJobs = Object.fromEntries(
        Object.entries(workflow.jobs ?? {}).map(([jobId, job]) => [jobId, job.permissions]),
      );
      expect(actualJobs, `${filename} per-job permissions`).toEqual(policy.jobs);
    }
    expect([...seen].sort()).toEqual(Object.keys(expected).sort());
  });

  it("keeps the gitleaks ruleset pinned, explicit, and unshadowable", () => {
    // Finding S052-C2: gitleaks v8 auto-loads <target>/.gitleaks.toml when
    // --config is absent, and GITLEAKS_CONFIG* env vars redirect the scan.
    // The gate must pass an explicit pinned config, no repo-root override
    // file may exist, and the runner must strip the env lever.
    for (const override of [".gitleaks.toml", ".gitleaks.yaml", ".gitleaks.yml"]) {
      expect(
        fs.existsSync(path.join(root, override)),
        `${override} would silently replace the gitleaks ruleset`,
      ).toBe(false);
    }

    const runner = read("scripts/run-gitleaks.mjs");
    expect(runner).toContain('--config=${GITLEAKS_CONFIG}');
    expect(runner).toContain('"security/gitleaks.toml"');
    expect(runner).toContain('"GITLEAKS_CONFIG"');
    expect(runner).toContain("stripEnvPrefixes");

    const tooling = read("scripts/security-tooling.mjs");
    expect(tooling).toContain("stripEnvPrefixes");

    const pinnedConfig = read("security/gitleaks.toml");
    expect(pinnedConfig).toContain("useDefault = true");
  });

  it("uses vendored Semgrep packs with the container network disabled", () => {
    // Finding S046-C1: registry packs (p/nodejs, p/react) fetched at scan
    // time make gate coverage mutable. The runner must reference only the
    // vendored snapshots and run the container with no network.
    const runner = read("scripts/run-semgrep.mjs");
    expect(runner).not.toContain('"p/nodejs"');
    expect(runner).not.toContain('"p/react"');
    expect(runner).not.toMatch(/["']p\//u);
    expect(runner).toContain('"security/semgrep/p-nodejs.yml"');
    expect(runner).toContain('"security/semgrep/p-react.yml"');
    expect(runner).toContain("network: false");
    expect(fs.existsSync(path.join(root, "security/semgrep/p-nodejs.yml"))).toBe(true);
    expect(fs.existsSync(path.join(root, "security/semgrep/p-react.yml"))).toBe(true);
    expect(fs.existsSync(path.join(root, "security/semgrep/SNAPSHOT.md"))).toBe(true);
  });

  it("documents the OSV live advisory data variance", () => {
    // Finding S052-C3: the OSV gate queries live api.osv.dev data at scan
    // time; the variance and its corroborating controls must be documented.
    const doc = read("security/osv-advisory-data.md");
    expect(doc).toContain("api.osv.dev");
    const runner = read("scripts/run-osv-scanner.mjs");
    expect(runner).toContain("security/osv-advisory-data.md");
  });

  it("keeps the brace-expansion advisory exception exact, owned, and expiring", () => {
    const config = read("osv-scanner.toml");
    const dependencyReview = read(".github/workflows/dependency-review.yml");
    const lock = JSON.parse(read("package-lock.json")) as {
      packages?: Record<
        string,
        {
          version?: string;
          dev?: boolean;
          integrity?: string;
          dependencies?: Record<string, string>;
        }
      >;
    };
    const packages = lock.packages ?? {};
    expect(config).toContain('id = "GHSA-mh99-v99m-4gvg"');
    expect(config).toContain("ignoreUntil = 2026-08-29");
    expect(config).toContain("Owner: repository maintainer");
    expect(config).toContain("brace-expansion@1.1.17");
    expect(config.match(/\[\[IgnoredVulns\]\]/gu)).toHaveLength(1);
    expect(dependencyReview).toContain(
      "allow-ghsas: GHSA-mh99-v99m-4gvg",
    );
    expect(dependencyReview.match(/allow-ghsas:/gu)).toHaveLength(1);
    expect(Date.now()).toBeLessThan(Date.parse("2026-08-30T00:00:00Z"));

    const legacyBraceEntries = Object.entries(packages)
      .filter(
        ([packagePath, metadata]) =>
          packagePath.endsWith("/brace-expansion") &&
          metadata.version !== "5.0.8",
      )
      .map(([packagePath, metadata]) => ({
        packagePath,
        version: metadata.version,
        dev: metadata.dev,
      }));
    expect(legacyBraceEntries).toEqual([
      {
        packagePath: "node_modules/minimatch/node_modules/brace-expansion",
        version: "1.1.17",
        dev: true,
      },
    ]);
    expect(packages["node_modules/minimatch"]).toMatchObject({
      version: "3.1.5",
      dev: true,
      dependencies: { "brace-expansion": "^1.1.7" },
    });
    const exactArtifactPath =
      "node_modules/minimatch/node_modules/brace-expansion";
    expect(packages[exactArtifactPath]).toMatchObject({
      version: "1.1.17",
      dev: true,
      integrity:
        "sha512-w+aeW/mkgM4PyRMOJCgi3fOrTm5Q8QY1OSfn2TO2iuDj3ezIHqejmuxbjfPrqUkgqRew1iqkyAn0tr0ZwHD9+w==",
    });
    const installedSource = read(`${exactArtifactPath}/index.js`);
    expect(installedSource).toContain("EXPANSION_MAX_LENGTH = 4000000");
    expect(installedSource).toContain("maxLength");

    const requireFromTest = createRequire(import.meta.url);
    const expand = requireFromTest(path.join(root, exactArtifactPath)) as (
      value: string,
      options: { maxLength: number },
    ) => string[];
    const maxLength = 1_000;
    const expanded = expand("{a,b}".repeat(30), { maxLength });
    const totalCharacters = expanded.reduce(
      (sum, value) => sum + value.length,
      0,
    );
    expect(expanded.length).toBeGreaterThan(0);
    expect(totalCharacters).toBeLessThanOrEqual(maxLength);
    for (const plugin of [
      "eslint-plugin-import",
      "eslint-plugin-jsx-a11y",
      "eslint-plugin-react",
    ]) {
      expect(
        packages[`node_modules/eslint-config-next/node_modules/${plugin}`],
      ).toMatchObject({
        dev: true,
        dependencies: { minimatch: "^3.1.2" },
      });
    }
  });

  it("fails closed when the committed OpenKnowledge MCP launcher has no local bundle", () => {
    // Finding S045-C2: the committed .mcp.json must never auto-execute
    // unpinned remote code (npx -y @inkeep/open-knowledge@latest). The
    // launcher uses the pinned local app bundle or exits 127 with an
    // install hint.
    const config = read(".mcp.json");
    expect(config).not.toContain("@latest");
    expect(config).not.toContain("exec npx");
    expect(config).not.toContain("npx");
    expect(config).toContain("OpenKnowledge.app");
    expect(config).toContain("exit 127");
  });

  it("gates dependency install scripts against the lockfile", () => {
    // Finding S046-C2: validate before npm runs, install with scripts disabled,
    // then replay only the exact approved lifecycle package identities.
    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    const quality = read(".github/workflows/quality.yml");
    const dockerfile = read("Dockerfile");
    const installer = read("scripts/install-dependencies.mjs");

    expect(pkg.scripts?.["install:controlled"]).toBe("node scripts/install-dependencies.mjs");
    expect(pkg.scripts?.["install-scripts:guard"]).toBe("node scripts/install-scripts-guard.mjs");
    expect(pkg.scripts?.["quality:guards"]).toContain("install-scripts:guard");
    expect(fs.existsSync(path.join(root, "scripts/install-scripts-guard.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts/install-dependencies.mjs"))).toBe(true);
    expect(quality.match(/node scripts\/install-dependencies\.mjs/gu)).toHaveLength(6);
    expect(quality).not.toMatch(/-\s+run:\s+npm ci(?:\s|$)/u);
    expect(dockerfile.match(/node \.\/scripts\/install-dependencies\.mjs/gu)).toHaveLength(2);
    expect(dockerfile).not.toMatch(/(?:RUN|&&)\s+npm ci(?:\s|$)/u);
    expect(dockerfile).toContain(
      "node ./scripts/install-dependencies.mjs --omit=dev --omit=peer",
    );
    expect(installer).toContain(
      '["ci", "--ignore-scripts", "--no-audit", "--no-fund", ...omitArgs]',
    );
    expect(installer).toContain('"--ignore-scripts=false"');
  });

  it("uses the digest-pinned Semgrep image without an in-workflow pip install", () => {
    const runner = read("scripts/run-semgrep.mjs");
    const quality = read(".github/workflows/quality.yml");

    expect(runner).toMatch(
      /semgrep\/semgrep:\$\{SEMGREP_VERSION\}@sha256:[0-9a-f]{64}/u,
    );
    expect(runner).toContain(
      'dockerArgs(SEMGREP_IMAGE, ["semgrep", ...scanArgs], {',
    );
    expect(quality).not.toContain("pip install");
    expect(quality).not.toContain("actions/setup-python");
    expect(runner).not.toContain('scanner.kind === "local"');
    expect(runner).not.toContain("scanner.executable");
  });

  it("pins Docker fallback scanners to reviewed image digests", () => {
    const osv = read("scripts/run-osv-scanner.mjs");
    const gitleaks = read("scripts/run-gitleaks.mjs");

    expect(osv).toContain(
      "ghcr.io/google/osv-scanner:v${OSV_SCANNER_VERSION}@sha256:64e86bec6df2466feea5137fc7c78fb3b7c21ec077f014d7130f64810e50676b",
    );
    expect(gitleaks).toContain(
      "ghcr.io/gitleaks/gitleaks:v${GITLEAKS_VERSION}@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f",
    );
  });

  it("fails closed when the local OpenKnowledge MCP bundle is unavailable", () => {
    const config = read("opencode.json");

    expect(config).not.toContain("@latest");
    expect(config).not.toContain("exec npx");
    expect(config).toContain("$HOME/Applications/OpenKnowledge.app");
    expect(config).toContain("/Applications/OpenKnowledge.app");
    expect(config).toContain("exit 127");
  });

  it("publishes a private vulnerability reporting path", () => {
    const policy = read("SECURITY.md");

    expect(policy).toContain("Do not open a public issue");
    expect(policy).toContain("/security/advisories/new");
  });
});
