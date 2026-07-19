import { expect, test, type Download, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { e2eDatabaseRunFromMetadata } from "../scripts/e2e-database";

const ATOMIC_MEASURE = "Diverse Audiences — Programs co-created with community organizations";
const COMPONENT_MEASURE = "Interpretive Site Plan — Visitor & community feedback participation";
const DISTRIBUTION_MEASURE = "Partnerships & Recognition — Diverse demographic representation in audience";
const ENTRY_YEAR = 2029;
const EXPORT_TIMEOUT = 60_000;

test.describe.configure({ mode: "serial" });

/** Supports the collect browser errors test scenario. */
function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Supports the downloaded bytes test scenario. */
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

/** Supports the open checklist item test scenario. */
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

/** Supports the set measure lifecycle test scenario. */
async function setMeasureLifecycle(
  page: Page,
  id: number,
  action: "archive" | "restore",
) {
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "eastern_state_kpi_csrf",
  )?.value;
  expect(token).toBeTruthy();
  const response = await page.request.patch("/api/kpis", {
    headers: {
      "content-type": "application/json",
      origin: new URL(page.url()).origin,
      "x-csrf-token": token!,
    },
    data: { id, action },
  });
  expect(response.ok(), await response.text()).toBe(true);
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

test("rotates an initial password without losing auth-page semantics or recovery", async ({ page }, testInfo) => {
  const browserErrors = collectBrowserErrors(page);
  const run = e2eDatabaseRunFromMetadata(testInfo.config.metadata);
  const email = "password-rotation-acceptance@example.org";
  const temporaryPassword = "Temporary-Rotation-2029!";
  const permanentPassword = "Permanent-Rotation-2029!";
  const db = new DatabaseSync(run.databasePath);
  db.exec("PRAGMA busy_timeout = 5000");
  db.prepare("DELETE FROM users WHERE email = ?").run(email);
  db.prepare(`
    INSERT INTO users (
      email, name, password_hash, role, must_change_password,
      disabled, sessions_valid_after
    ) VALUES (?, ?, ?, 'viewer', 1, 0, ?)
  `).run(
    email,
    "Password Rotation Acceptance",
    bcrypt.hashSync(temporaryPassword, 4),
    Date.now(),
  );
  db.close();

  try {
    await page.context().clearCookies();
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByLabel("Password").fill(temporaryPassword);
    await page.route("**/api/auth/me", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/setup-password$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Checking account access" }),
    ).toBeAttached();
    await expect(
      page.getByRole("heading", { level: 1, name: "Set a new password" }),
    ).toBeVisible();
    await page.unroute("**/api/auth/me");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    await page.getByLabel("Current temporary password").fill(temporaryPassword);
    await page.getByLabel("New password", { exact: true }).fill(permanentPassword);
    await page.getByLabel("Confirm new password").fill("Does-Not-Match-2029!");
    await page.getByRole("button", { name: "Update password & continue" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "do not match" }),
    ).toContainText("do not match");
    await expect(page.getByLabel("Current temporary password")).toHaveValue(
      temporaryPassword,
    );

    await page.getByLabel("Confirm new password").fill(permanentPassword);
    await page.getByRole("button", { name: "Update password & continue" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();

    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByLabel("Password").fill(permanentPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard\/overview$/);
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await page.goto(
      "/dashboard/metric/interpretive-plan-milestones-on-schedule?year=2029",
    );
    await expect(page.getByText("No results have been reported for this period.")).toBeVisible();
    await expect(page.getByText("Use Data Entry to add the first result.")).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  } finally {
    const cleanup = new DatabaseSync(run.databasePath);
    cleanup.exec("PRAGMA busy_timeout = 5000");
    cleanup.prepare("DELETE FROM users WHERE email = ?").run(email);
    cleanup.close();
  }
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
  await page.context().setOffline(true);
  await expect(
    page.getByRole("alert").filter({ hasText: "You're offline" }),
  ).toContainText("offline");
  await expect(page.getByRole("button", { name: "Save unavailable offline" })).toBeDisabled();
  await expect(page.getByRole("spinbutton", { name: "Value" })).toHaveValue("17");
  await page.context().setOffline(false);
  await expect(page.getByRole("status")).toContainText("Unsaved changes");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Simulated connection failure" }),
  ).toContainText("Simulated connection failure");
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

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenuButton = page.getByRole("button", { name: "Open navigation" });
  await mobileMenuButton.click();
  const mobileDrawer = page.locator(".mobile-drawer-panel");
  await mobileDrawer.getByRole("link", { name: "Reports" }).click();
  const stackedDialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(stackedDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(stackedDialog).toHaveCount(0);
  await expect(mobileMenuButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Escape");
  await expect(mobileMenuButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(page.getByRole("spinbutton", { name: "Value" })).toHaveValue("18");
  await page.setViewportSize({ width: 1440, height: 1_080 });

  await page.evaluate(() => window.history.back());
  const historyDialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(historyDialog).toBeVisible();
  await expect(historyDialog.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await expect(page.locator("[data-app-shell-content]")).toHaveAttribute("inert", "");
  await historyDialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(/\/data-entry/);
  await expect(page.getByRole("spinbutton", { name: "Value" })).toHaveValue("18");

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Reports" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(/\/data-entry/);
  await expect(page.getByRole("spinbutton", { name: "Value" })).toHaveValue("18");

  await page.setViewportSize({ width: 390, height: 844 });
  await mobileMenuButton.click();
  await mobileDrawer.getByRole("link", { name: "Reports" }).click();
  await page
    .getByRole("alertdialog", { name: "Leave without saving?" })
    .getByRole("button", { name: "Leave page" })
    .click();
  await expect(page).toHaveURL(/\/reports/);
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.locator('button[aria-label="Open navigation"]')).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.locator("#main-content")).not.toHaveAttribute("inert", "");
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
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
  await expect(
    page.getByRole("alert").filter({ hasText: "required" }),
  ).toContainText("required");
  const invalidValue = values.nth(1);
  const describedBy = await invalidValue.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toContainText("required");
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

test("reflows every destination and detail route across the required viewport and zoom-equivalent matrix", async ({ page }) => {
  test.setTimeout(240_000);
  const browserErrors = collectBrowserErrors(page);
  const routes = [
    "/dashboard/overview?year=2029",
    "/data-entry?year=2029&period=annual%3A0",
    "/reports?view=trends&year=2029&period=annual%3A0",
    "/setup?area=measures&year=2029",
    "/dashboard/category/visitor-experience?year=2029",
    "/dashboard/metric/interpretive-plan-milestones-on-schedule?year=2029",
  ];
  const viewports = [
    { width: 320, label: "320px / 400% reflow equivalent" },
    { width: 360, label: "360px" },
    { width: 390, label: "390px" },
    { width: 480, label: "300% reflow equivalent" },
    { width: 720, label: "200% reflow equivalent" },
    { width: 768, label: "768px" },
    { width: 1024, label: "1024px" },
    { width: 1440, label: "1440px" },
    { width: 1920, label: "1920px" },
  ];

  for (const { width, label } of viewports) {
    await page.setViewportSize({ width, height: width < 1_000 ? 844 : 1_080 });
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} should load at ${label}`).toBe(200);
      const heading = page.locator("h1:visible").first();
      await expect(heading, `${route} should expose a visible h1 at ${label}`).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${route} should not overflow horizontally at ${label}`,
      ).toBe(true);

      const undersizedControls = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("button, input:not([type='hidden']), select, textarea"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.height < 40;
          })
          .map((element) => ({
            tag: element.tagName,
            label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 60) ?? "",
            height: element.getBoundingClientRect().height,
          })),
      );
      expect(undersizedControls, `${route} has undersized controls at ${label}`).toEqual([]);
    }
  }

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/dashboard/category/visitor-experience?year=2029");
  const longMeasure = page.locator("a[href*='interpretive-plan-milestones-on-schedule']");
  const measureName = longMeasure.locator(":scope > span").nth(0);
  const measureEvidence = longMeasure.locator(":scope > span").nth(1);
  await expect.poll(
    async () => {
      const [nameBox, evidenceBox] = await Promise.all([
        measureName.boundingBox(),
        measureEvidence.boundingBox(),
      ]);
      if (!nameBox || !evidenceBox) return null;
      return {
        evidenceBelowName: evidenceBox.y > nameBox.y,
        nameFits: await measureName.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      };
    },
    { message: "The long Measure row should finish painting without clipping" },
  ).toEqual({ evidenceBelowName: true, nameFits: true });

  expect(browserErrors).toEqual([]);
});

test("keeps Overview concise and reads saved strategic results", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/dashboard/overview");
  const expectedDefaultYear = Math.max(
    2025,
    Math.min(new Date().getFullYear(), 2029),
  );
  await expect(page.getByLabel("Reporting year")).toHaveValue(
    String(expectedDefaultYear),
  );
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
  await atomicRow.click();
  const targetLink = page.getByRole("link", { name: "Review target" });
  await expect(targetLink).toBeVisible();
  const targetHref = await targetLink.getAttribute("href");
  const targetId = targetHref?.split("#")[1];
  expect(targetId).toMatch(/^goal-target-measure-\d+$/);
  await targetLink.click();
  const targetHeading = page.locator(`#${targetId}`);
  await expect(targetHeading).toBeVisible();
  await expect(targetHeading).toBeFocused();
  expect(browserErrors).toEqual([]);
});

test("uses one flat Setup workspace on desktop and mobile", async ({ page }, testInfo) => {
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
  await expect(
    page.getByRole("alert").filter({ hasText: "Simulated create failure" }),
  ).toContainText("Simulated create failure");
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(
    "Temporary acceptance measure",
  );
  await page.unroute("**/api/kpis");
  await createMeasure.click();
  await expect(page).toHaveURL(/\/setup\?area=measures&item=\d+&year=2029/);
  await expect(
    page.getByRole("heading", { name: "Temporary acceptance measure" }),
  ).toBeVisible();
  const createdMeasureId = Number(new URL(page.url()).searchParams.get("item"));
  expect(createdMeasureId).toBeGreaterThan(0);

  await setMeasureLifecycle(page, createdMeasureId, "archive");
  await page.goto("/setup?area=measures&year=2029");
  const archivedMeasure = page
    .getByRole("complementary", { name: "Measure list" })
    .getByRole("link", { name: /Temporary acceptance measure/ });
  await expect(archivedMeasure).toBeVisible();
  await archivedMeasure.click();
  await expect(
    page.getByRole("heading", { name: "Temporary acceptance measure" }),
  ).toBeVisible();
  await setMeasureLifecycle(page, createdMeasureId, "restore");
  await page.goto("/setup?area=measures&year=2029");

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
  const incompleteTargetLink = page.getByRole("link", { name: "Review target" });
  const incompleteTargetHref = await incompleteTargetLink.getAttribute("href");
  const incompleteTargetId = incompleteTargetHref?.split("#")[1];
  expect(incompleteTargetId).toMatch(/^goal-target-measure-\d+$/);
  const incompleteMeasureId = Number(incompleteTargetId?.split("-").at(-1));
  const run = e2eDatabaseRunFromMetadata(testInfo.config.metadata);
  const db = new DatabaseSync(run.databasePath);
  db.exec("PRAGMA busy_timeout = 5000");
  db.prepare("DELETE FROM kpi_measurement_configs WHERE kpi_id = ?").run(
    incompleteMeasureId,
  );
  db.close();
  await incompleteTargetLink.click();
  const incompleteTarget = page.locator(`#${incompleteTargetId}`);
  await expect(incompleteTarget).toBeVisible();
  await expect(incompleteTarget).toBeFocused();
  await expect(incompleteTarget).toContainText(
    "Finish setting up this measure before adding targets.",
  );

  await page.goto("/setup?area=goals&year=2029");
  const goalList = page.getByRole("complementary", { name: "Goal list" });
  await goalList.locator("ul a").first().click();
  await expect(page).toHaveURL(/area=goals&year=2029&goal=\d+/);
  await expect(page.getByRole("heading", { name: "When this goal is complete" })).toBeVisible();
  const selectedGoalHeading = page.locator("#strategic-goal-settings-title");
  const firstGoalName = await selectedGoalHeading.textContent();
  const secondGoalLink = goalList.locator("ul a").nth(1);
  const secondGoalHref = await secondGoalLink.getAttribute("href");
  const secondGoalId = new URL(secondGoalHref!, page.url()).searchParams.get("goal");
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname === "/setup" &&
      url.searchParams.get("area") === "goals" &&
      url.searchParams.get("goal") === secondGoalId
    ) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    await route.continue();
  });
  await secondGoalLink.click({ noWaitAfter: true });
  await expect(selectedGoalHeading).toHaveText(firstGoalName!, { timeout: 300 });
  await expect(page).toHaveURL(new RegExp(`goal=${secondGoalId}`));
  await expect(selectedGoalHeading).not.toHaveText(firstGoalName!);
  await page.unroute("**/*");
  await page.goBack();
  await expect(page).toHaveURL(/area=goals&year=2029&goal=\d+/);
  await page.goBack();
  await expect(page).toHaveURL(/area=goals&year=2029$/);
  await expect(page.getByText("Choose a goal", { exact: true })).toBeVisible();
  await page
    .getByRole("complementary", { name: "Goal list" })
    .locator("ul a")
    .first()
    .click();
  await expect(page).toHaveURL(/area=goals&year=2029&goal=\d+/);
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
  await expect(
    page.getByRole("alert").filter({ hasText: "Simulated invite failure" }),
  ).toContainText("Simulated invite failure");
  await page.unroute("**/api/users");
  await createUser.click();
  await expect(page.getByRole("heading", { name: "Temporary User" })).toBeVisible();

  let releaseAccountUpdate!: () => void;
  const accountUpdateGate = new Promise<void>((resolve) => {
    releaseAccountUpdate = resolve;
  });
  await page.route("**/api/users/account", async (route) => {
    await accountUpdateGate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Disable account" }).click();
  const disableDialog = page.getByRole("alertdialog", { name: "Disable Temporary User?" });
  const confirmDisable = disableDialog.getByRole("button", { name: "Disable account" });
  await confirmDisable.click();
  await expect(disableDialog).toBeVisible();
  await expect(confirmDisable).toBeDisabled();
  releaseAccountUpdate();
  await expect(disableDialog).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Person details" }),
  ).toContainText("Disabled");
  await page.unroute("**/api/users/account");

  let releaseDelete!: () => void;
  const deleteGate = new Promise<void>((resolve) => {
    releaseDelete = resolve;
  });
  await page.route("**/api/users", async (route) => {
    if (route.request().method() === "DELETE") await deleteGate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Delete person" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete Temporary User?" });
  const confirmDelete = deleteDialog.getByRole("button", { name: "Delete user" });
  await confirmDelete.click();
  await expect(deleteDialog).toBeVisible();
  await expect(confirmDelete).toBeDisabled();
  releaseDelete();
  await expect(deleteDialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Temporary User" })).toHaveCount(0);
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
  await page.goto("/dashboard/overview");
  const mobileMenuButton = page.getByRole("button", { name: "Open navigation" });
  await mobileMenuButton.click();
  const drawer = page.getByRole("complementary");
  await expect(drawer.getByRole("button", { name: "Close navigation" })).toBeFocused();
  await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(mobileMenuButton).toBeFocused();

  await mobileMenuButton.click();
  await drawer.getByRole("button", { name: "Close navigation" }).click();
  await mobileMenuButton.click();
  await expect(drawer.getByRole("button", { name: "Close navigation" })).toBeFocused();
  await page.keyboard.press("Escape");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await mobileMenuButton.click();
  await expect(drawer).toHaveCSS("transform", "none");
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await mobileMenuButton.click();
  await page.setViewportSize({ width: 1024, height: 1_080 });
  await expect(page.locator('button[aria-label="Open navigation"]')).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.locator("#main-content")).not.toHaveAttribute("inert", "");
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
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

  for (const width of [360, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 1_000 ? 844 : 1_080 });
    await page.goto("/dashboard/overview");
    await expect(page.locator("#main-content")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Overview should not overflow horizontally at ${width}px`,
    ).toBe(true);
    if (width < 1_024) {
      await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    } else {
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    }
  }
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

  for (const width of [320, 1920]) {
    await page.setViewportSize({ width, height: width === 320 ? 844 : 1_080 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Board Report should not overflow horizontally at ${width}px`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1_080 });

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-report-header")).toBeVisible();
  await expect(page.locator(".print-report-footer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open browser print dialog" })).toBeHidden();
  await expect(page.locator(".board-report-measure").first()).toHaveCSS(
    "content-visibility",
    "visible",
  );
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator(".print-report-header")).toBeHidden();

  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printRequested = "true";
    };
  });
  await page.getByRole("button", { name: "Open browser print dialog" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-requested", "true");
  const printStatus = page.getByRole("status").filter({ hasText: "Print dialog closed" });
  await expect(printStatus.locator("[data-announcement-sequence]"))
    .toHaveAttribute("data-announcement-sequence", "1");
  await page.getByRole("button", { name: "Open browser print dialog" }).click();
  await expect(printStatus.locator("[data-announcement-sequence]"))
    .toHaveAttribute("data-announcement-sequence", "2");

  let download = page.waitForEvent("download", { timeout: EXPORT_TIMEOUT });
  await page.getByRole("button", { name: /Download .*\.csv$/ }).click();
  const csv = (await downloadedBytes(await download, "csv")).toString("utf8");
  expect(csv).toContain("Reporting Period");
  expect(csv).toContain("Full year");
  expect(csv).toContain(ATOMIC_MEASURE);
  expect(csv).toContain("17");
  const csvStatus = page.getByRole("status").filter({ hasText: "CSV export ready" });
  await expect(csvStatus.locator("[data-announcement-sequence]"))
    .toHaveAttribute("data-announcement-sequence", "1");
  download = page.waitForEvent("download", { timeout: EXPORT_TIMEOUT });
  await page.getByRole("button", { name: /Download .*\.csv$/ }).click();
  await downloadedBytes(await download, "csv");
  await expect(csvStatus.locator("[data-announcement-sequence]"))
    .toHaveAttribute("data-announcement-sequence", "2");

  download = page.waitForEvent("download", { timeout: EXPORT_TIMEOUT });
  await page.getByRole("button", { name: "Export current view as PNG image" }).click();
  await downloadedBytes(await download, "png");
  await expect(page.getByRole("status").filter({ hasText: "PNG export ready" })).toBeAttached();

  download = page.waitForEvent("download", { timeout: EXPORT_TIMEOUT });
  await page.getByRole("button", { name: "Export current report as PDF" }).click();
  await downloadedBytes(await download, "pdf");
  await expect(page.getByRole("status").filter({ hasText: "PDF export ready" })).toBeAttached();

  await page.getByLabel("Report", { exact: true }).selectOption("trends");
  await expect(page).toHaveURL(/view=trends/);
  await expect(page.locator("#board-report-root")).toHaveCount(0);
  await page.getByLabel("Measure", { exact: true }).selectOption({ label: ATOMIC_MEASURE });
  await expect(page.getByRole("table")).toContainText("17");
  await expect(page.getByText(/Full year · programs/)).toBeVisible();

  const trendChart = page.locator("svg.recharts-surface");
  await expect(trendChart).toBeVisible();
  await expect(trendChart).not.toHaveAttribute("role");
  await expect(trendChart).not.toHaveAttribute("tabindex");
  await expect(trendChart.locator(".recharts-line-curve")).toHaveAttribute(
    "stroke",
    "var(--chart-primary)",
  );
  await expect(trendChart.locator(".recharts-line-curve")).toHaveAttribute(
    "stroke-width",
    "2.5",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(trendChart).toBeVisible();
  await expect
    .poll(
      () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      { message: "Trends should not overflow horizontally at 390px" },
    )
    .toBe(true);

  await page.setViewportSize({ width: 1440, height: 1_080 });
  await trendChart.locator(".recharts-line-dot").first().hover();
  await expect(page.locator(".recharts-tooltip-wrapper")).toContainText("2029");
  await expect(page.locator(".recharts-tooltip-wrapper")).toContainText("programs : 17");

  expect(browserErrors).toEqual([]);
});

test("recovers a route failure and restores focus to the application", async ({ page }, testInfo) => {
  const run = e2eDatabaseRunFromMetadata(testInfo.config.metadata);
  const db = new DatabaseSync(run.databasePath);
  db.exec("PRAGMA busy_timeout = 5000");
  let renamed = false;
  try {
    db.exec("ALTER TABLE strategic_goals RENAME TO strategic_goals_route_error");
    renamed = true;
    await page.goto("/dashboard/overview");
    const errorHeading = page.getByRole("heading", { name: "Overview couldn’t load" });
    await expect(errorHeading).toBeVisible();
    await expect(errorHeading).toBeFocused();

    db.exec("ALTER TABLE strategic_goals_route_error RENAME TO strategic_goals");
    renamed = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(page.locator("#main-content")).toBeFocused();

    db.exec("ALTER TABLE strategic_goals RENAME TO strategic_goals_route_error");
    renamed = true;
    await page.goto("/data-entry?year=2029&period=annual%3A0");
    const dataEntryErrorHeading = page.getByRole("heading", {
      name: "Data Entry couldn’t load",
    });
    await expect(dataEntryErrorHeading).toBeVisible();
    await expect(dataEntryErrorHeading).toBeFocused();

    db.exec("ALTER TABLE strategic_goals_route_error RENAME TO strategic_goals");
    renamed = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Data Entry", exact: true })).toBeVisible();
    await expect(page.locator("#main-content")).toBeFocused();
  } finally {
    if (renamed) {
      db.exec("ALTER TABLE strategic_goals_route_error RENAME TO strategic_goals");
    }
    db.close();
  }
});
