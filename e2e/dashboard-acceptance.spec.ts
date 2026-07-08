import { expect, test, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const GOAL_KPI = "Indirect jobs held at ES via vendors";
const GOAL_YEAR = "2026";

test.describe.configure({ mode: "serial" });

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function expectPngDownload(download: Download): Promise<void> {
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const bytes = await readFile(filePath!);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(500);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(500);
}

async function expectPdfDownload(download: Download): Promise<void> {
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const bytes = await readFile(filePath!);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(bytes.byteLength).toBeGreaterThan(10_000);
}

async function deleteGoalIfPresent(page: Page): Promise<void> {
  const search = page.getByRole("searchbox", { name: "Search goals" });
  await search.fill(GOAL_KPI);
  const row = page
    .getByRole("row")
    .filter({ hasText: GOAL_KPI })
    .filter({ hasText: GOAL_YEAR });

  if (await row.count()) {
    await row.getByRole("button", { name: `Delete goal for ${GOAL_KPI}` }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Delete goal", exact: true }).click();
    await expect(row).toHaveCount(0);
  }
  await search.fill("");
}

test("creates, edits, exports, and deletes a KPI goal", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/admin/goals");
  await expect(page).toHaveTitle("Eastern State KPI Intelligence");
  await expect(page.getByRole("heading", { name: "Set KPI targets" })).toBeVisible();
  await deleteGoalIfPresent(page);

  const form = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Add a new goal" }),
  });
  await form.getByLabel("KPI").selectOption({ label: `${GOAL_KPI} (Economic Impact)` });
  await form.getByLabel("Target year").selectOption(GOAL_YEAR);
  await form.getByLabel("Percentage change").fill("17");
  await form.getByLabel("Notes (optional)").fill("Playwright acceptance goal");
  await form.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByRole("status")).toContainText("Goal created.");

  const row = page
    .getByRole("row")
    .filter({ hasText: GOAL_KPI })
    .filter({ hasText: GOAL_YEAR });
  await expect(row).toContainText("+17%");
  await row.getByRole("button", { name: `Edit goal for ${GOAL_KPI}` }).click();

  const dialog = page.getByRole("dialog", { name: `Edit goal — ${GOAL_KPI}` });
  await dialog.getByLabel("Percentage change").fill("23");
  await dialog.getByLabel("Notes (optional)").fill("Playwright acceptance goal updated");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Goal updated.");
  await expect(row).toContainText("+23%");

  await page.goto(
    "/dashboard/metric/indirect-jobs-vendors?currentYear=2026&compareYear=2025&currentMonth=7",
  );
  await expect(page.getByRole("heading", { name: GOAL_KPI })).toBeVisible();
  const goalPanel = page.locator("section").filter({
    has: page.getByRole("group", { name: "Display mode" }),
  });
  await expect(goalPanel).toContainText("Goal: +23%");
  const pngPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current view as PNG image" }).click();
  await expectPngDownload(await pngPromise);

  await page.goto("/admin/goals");
  await deleteGoalIfPresent(page);
  await expect(page.getByRole("status")).toContainText(`Goal deleted for “${GOAL_KPI}”.`);
  expect(browserErrors).toEqual([]);
});

test("shows a monthly save error, retries, and clears the saved value", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/admin/data");
  await expect(
    page.getByRole("heading", { name: "Enter monthly, annual, and breakdown values" }),
  ).toBeVisible();
  await page.getByLabel("Metric").selectOption("video-views");
  await page.getByLabel("Year").selectOption("2026");

  const clearDecember = page.getByRole("button", { name: "Clear Dec" });
  if (await clearDecember.isEnabled()) {
    await clearDecember.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Clear value" })
      .click();
    await expect(page.getByRole("status")).toContainText("Cleared December 2026.");
  }

  await page.route("**/api/entries", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "simulated failure" }),
      });
      return;
    }
    await route.continue();
  });

  await page.getByLabel("Dec value").fill("4321");
  await page.getByLabel("Dec notes").fill("Playwright retry proof");
  await page.getByRole("button", { name: "Save Dec" }).click();
  await expect(page.getByRole("status")).toContainText("Could not save: simulated failure");

  await page.unroute("**/api/entries");
  await page.getByRole("button", { name: "Save Dec" }).click();
  await expect(page.getByRole("status")).toContainText("Saved December 2026.");

  await page.getByRole("button", { name: "Clear Dec" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Clear value" })
    .click();
  await expect(page.getByRole("status")).toContainText("Cleared December 2026.");
  await expect(page.getByLabel("Dec value")).toHaveValue("");
  expect(
    browserErrors.filter(
      (message) =>
        !message.includes(
          "Failed to load resource: the server responded with a status of 500",
        ),
    ),
  ).toEqual([]);
});

test("navigates through desktop and mobile application shells", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/dashboard/overview");
  await page.getByRole("link", { name: "Trends" }).click();
  await expect(page).toHaveURL(/\/dashboard\/trends$/);
  await expect(
    page.getByRole("heading", { name: "Multi-KPI · Multi-Year Trends" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/overview");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.getByRole("link", { name: "Data entry" }).click();
  await expect(page).toHaveURL(/\/admin\/data$/);
  await expect(
    page.getByRole("heading", { name: "Enter monthly, annual, and breakdown values" }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("downloads representative PNG/PDF exports and renders native print PDF", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/dashboard/category/fundraising");
  await expect(page.getByRole("heading", { name: "Fundraising" })).toBeVisible();
  await expect(page.getByText("Donor conversion", { exact: true })).toBeVisible();
  let downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current view as PNG image" }).click();
  await expectPngDownload(await downloadPromise);

  await page.goto(
    "/dashboard/category/education?currentYear=2099&compareYear=2098&currentMonth=12",
  );
  await expect(page.getByText("No data", { exact: true })).toHaveCount(10);
  downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current view as PNG image" }).click();
  await expectPngDownload(await downloadPromise);

  await page.goto("/dashboard/category/education?legacy=1");
  downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current dashboard view as PDF" }).click();
  await expectPdfDownload(await downloadPromise);

  await page.goto("/dashboard/metric/video-views?legacy=1");
  downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current dashboard view as PDF" }).click();
  await expectPdfDownload(await downloadPromise);

  await page.goto("/dashboard/overview");
  await page.emulateMedia({ media: "print" });
  const nativePdf = await page.pdf({
    format: "Letter",
    landscape: true,
    printBackground: true,
  });
  expect(nativePdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(nativePdf.byteLength).toBeGreaterThan(10_000);
  expect(browserErrors).toEqual([]);
});
