import { describe, expect, it } from "vitest";
import {
  environmentWithoutAuthBypass,
  parseTaskNames,
  resolveTask,
  runTasks,
} from "./run-without-auth-bypass.mjs";

/**
 * The npm scripts previously cleared AUTH_DISABLED with the POSIX inline
 * env prefix (`AUTH_DISABLED= next typegen`), which cmd.exe cannot parse —
 * `npm run typecheck` and the whole `design-system:test` gate failed on
 * Windows before running any work. This suite pins the replacement's two
 * load-bearing properties: the bypass is cleared for every child, and the
 * task surface stays a closed allowlist rather than a general shell.
 */
describe("verification tasks without the auth bypass", () => {
  it("clears an exported AUTH_DISABLED from the child environment", () => {
    const environment = environmentWithoutAuthBypass({
      AUTH_DISABLED: "true",
      PATH: "/usr/bin",
    });

    expect(Object.hasOwn(environment, "AUTH_DISABLED")).toBe(false);
    expect(environment.PATH).toBe("/usr/bin");
  });

  it("leaves an environment without the bypass untouched", () => {
    expect(environmentWithoutAuthBypass({ PORT: "3000" })).toEqual({
      PORT: "3000",
    });
  });

  it("clears the bypass whatever case Windows inherited it in", () => {
    // Windows environment lookup is case-insensitive, so a surviving
    // `auth_disabled` key would still reach the child as
    // `process.env.AUTH_DISABLED`.
    const environment = environmentWithoutAuthBypass({
      auth_disabled: "true",
      Auth_Disabled: "1",
      PORT: "3000",
    });

    expect(Object.keys(environment)).toEqual(["PORT"]);
  });

  it("accepts the exact supported task names", () => {
    expect(parseTaskNames(["next-typegen", "tsc"])).toEqual([
      "next-typegen",
      "tsc",
    ]);
    expect(parseTaskNames(["build"])).toEqual(["build"]);
  });

  it("refuses an unsupported task instead of running it", () => {
    expect(() => parseTaskNames(["rm"])).toThrow(/Unsupported task: rm/u);
    expect(() => parseTaskNames([])).toThrow(/At least one task is required/u);
  });

  it("refuses a prototype-inherited property as a task name", () => {
    expect(() => parseTaskNames(["constructor"])).toThrow(
      /Unsupported task: constructor/u,
    );
  });

  it("invokes npm directly on POSIX rather than the Windows CLI resolver", () => {
    // `resolveNpmCli()` only probes `<node-bin>/node_modules/npm`; POSIX
    // installs put the CLI under `<prefix>/lib/node_modules/npm`, so
    // calling it on Linux would fail the required CI gate before the
    // production build started.
    expect(resolveTask("build", "linux")).toEqual(["npm", ["run", "build"]]);
    expect(resolveTask("build", "darwin")).toEqual(["npm", ["run", "build"]]);
  });

  it("runs a repository-local tool with the current Node binary", () => {
    const [executable, args] = resolveTask("tsc", "linux");

    expect(executable).toBe(process.execPath);
    expect(args[0]).toMatch(/typescript[\\/]bin[\\/]tsc$/u);
    expect(args[1]).toBe("--noEmit");
  });

  it("runs every named task in order", () => {
    const invoked: string[] = [];
    /** Records each resolved entry point instead of spawning it. */
    const runner = (_executable: string, args: string[]) => {
      invoked.push(args[0] ?? "");
      return 0;
    };

    expect(runTasks({ names: ["next-typegen", "tsc"], runner })).toBe(0);
    expect(invoked).toHaveLength(2);
    expect(invoked[0]).toMatch(/next/u);
    expect(invoked[1]).toMatch(/tsc/u);
  });

  it("stops at the first failing task and reports its status", () => {
    const invoked: string[] = [];
    /** Fails the first task so the second must not run. */
    const runner = (_executable: string, args: string[]) => {
      invoked.push(args[0] ?? "");
      return 2;
    };

    expect(runTasks({ names: ["next-typegen", "tsc"], runner })).toBe(2);
    expect(invoked).toHaveLength(1);
  });
});
