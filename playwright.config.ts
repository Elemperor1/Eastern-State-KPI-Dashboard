import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  createE2EDatabaseRun,
  E2E_DATABASE_RUN_METADATA_KEY,
} from "./scripts/e2e-database";

const port = Number(process.env.E2E_PORT ?? 3291);
const baseURL = `http://127.0.0.1:${port}`;
const databaseRun = createE2EDatabaseRun({
  port,
  explicitPath: process.env.E2E_DATABASE_PATH,
});
const adminPassword = `E2E-${randomBytes(24).toString("base64url")}`;
const sessionSecret = randomBytes(48).toString("base64url");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  outputDir: path.join(os.tmpdir(), "eastern-state-kpi-playwright"),
  globalTeardown: "./e2e/global-teardown.ts",
  metadata: {
    [E2E_DATABASE_RUN_METADATA_KEY]: databaseRun,
    e2eAdminPassword: adminPassword,
  },
  reporter: "line",
  use: {
    baseURL,
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    // Exercise the production Webpack build so acceptance does not depend on
    // development-only on-demand compilation. The suite still uses a real
    // credentialed session against its private disposable database.
    command: "bash ./scripts/e2e-server.sh",
    env: {
      APP_CANONICAL_ORIGIN: baseURL,
      AUTH_DISABLED: "false",
      BIND_HOST: "127.0.0.1",
      BOOTSTRAP_ADMIN_PASSWORD: adminPassword,
      DATABASE_PATH: databaseRun.databasePath,
      PORT: String(port),
      SESSION_SECRET: sessionSecret,
      SESSION_SECURE: "false",
      SETUP_ADMIN_PASSWORD: adminPassword,
    },
    url: `${baseURL}/dashboard/overview`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
