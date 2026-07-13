import { defineConfig } from "@playwright/test";
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
    // Polling avoids macOS/sandbox watcher exhaustion (EMFILE) during the
    // browser suite while retaining the loopback-only development bypass.
    command: "npm run db:seed && npm run dev",
    env: {
      APP_CANONICAL_ORIGIN: baseURL,
      AUTH_DISABLED: "true",
      BIND_HOST: "127.0.0.1",
      DATABASE_PATH: databaseRun.databasePath,
      PORT: String(port),
      WATCHPACK_POLLING: "true",
      WATCHPACK_POLLING_INTERVAL: "1000",
    },
    url: `${baseURL}/dashboard/overview`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
