// scripts/trends-screenshots.mjs — Playwright capture of all 3 axis-mode tabs
// on /dashboard/trends. Reads AUTH_DISABLED and BASE from env; defaults to
// AUTH_DISABLED=true + http://127.0.0.1:3300.
//
// Outputs PNGs to output/playwright/trends-{shared,log,indexed}.png
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE = process.env.BASE ?? "http://127.0.0.1:3300";
const OUT_DIR = resolve(__dirname, "..", "output", "playwright");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const modes = [
  { value: "shared", file: "trends-shared.png" },
  { value: "log", file: "trends-log.png" },
  { value: "indexed", file: "trends-indexed.png" },
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();

console.log(`[trends-screenshots] BASE=${BASE}`);
console.log(`[trends-screenshots] navigating to /dashboard/trends`);
await page.goto(`${BASE}/dashboard/trends`, { waitUntil: "networkidle" });

// The chart is recharts-rendered via ResponsiveContainer; give it a beat to draw.
await page.waitForSelector("svg.recharts-surface", { timeout: 15_000 });
await page.waitForTimeout(400);

for (const mode of modes) {
  const label =
    mode.value === "shared"
      ? "Shared"
      : mode.value === "log"
        ? "Per-series (log)"
        : "Per-series (indexed)";
  const tab = page.getByRole("tab", { name: label, exact: true });
  await tab.click();
  // Wait for recharts to redraw.
  await page.waitForTimeout(600);
  const target = resolve(OUT_DIR, mode.file);
  await page.screenshot({ path: target, fullPage: false });
  console.log(`[trends-screenshots] wrote ${target} (mode=${mode.value})`);
}

await browser.close();
console.log("[trends-screenshots] done");
