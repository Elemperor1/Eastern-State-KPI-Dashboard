import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  new URL("./UserManagerClient.tsx", import.meta.url),
  "utf8",
);

describe("user manager role-change confirmation contract", () => {
  it("gates role changes behind a confirmation dialog like delete and disable", () => {
    // Role selection must stage a pending target instead of mutating immediately.
    expect(component).toContain("roleChangeTarget");
    expect(component).toContain("setRoleChangeTarget");
    expect(component).not.toMatch(
      /onChange=\{\(event\) =>\s*runEventHandler\(\s*changeRole/,
    );
  });

  it("confirms the new role with the same dialog pattern as delete and disable", () => {
    expect(component).toContain("Change role for");
    expect(component).toContain('confirmLabel="Change role"');
  });
});
