import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadWindowsRuntimeEnvironment,
  parseWindowsStartArguments,
  validateWindowsRuntimeEnvironment,
  windowsNodeVersionIsSupported,
} from "./start-windows-production.mjs";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

/** Returns a complete non-secret production fixture. */
function validRuntime(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "production",
    AUTH_DISABLED: "false",
    DATABASE_PATH: "C:\\Database\\data\\kpi.db",
    PORT: "3000",
    APP_CANONICAL_ORIGIN: "https://strategy.easternstate.org",
    SESSION_SECURE: "true",
    TRUST_PROXY: "false",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    PLAN_ACTIVATION_BACKUP_DIR:
      "C:\\Database\\data\\plan-activation-backups",
    SUCCESSOR_PLANS_ENABLED: "false",
    ...overrides,
  };
}

/** Writes and tracks one runtime fixture. */
function writeRuntime(runtime: Record<string, string>): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "eastern-state-kpi-windows-start-"),
  );
  tempDirectories.push(directory);
  const envFile = path.join(directory, "runtime.env");
  fs.writeFileSync(
    envFile,
    Object.entries(runtime)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  return envFile;
}

describe("native Windows production startup", () => {
  it("accepts only the narrow launcher argument contract", () => {
    expect(
      parseWindowsStartArguments([
        "--check",
        "--env-file=C:\\ProgramData\\EasternStateKPI\\runtime.env",
      ]),
    ).toEqual({
      checkOnly: true,
      envFile: "C:\\ProgramData\\EasternStateKPI\\runtime.env",
    });
    expect(() => parseWindowsStartArguments([])).toThrow(/required/u);
    expect(() =>
      parseWindowsStartArguments(["--env-file=x", "--env-file=y"]),
    ).toThrow(/Only one/u);
    expect(() => parseWindowsStartArguments(["--verbose"])).toThrow(
      /Unsupported/u,
    );
  });

  it("makes the access-restricted file authoritative over inherited settings", () => {
    const envFile = writeRuntime(validRuntime());
    const runtime = loadWindowsRuntimeEnvironment(envFile, {
      NODE_ENV: "development",
      PATH: "safe-path",
      AUTH_DISABLED: "true",
      DATABASE_PATH: "C:\\wrong.db",
      NODE_OPTIONS: "--require malicious.js",
      BOOTSTRAP_ADMIN_PASSWORD: "stale-machine-secret",
    });

    expect(runtime.PATH).toBe("safe-path");
    expect(runtime.AUTH_DISABLED).toBe("false");
    expect(runtime.DATABASE_PATH).toBe("C:\\Database\\data\\kpi.db");
    expect(runtime.NODE_OPTIONS).toBeUndefined();
    expect(runtime.BOOTSTRAP_ADMIN_PASSWORD).toBeUndefined();
    expect(validateWindowsRuntimeEnvironment(runtime)).toEqual([]);
  });

  it("rejects unsafe Windows paths and production authentication settings", () => {
    const problems = validateWindowsRuntimeEnvironment(
      validRuntime({
        AUTH_DISABLED: "true",
        DATABASE_PATH: "\\\\fileserver\\share\\kpi.db",
        APP_CANONICAL_ORIGIN: "http://strategy.example.org/path",
        SESSION_SECURE: "false",
        TRUST_PROXY: "maybe",
        SESSION_SECRET: "short",
        PORT: "70000",
        PLAN_ACTIVATION_BACKUP_DIR: "\\\\fileserver\\activation",
        SUCCESSOR_PLANS_ENABLED: "sometimes",
      }),
    );

    expect(problems.join(" ")).toMatch(/AUTH_DISABLED/u);
    expect(problems.join(" ")).toMatch(/local fixed-disk/u);
    expect(problems.join(" ")).toMatch(/exact HTTPS origins/u);
    expect(problems.join(" ")).toMatch(/SESSION_SECURE/u);
    expect(problems.join(" ")).toMatch(/TRUST_PROXY/u);
    expect(problems.join(" ")).toMatch(/SESSION_SECRET/u);
    expect(problems.join(" ")).toMatch(/PORT/u);
    expect(problems.join(" ")).toMatch(/PLAN_ACTIVATION_BACKUP_DIR/u);
    expect(problems.join(" ")).toMatch(/SUCCESSOR_PLANS_ENABLED/u);
  });

  it("refuses documentation placeholders before first-boot account creation", () => {
    const problems = validateWindowsRuntimeEnvironment(
      validRuntime({
        APP_CANONICAL_ORIGIN: "https://strategic-plan.example.org",
        SESSION_SECRET: "<at-least-32-random-characters>",
        BOOTSTRAP_ADMIN_PASSWORD: "<temporary-password-for-zach>",
        BOOTSTRAP_VIEWER_PASSWORD: "<temporary-password-for-kerry>",
      }),
    );

    expect(problems.join(" ")).toMatch(/exact HTTPS origins/u);
    expect(problems.join(" ")).toMatch(/SESSION_SECRET/u);
    expect(problems.join(" ")).toMatch(/BOOTSTRAP_ADMIN_PASSWORD/u);
    expect(problems.join(" ")).toMatch(/BOOTSTRAP_VIEWER_PASSWORD/u);
  });

  it("accepts the declared Node release line", () => {
    expect(windowsNodeVersionIsSupported("24.14.9")).toBe(false);
    expect(windowsNodeVersionIsSupported("24.15.0")).toBe(true);
    expect(windowsNodeVersionIsSupported("26.0.0")).toBe(true);
  });

  it("checks the real launcher without printing credential values", () => {
    const adminSecret = "SENTINEL-WINDOWS-ADMIN-SECRET";
    const viewerSecret = "SENTINEL-WINDOWS-VIEWER-SECRET";
    const envFile = writeRuntime(
      validRuntime({
        BOOTSTRAP_ADMIN_PASSWORD: adminSecret,
        BOOTSTRAP_VIEWER_PASSWORD: viewerSecret,
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), "scripts", "start-windows-production.mjs"),
        "--check",
        `--env-file=${envFile}`,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(
      "[windows-start] runtime configuration passed.\n",
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(adminSecret);
    expect(`${result.stdout}${result.stderr}`).not.toContain(viewerSecret);
  });

  it("retains the startup task, low-privilege identity, ACL, and restart contracts", () => {
    const register = fs.readFileSync(
      path.join(process.cwd(), "scripts", "register-windows-startup.ps1"),
      "utf8",
    );
    const launcher = fs.readFileSync(
      path.join(process.cwd(), "scripts", "start-windows-production.ps1"),
      "utf8",
    );
    const lockfile = fs.readFileSync(
      path.join(process.cwd(), "package-lock.json"),
      "utf8",
    );

    expect(register).toContain('New-ScheduledTaskTrigger -AtStartup');
    expect(register).toContain('-UserId "S-1-5-19"');
    expect(register).toContain("-RestartCount 10");
    expect(register).toContain("[switch]$PrepareOnly");
    expect(register).toContain("--check");
    expect(register).toContain('"*S-1-5-19:(OI)(CI)M"');
    expect(register).toContain('Join-Path $AppRoot ".next\\cache"');
    expect(launcher).toContain("Remove-Item Env:NODE_OPTIONS");
    expect(launcher).toContain('"--env-file=$RuntimeEnvPath"');
    expect(lockfile).toContain("@next/swc-win32-x64-msvc");
    expect(lockfile).toContain("@img/sharp-win32-x64");
  });
});
