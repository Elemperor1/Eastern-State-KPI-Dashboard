import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { chromium } from "@playwright/test";

const gzipAsync = promisify(gzip);

const base = process.env.BASE ?? "http://127.0.0.1:3290";
const profileMode = process.env.PERF_PROFILE_MODE === "baseline"
  ? "baseline"
  : "current";
const outputPath = resolve(
  process.env.PERF_OUTPUT ??
    (profileMode === "baseline"
      ? "docs/performance/issue-42-baseline-profile.json"
      : "docs/performance/issue-42-profile.json"),
);
const traceDirectory = resolve(
  process.env.PERF_TRACE_DIR ?? "docs/performance/traces",
);
const email = process.env.PERF_EMAIL;
const password = process.env.PERF_PASSWORD;

const routes = profileMode === "baseline"
  ? [
      ["Overview", "/dashboard/overview?year=2026"],
      ["Data Entry", "/admin/strategy-data?year=2026"],
      ["Reports", "/dashboard/trends?year=2026"],
      ["Setup", "/admin"],
    ]
  : [
      ["Overview", "/dashboard/overview?year=2026"],
      ["Data Entry", "/data-entry?year=2026"],
      ["Reports", "/reports?view=board&year=2026"],
      ["Setup", "/setup?area=measures&year=2026"],
    ];

const profiles = [
  {
    name: "desktop",
    context: { viewport: { width: 1280, height: 900 } },
    cpuRate: 1,
    network: null,
  },
  {
    name: "throttled-mobile",
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      hasTouch: true,
      isMobile: true,
    },
    cpuRate: 4,
    network: {
      offline: false,
      latency: 150,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
      connectionType: "cellular4g",
    },
  },
];

async function authenticatedState(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let me = await context.request.get(`${base}/api/auth/me`);
  let current = await me.json();
  if (!current.user) {
    if (!email || !password) {
      throw new Error("PERF_EMAIL and PERF_PASSWORD are required for an auth-enabled server");
    }
    const login = await context.request.post(`${base}/api/auth/login`, {
      data: { email, password },
    });
    if (!login.ok()) {
      throw new Error(`Performance login failed with HTTP ${login.status()}`);
    }
    me = await context.request.get(`${base}/api/auth/me`);
    current = await me.json();
  }
  if (!current.user) {
    throw new Error("Performance login did not produce a server-confirmed session");
  }
  const state = await context.storageState();
  await context.close();
  return state;
}

async function applyProfile(page, profile) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuRate });
  if (profile.network) {
    await cdp.send("Network.emulateNetworkConditions", profile.network);
  }
  return cdp;
}

async function startTrace(cdp) {
  await cdp.send("Tracing.start", {
    categories: [
      "-*",
      "blink.user_timing",
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-devtools.timeline.frame",
      "latencyInfo",
      "loading",
      "navigation",
      "toplevel",
      "v8.execute",
    ].join(","),
    options: "sampling-frequency=10000",
    transferMode: "ReturnAsStream",
  });
}

async function stopTrace(cdp, tracePath) {
  const complete = new Promise((resolveComplete) => {
    cdp.once("Tracing.tracingComplete", resolveComplete);
  });
  await cdp.send("Tracing.end");
  const event = await complete;
  if (!event.stream) {
    throw new Error(`Chrome did not return a trace stream for ${tracePath}`);
  }

  const chunks = [];
  while (true) {
    const chunk = await cdp.send("IO.read", { handle: event.stream });
    chunks.push(
      chunk.base64Encoded
        ? Buffer.from(chunk.data, "base64")
        : Buffer.from(chunk.data),
    );
    if (chunk.eof) break;
  }
  await cdp.send("IO.close", { handle: event.stream });
  await writeFile(tracePath, await gzipAsync(Buffer.concat(chunks), { level: 9 }));
}

async function measure(browser, storageState, profile, destination, path) {
  const context = await browser.newContext({ ...profile.context, storageState });
  const page = await context.newPage();
  const cdp = await applyProfile(page, profile);
  await page.addInitScript(() => {
    window.__issue42Lcp = null;
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      window.__issue42Lcp = entries.at(-1)?.startTime ?? null;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  const tracePrefix = profileMode === "baseline" ? "issue-42-baseline" : "issue-42";
  const traceName = `${tracePrefix}-${profile.name}-${destination.toLowerCase().replaceAll(" ", "-")}.json.gz`;
  const tracePath = resolve(traceDirectory, traceName);
  let traceStarted = false;
  try {
    await startTrace(cdp);
    traceStarted = true;
    const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const scripts = performance
        .getEntriesByType("resource")
        .filter((entry) => entry.initiatorType === "script");
      return {
        serverResponseMs: Math.round(navigation.responseStart - navigation.requestStart),
        domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
        loadMs: Math.round(navigation.loadEventEnd),
        lcpMs: window.__issue42Lcp === null ? null : Math.round(window.__issue42Lcp),
        decodedDocumentBytes: navigation.decodedBodySize,
        decodedJavaScriptBytes: scripts.reduce(
          (total, entry) => total + entry.decodedBodySize,
          0,
        ),
        routeScriptCount: scripts.length,
        domElements: document.querySelectorAll("*").length,
        boardReportPresent: Boolean(
          document.querySelector("#board-report-root, [data-strategic-board-report]"),
        ),
        finalPath: window.location.pathname,
      };
    });
    await stopTrace(cdp, tracePath);
    traceStarted = false;
    return {
      profile: profile.name,
      destination,
      path,
      status: response?.status() ?? null,
      traceFile: relative(process.cwd(), tracePath),
      ...metrics,
    };
  } finally {
    if (traceStarted) {
      await cdp.send("Tracing.end").catch(() => {});
    }
    await context.close();
  }
}

await mkdir(traceDirectory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  const storageState = await authenticatedState(browser);
  for (const profile of profiles) {
    for (const [destination, path] of routes) {
      results.push(await measure(browser, storageState, profile, destination, path));
    }
  }
} finally {
  await browser.close();
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({
    recordedAt: new Date().toISOString(),
    base,
    profileMode,
    profiles: {
      desktop: "1280x900, no network or CPU throttle",
      "throttled-mobile": "390x844, 4x CPU, 150 ms RTT, 1.6 Mbps down, 0.75 Mbps up",
    },
    results,
  }, null, 2)}\n`,
);

console.table(results);
console.log(`Performance evidence written to ${outputPath}`);

const failures = [];
for (const result of results) {
  if (result.status !== 200) failures.push(`${result.profile} ${result.destination} returned ${result.status}`);
  if (result.finalPath === "/login") failures.push(`${result.profile} ${result.destination} was not authenticated`);
}
if (profileMode === "current") {
  for (const overview of results.filter((result) => result.destination === "Overview")) {
    const lcpLimit = overview.profile === "desktop" ? 2_000 : 4_000;
    if (overview.serverResponseMs >= 2_000) failures.push(`${overview.profile} Overview response exceeded 2 seconds`);
    if (overview.lcpMs === null || overview.lcpMs >= lcpLimit) failures.push(`${overview.profile} Overview LCP exceeded ${lcpLimit} ms`);
    if (overview.decodedDocumentBytes >= 250_000) failures.push(`${overview.profile} Overview document exceeded 250 KB`);
    if (overview.domElements >= 1_000) failures.push(`${overview.profile} Overview DOM exceeded 1,000 elements`);
    if (overview.boardReportPresent) failures.push(`${overview.profile} Overview loaded the Board Report`);
  }
}

if (failures.length > 0) throw new Error(failures.join("; "));
