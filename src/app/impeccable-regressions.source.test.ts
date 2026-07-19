import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Supports the source test scenario. */
function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Impeccable responsive and semantic regressions", () => {
  it("keeps Sample yellow out of login and exposes the sign-in task as the page heading", () => {
    const login = source("./login/page.tsx");

    expect(login).not.toContain("bg-accent-");
    expect(login).toContain("<h1 className=\"text-[30px]");
    expect(login).toContain("Welcome back");
    expect(login).toContain("tracking-[-0.04em]");
    expect(login).not.toContain("tracking-[-0.045em]");
  });

  it("exposes password rotation as the page heading at every breakpoint", () => {
    const setupPassword = source("./setup-password/page.tsx");
    const setupPasswordLoading = source("./setup-password/loading.tsx");

    expect(setupPassword).toContain("<h1 className=\"text-[30px]");
    expect(setupPassword).toContain("Set a new password");
    expect(setupPassword).not.toContain("<h2 className=\"text-[30px]");
    expect(setupPassword).toContain("<AuthPageSkeleton fieldCount={3}");
    expect(setupPassword).not.toContain("if (!ready) return null");
    expect(setupPasswordLoading).toContain("<AuthPageSkeleton fieldCount={3}");
  });

  it("stacks Priority Measure evidence before returning to a horizontal row", () => {
    const priority = source("./dashboard/category/[slug]/page.tsx");

    expect(priority).toContain("flex-col items-stretch gap-2");
    expect(priority).toContain("sm:flex-row sm:items-center sm:gap-4");
    expect(priority).toContain("flex w-full items-center justify-between");
  });

  it("uses Sample yellow only through the explicit Sample badge variant", () => {
    const entry = source("./data-entry/_components/StrategicDataEntryClient.tsx");
    const report = source("../components/StrategicBoardReport.tsx");
    const globals = source("./globals.css");

    expect(entry).not.toContain("border-l-" + "4");
    expect(report).not.toContain("bg-accent-");
    expect(globals).not.toContain("--chart-accent");
    expect(globals).not.toContain("var(--color-accent)");
    expect(globals).toContain("background: var(--color-info-bg)");
  });

  it("keeps focus, placeholders, and print metadata above contrast thresholds", () => {
    const globals = source("./globals.css");
    const focusToken = "#" + "209ba5";
    const mutedToken = "#" + "7a9aa3";
    const printToken = "#" + "557883";

    expect(globals).toContain(`--color-focus: ${focusToken}`);
    expect(globals).toContain("placeholder:text-ink-500");
    expect(globals).not.toContain(`placeholder:text-[${mutedToken}]`);
    expect(globals).toMatch(
      new RegExp(`\\.print-report-footer-notice[\\s\\S]*?color: ${printToken}`),
    );
    expect(globals).toMatch(
      new RegExp(`\\.print-report-footer-timestamp[\\s\\S]*?color: ${printToken}`),
    );
    expect(globals).toMatch(/\.print-report-filter-label[\s\S]*?font-size: 0\.75rem/);
    expect(globals).toMatch(/\.print-report-footer-notice[\s\S]*?font-size: 0\.75rem/);
    expect(globals).toMatch(/\.print-report-footer-timestamp[\s\S]*?font-size: 0\.75rem/);
  });

  it("keeps slow font loading readable and fully reveals deferred report evidence for print", () => {
    const globals = source("./globals.css");

    expect((globals.match(/font-display: swap/g) ?? [])).toHaveLength(5);
    expect(globals).not.toContain("font-display: block");
    expect(globals).toContain("content-visibility: auto");
    expect(globals).toMatch(/@media print[\s\S]*?\.board-report-measure[\s\S]*?content-visibility: visible/);
  });
});
