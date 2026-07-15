import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const qualityWorkflow = readFileSync(
  new URL("../../.github/workflows/quality.yml", import.meta.url),
  "utf8",
);
const codeqlWorkflow = readFileSync(
  new URL("../../.github/workflows/codeql.yml", import.meta.url),
  "utf8",
);
const runbook = readFileSync(
  new URL("../../docs/quality-and-security-gates.md", import.meta.url),
  "utf8",
);

describe("documented required GitHub checks", () => {
  it("uses the exact stable contexts emitted by the workflows", () => {
    expect(qualityWorkflow).toContain("name: Required CI Gate");
    expect(codeqlWorkflow).toContain("name: CodeQL (${{ matrix.language }})");
    expect(codeqlWorkflow).toContain("- javascript-typescript");
    expect(codeqlWorkflow).toContain("- python");

    for (const context of [
      "Required CI Gate",
      "CodeQL (javascript-typescript)",
      "CodeQL (python)",
    ]) {
      expect(runbook).toContain(`- \`${context}\``);
    }
    expect(runbook).not.toContain("- `Build`");
    expect(runbook).not.toContain("- `CodeQL`");
  });
});
