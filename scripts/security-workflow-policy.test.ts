import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("security workflow policy", () => {
  it("pins every external GitHub Action to a full commit SHA", () => {
    const workflowDirectory = path.join(root, ".github", "workflows");
    const unpinned: string[] = [];

    for (const filename of fs.readdirSync(workflowDirectory).sort()) {
      if (!/\.ya?ml$/u.test(filename)) continue;
      const source = fs.readFileSync(path.join(workflowDirectory, filename), "utf8");
      for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)/gmu)) {
        const action = match[1];
        if (action.startsWith("./")) continue;
        const ref = action.slice(action.lastIndexOf("@") + 1);
        if (!/^[0-9a-f]{40}$/u.test(ref)) unpinned.push(`${filename}: ${action}`);
      }
    }

    expect(unpinned).toEqual([]);
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

  it("publishes a private vulnerability reporting path", () => {
    const policy = read("SECURITY.md");

    expect(policy).toContain("Do not open a public issue");
    expect(policy).toContain("/security/advisories/new");
  });
});
