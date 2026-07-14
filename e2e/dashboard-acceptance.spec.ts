import { expect, test, type Download, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { e2eDatabaseRunFromMetadata } from "../scripts/e2e-database";

const ATOMIC_MEASURE = "Diverse Audiences — Programs co-created with community organizations";
const COMPONENT_MEASURE = "Interpretive Site Plan — Visitor & community feedback participation";
const DISTRIBUTION_MEASURE = "Partnerships & Recognition — Diverse demographic representation in audience";
const ENTRY_YEAR = 2029;
const EXPORT_TIMEOUT = 60_000;

test.describe.configure({ mode: "serial" });

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function downloadedBytes(
  download: Download,
  extension: "csv" | "png" | "pdf",
): Promise<Buffer> {
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const bytes = await readFile(filePath!);
  if (extension === "png") {
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(500);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(500);
  } else if (extension === "pdf") {
    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  }
  return bytes;
}

async function openChecklistItem(
  page: Page,
  measureName: string,
  period: "annual:0" | "cumulative:0",
) {
  await page.goto(`/data-entry?year=${ENTRY_YEAR}&period=${encodeURIComponent(period)}`);
  await expect(page.getByRole("heading", { name: "Reporting checklist" })).toBeVisible();
  const item = page.getByRole("button", { name: new RegExp(measureName) });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(/\/data-entry\?.*kpi=\d+/);
  const selectedUrl = new URL(page.url());
  expect(selectedUrl.searchParams.get("period")).toBe(period);
  expect(selectedUrl.searchParams.get("kpi")).toMatch(/^\d+$/);
  return `${selectedUrl.pathname}${selectedUrl.search}`;
}

test.beforeAll(async ({}, testInfo) => {
  const run = e2eDatabaseRunFromMetadata(testInfo.config.metadata);
  const db = new DatabaseSync(run.databasePath);
  db.exec("PRAGMA busy_timeout = 5000");
  const distribution = db.prepare(`
    SELECT k.id AS kpi_id, c.id AS configuration_id
    FROM kpis k
    JOIN kpi_measurement_configs c ON c.kpi_id = k.id
    WHERE k.slug = 'justice-ed-diverse-demographics'
      AND c.effective_from_year <= 2029
      AND (c.effective_to_year IS NULL OR c.effective_to_year >= 2029)
      AND c.archived_at IS NULL
    ORDER BY c.effective_from_year DESC
    LIMIT 1
  `).get() as { kpi_id: number; configuration_id: number } | undefined;
  if (!distribution) throw new Error("Distribution acceptance fixture is missing.");

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      UPDATE kpi_measurement_configs
      SET configuration_status = 'active',
          unresolved_question = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(distribution.configuration_id);
    const insertBand = db.prepare(`
      INSERT OR IGNORE INTO distribution_bands (
        kpi_id, component_id, slug, label, effective_from_year,
        effective_to_year, display_order, is_unknown, is_declined,
        derived_group, created_by, updated_by
      ) VALUES (?, NULL, ?, ?, 2025, 2029, ?, 0, 0, ?, -1, -1)
    `);
    insertBand.run(
      distribution.kpi_id,
      "community-partners",
      "Community partners",
      0,
      "non_white",
    );
    insertBand.run(
      distribution.kpi_id,
      "other-participants",
      "Other participants",
      1,
      "white",
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
});

test.beforeEach(async ({ page }, testInfo) => {
  const password = testInfo.config.metadata.e2eAdminPassword;
  if (!password) throw new Error("The ephemeral e2e admin password is missing.");
  const response = await page.request.post("/api/auth/login", {
    data: {
      email: "kerry@easternstate.org",
      password,
    },
  });
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    mustChangePassword: false,
    user: { email: "kerry@easternstate.org", role: "admin" },
  });
});

test("recovers from a failed atomic save and persists only after server success", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const selectedUrl = await openChecklistItem(page, ATOMIC_MEASURE, "annual:0");
  let failNextSave = true;
  await page.route("**/api/strategy/observations", async (route) => {
    if (route.request().method() === "POST" && failNextSave) {
      failNextSave = false;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated connection failure" }),
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole("spinbutton", { name: "Value" }).fill("17");
  await page.getByRole("textbox", { name: "Notes" }).fill("Acceptance reporting cycle");
  await page.getByRole("textbox", { name: "Source" }).fill("Acceptance fixture");
  await expect(page.getByRole("status")).toContainText("Unsaved changes");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("status")).toContainText("Simulated connection failure");
  await expect(page.getByRole("spinbutton", { name: "Value" })).toHaveValue("17");
  await expect(page.getByRole("button", { name: new RegExp(ATOMIC_MEASURE) })).toContainText("Not started");

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");
  await page.unroute("**/api/strategy/observations");

  await page.goto(selectedUrl);
  await expect(page.getByRole("spinbutton", { name: "Value" })).toHaveValue("17");
  await expect(page.getByRole("textbox", { name: "Source" })).toHaveValue("Acceptance fixture");
  await expect(page.getByRole("button", { name: new RegExp(ATOMIC_MEASURE) })).toContainText("Complete");

  const savedUrl = new URL(selectedUrl, page.url());
  savedUrl.searchParams.set("saved", "1");
  await page.goto(`${savedUrl.pathname}${savedUrl.search}`);
  await expect(page.getByRole("status")).toContainText("Saved.");
  await page.getByRole("spinbutton", { name: "Value" }).fill("18");
  await expect(page.getByRole("status")).toContainText("Unsaved changes");
  await expect(page.getByRole("status")).not.toContainText("Saved.");
  await page.getByRole("spinbutton", { name: "Value" }).fill("17");
  expect(browserErrors.filter((message) => !message.includes("status of 500"))).toEqual([]);
});

test("warns before primary navigation discards an unsaved form", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/reports?year=2029&period=annual%3A0");
  await openChecklistItem(page, ATOMIC_MEASURE, "annual:0");
  await page.getByRole("spinbutton", { name: "Value" }).fill("18");
  await expect(page.getByRole("status")).toContainText("Unsaved changes");

  await page.evaluate(() => window.history.back());
  const historyDialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(historyDialog).toBeVisible();
  await historyDialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(/\/data-entry/);
  await expect(page.getByRole("spinbutton", { name: "Value" })).toHaveValue("18");

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Reports" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(/\/data-entry/);
  await expect(page.getByRole("spinbutton", { name: "Value" })).toHaveValue("18");

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Reports" }).click();
  await page.getByRole("alertdialog", { name: "Leave without saving?" }).getByRole("button", { name: "Leave page" }).click();
  await expect(page).toHaveURL(/\/reports/);
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("requires and persists every field in one multi-component form", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const selectedUrl = await openChecklistItem(page, COMPONENT_MEASURE, "cumulative:0");
  await expect(page.getByRole("heading", { name: "Engagement sessions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Survey and focus-group participants" })).toBeVisible();
  const values = page.getByRole("spinbutton", { name: "Value" });
  await expect(values).toHaveCount(2);

  await values.nth(0).fill("3");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("status")).toContainText("required");
  await expect(page.getByRole("button", { name: new RegExp(COMPONENT_MEASURE) })).toContainText("Not started");

  await values.nth(1).fill("400");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");
  await page.goto(selectedUrl);
  await expect(page.getByRole("spinbutton", { name: "Value" }).nth(0)).toHaveValue("3");
  await expect(page.getByRole("spinbutton", { name: "Value" }).nth(1)).toHaveValue("400");
  await expect(page.getByRole("button", { name: new RegExp(COMPONENT_MEASURE) })).toContainText("Complete");
  expect(browserErrors).toEqual([]);
});

test("saves a distribution with understandable groups and a durable total", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const selectedUrl = await openChecklistItem(page, DISTRIBUTION_MEASURE, "annual:0");
  await expect(page.getByLabel("Each response belongs to one group")).toBeChecked();
  await page.getByRole("spinbutton", { name: "Total responses" }).fill("10");
  await page.getByRole("spinbutton", { name: "Community partners" }).fill("6");
  await page.getByRole("spinbutton", { name: "Other participants" }).fill("4");
  await page.getByRole("textbox", { name: "Source" }).fill("Distribution fixture");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");

  await page.goto(selectedUrl);
  await expect(page.getByRole("spinbutton", { name: "Total responses" })).toHaveValue("10");
  await expect(page.getByRole("spinbutton", { name: "Community partners" })).toHaveValue("6");
  await expect(page.getByRole("spinbutton", { name: "Other participants" })).toHaveValue("4");
  await expect(page.getByRole("button", { name: new RegExp(DISTRIBUTION_MEASURE) })).toContainText("Complete");
  expect(browserErrors).toEqual([]);
});

test("shows four admin destinations and removes every superseded route", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/dashboard/overview");
  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByRole("link")).toHaveCount(4);
  for (const name of ["Overview", "Reports", "Data Entry", "Setup"]) {
    await expect(navigation.getByRole("link", { name })).toBeVisible();
  }

  for (const oldPath of [
    "/admin",
    "/admin/data",
    "/admin/strategy-data",
    "/admin/goals",
    "/admin/kpis",
    "/admin/strategic-goals",
    "/admin/configuration-gaps",
    "/admin/history",
    "/admin/users",
    "/dashboard/trends",
  ]) {
    const response = await page.request.get(oldPath);
    expect(response.status(), oldPath).toBe(404);
  }
  expect(browserErrors).toEqual([]);
});

test("keeps Overview concise and reads saved strategic results", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const response = await page.goto(`/dashboard/overview?year=${ENTRY_YEAR}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organization progress" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Strategic Priorities" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(page.locator("#strategic-board-export-root, #board-report-root")).toHaveCount(0);
  await expect(page.getByText("Board Report", { exact: true })).toHaveCount(0);
  expect(await page.locator("*").count()).toBeLessThan(1_000);
  expect((await response!.body()).byteLength).toBeLessThan(250_000);

  await page.getByRole("link", { name: /Reimagine Visitor Experience/ }).click();
  const atomicRow = page.getByRole("link", { name: new RegExp(ATOMIC_MEASURE) });
  await expect(atomicRow).toContainText("17 programs");
  expect(browserErrors).toEqual([]);
});

test("uses one flat Setup workspace on desktop and mobile", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/setup?area=measures&year=2029");
  const areas = page.getByRole("navigation", { name: "Setup areas" });
  await expect(areas.getByRole("link")).toHaveCount(4);
  for (const name of ["Measures", "Goals", "People", "Activity"]) {
    await expect(areas.getByRole("link", { name })).toBeVisible();
  }
  await expect(page.getByRole("tab")).toHaveCount(0);

  await page.route("**/api/kpis", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Simulated create failure" }),
    });
  });
  await page.getByRole("button", { name: "Add measure" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Temporary acceptance measure");
  await page.getByRole("textbox", { name: "Unit label" }).fill("items");
  const createMeasure = page.getByRole("button", { name: "Create measure" });
  await createMeasure.click();
  await expect(createMeasure).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Simulated create failure");
  await page.unroute("**/api/kpis");
  await page.getByRole("button", { name: "Cancel" }).click();

  const needsAttention = page.getByRole("link", { name: /Needs attention \(\d+\)/ });
  const attentionCount = Number((await needsAttention.textContent())?.match(/\d+/)?.[0]);
  expect(attentionCount).toBeGreaterThan(0);
  await needsAttention.click();
  await expect(page).toHaveURL(/filter=needs-attention/);
  const measureList = page.getByRole("complementary", { name: "Measure list" });
  await expect(measureList.locator("ul a")).toHaveCount(attentionCount);
  await measureList.locator("ul a").first().click();
  await expect(page).toHaveURL(/\/setup\?area=measures&item=\d+&year=2029/);
  await expect(page.getByRole("heading", { name: "Measure details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Targets", exact: true })).toHaveCount(0);

  await page.goto("/setup?area=goals&year=2029");
  const goalList = page.getByRole("complementary", { name: "Goal list" });
  await goalList.locator("ul a").first().click();
  await expect(page).toHaveURL(/area=goals&year=2029&goal=\d+/);
  await expect(page.getByRole("heading", { name: "When this goal is complete" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/area=goals&year=2029$/);
  await expect(page.getByText("Choose a goal", { exact: true })).toBeVisible();
  await goalList.locator("ul a").first().click();
  await page.locator("#strategic-goal-reporting-year").selectOption("2028");
  await expect(page).toHaveURL(/area=goals&year=2028&goal=\d+/);
  await expect(page.getByRole("spinbutton", { name: "Reporting year" }).first()).toHaveValue("2028");
  await expect(page.getByRole("heading", { name: "Targets", exact: true })).toBeVisible();
  await expect(page.getByText("Full plan target", { exact: true }).first()).toBeVisible();

  await areas.getByRole("link", { name: "People" }).click();
  await expect(page.getByRole("complementary", { name: "People list" })).toBeVisible();
  await page.route("**/api/users", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Simulated invite failure" }),
    });
  });
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Temporary User");
  await page.getByRole("textbox", { name: "Email" }).fill("temporary@example.org");
  await page.getByLabel("Password").fill("Temporary-123!");
  const createUser = page.getByRole("button", { name: "Create user" });
  await createUser.click();
  await expect(createUser).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Simulated invite failure");
  await page.unroute("**/api/users");
  await page.getByRole("button", { name: "Kerry Sautner" }).click();
  await expect(page.getByRole("region", { name: "Person details" })).toContainText("kerry@easternstate.org");

  await areas.getByRole("link", { name: "Activity" }).click();
  await expect(page.getByRole("heading", { name: "Data changes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Setup changes" })).toBeVisible();
  const recentActivity = page.getByRole("region", { name: "Setup changes" });
  await expect(recentActivity.getByText(ATOMIC_MEASURE).first()).toBeVisible();
  await expect(recentActivity.getByText("kerry@easternstate.org").first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/setup?area=measures&year=2029");
  await page.getByRole("complementary", { name: "Measure list" }).locator("ul a").first().click();
  await expect(page).toHaveURL(/\/setup\?area=measures&item=\d+&year=2029/);
  const selectedMeasureId = new URL(page.url()).searchParams.get("item");
  expect(selectedMeasureId).toMatch(/^\d+$/);
  await expect(page.getByRole("link", { name: "Back to list" })).toBeVisible();
  await page.getByRole("link", { name: "Back to list" }).click();
  await expect(page.getByRole("complementary", { name: "Measure list" })).toBeVisible();
  await expect(page.locator(`#measure-list-item-${selectedMeasureId}`)).toBeFocused();

  await page.goto(`/data-entry?year=${ENTRY_YEAR}&period=annual%3A0`);
  const checklistItem = page.getByRole("button", { name: new RegExp(ATOMIC_MEASURE) });
  await checklistItem.click();
  await page.getByRole("button", { name: "Back to list" }).click();
  await expect(page.getByRole("heading", { name: "Reporting checklist" })).toBeVisible();
  await expect(checklistItem).toBeFocused();
  expect(browserErrors.filter((message) => !message.includes("status of 500"))).toEqual([]);
});

test("keeps visible Board Report, Trends, and exports on one reporting truth", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto(`/reports?view=board&year=${ENTRY_YEAR}&period=annual%3A0`);
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByLabel("Reporting period")).toHaveValue("annual:0");
  const report = page.locator("#board-report-root");
  await expect(report).toBeVisible();
  await expect(report).toContainText("Full year");
  await expect(report.getByRole("heading", { name: ATOMIC_MEASURE })).toBeVisible();
  await expect(report.getByText("17 programs", { exact: true }).first()).toBeVisible();
  await expect(report.getByRole("heading", { name: COMPONENT_MEASURE })).toBeVisible();
  await expect(report.getByText("Engagement sessions", { exact: true }).first()).toBeVisible();
  await expect(report.getByText("3 sessions", { exact: true }).first()).toBeVisible();
  await expect(report.getByRole("heading", { name: DISTRIBUTION_MEASURE })).toBeVisible();
  await expect(report.getByText("Community partners", { exact: true }).first()).toBeVisible();
  await expect(report.getByText("60%", { exact: true }).first()).toBeVisible();

  let download = page.waitForEvent("download", { timeout: EXPORT_TIMEOUT });
  await page.getByRole("button", { name: /Download .*\.csv$/ }).click();
  const csv = (await downloadedBytes(await download, "csv")).toString("utf8");
  expect(csv).toContain("Reporting Period");
  expect(csv).toContain("Full year");
  expect(csv).toContain(ATOMIC_MEASURE);
  expect(csv).toContain("17");

  download = page.waitForEvent("download", { timeout: EXPORT_TIMEOUT });
  await page.getByRole("button", { name: "Export current view as PNG image" }).click();
  await downloadedBytes(await download, "png");

  download = page.waitForEvent("download", { timeout: EXPORT_TIMEOUT });
  await page.getByRole("button", { name: "Export current report as PDF" }).click();
  await downloadedBytes(await download, "pdf");

  await page.getByLabel("Report", { exact: true }).selectOption("trends");
  await expect(page).toHaveURL(/view=trends/);
  await expect(page.locator("#board-report-root")).toHaveCount(0);
  await page.getByLabel("Measure", { exact: true }).selectOption({ label: ATOMIC_MEASURE });
  await expect(page.getByRole("table")).toContainText("17");
  await expect(page.getByText(/Full year · programs/)).toBeVisible();

  expect(browserErrors).toEqual([]);
});
