import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SMOKE_PATH = path.join(process.cwd(), "scripts", "smoke.sh");
const temporaryDirectories: string[] = [];

interface ProxyScenario {
  allowRemote?: boolean;
  base: string;
  proxyInCurlConfig?: boolean;
  proxyInEnvironment?: boolean;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

/** Runs the smoke harness until its first network failure and counts proxy use. */
async function runProxyScenario({
  allowRemote = false,
  base,
  proxyInCurlConfig = false,
  proxyInEnvironment = false,
}: ProxyScenario): Promise<number> {
  let proxyRequests = 0;
  const proxyServer = createServer((request) => {
    proxyRequests += 1;
    request.socket.destroy();
  });
  proxyServer.listen(0, "127.0.0.1");
  await once(proxyServer, "listening");
  const address = proxyServer.address();
  if (!address || typeof address === "string") {
    proxyServer.close();
    throw new Error("Expected the disposable proxy to use a TCP port.");
  }

  const temporaryHome = mkdtempSync(
    path.join(os.tmpdir(), "eskpi-smoke-network-"),
  );
  temporaryDirectories.push(temporaryHome);
  const proxyUrl = `http://127.0.0.1:${address.port}`;
  if (proxyInCurlConfig) {
    writeFileSync(
      path.join(temporaryHome, ".curlrc"),
      `proxy = "${proxyUrl}"\n`,
    );
  }

  const env = { ...process.env };
  for (const key of [
    "ALL_PROXY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "all_proxy",
    "http_proxy",
    "https_proxy",
    "no_proxy",
  ]) {
    delete env[key];
  }
  Object.assign(env, {
    AUTH_DISABLED: "true",
    BASE: base,
    CURL_HOME: temporaryHome,
    HOME: temporaryHome,
    SMOKE_ALLOW_REMOTE_BASE: allowRemote ? "true" : "false",
  });
  if (proxyInEnvironment) {
    Object.assign(env, {
      ALL_PROXY: proxyUrl,
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      all_proxy: proxyUrl,
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
    });
  }

  const child = spawn("bash", [SMOKE_PATH], {
    cwd: process.cwd(),
    env,
    stdio: "ignore",
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
  await once(child, "exit");
  clearTimeout(timeout);
  proxyServer.close();
  await once(proxyServer, "close");
  return proxyRequests;
}

describe("smoke harness loopback network policy", () => {
  it("ignores proxy environment variables for a loopback BASE", async () => {
    const proxyRequests = await runProxyScenario({
      base: "http://127.0.0.1:1",
      proxyInEnvironment: true,
    });

    expect(proxyRequests).toBe(0);
  });

  it("ignores curl configuration for a loopback BASE", async () => {
    const proxyRequests = await runProxyScenario({
      base: "http://127.0.0.1:1",
      proxyInCurlConfig: true,
    });

    expect(proxyRequests).toBe(0);
  });

  it("preserves proxy behavior for an explicitly allowed remote BASE", async () => {
    const proxyRequests = await runProxyScenario({
      allowRemote: true,
      base: "http://example.invalid",
      proxyInEnvironment: true,
    });

    expect(proxyRequests).toBeGreaterThan(0);
  });

  it("preserves curl configuration for an explicitly allowed remote BASE", async () => {
    const proxyRequests = await runProxyScenario({
      allowRemote: true,
      base: "http://example.invalid",
      proxyInCurlConfig: true,
    });

    expect(proxyRequests).toBeGreaterThan(0);
  });
});
