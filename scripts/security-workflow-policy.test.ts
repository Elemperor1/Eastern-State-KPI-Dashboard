import fs from "node:fs";
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

  it("uses the digest-pinned Semgrep image without an in-workflow pip install", () => {
    const runner = read("scripts/run-semgrep.mjs");
    const quality = read(".github/workflows/quality.yml");

    expect(runner).toMatch(
      /semgrep\/semgrep:\$\{SEMGREP_VERSION\}@sha256:[0-9a-f]{64}/u,
    );
    expect(runner).toContain(
      'dockerArgs(SEMGREP_IMAGE, ["semgrep", ...scanArgs])',
    );
    expect(quality).not.toContain("pip install");
    expect(quality).not.toContain("actions/setup-python");
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
