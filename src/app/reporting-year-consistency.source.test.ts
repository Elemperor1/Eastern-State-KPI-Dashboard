import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REPORTING_PAGES = [
  "./dashboard/overview/page.tsx",
  "./dashboard/category/[slug]/page.tsx",
  "./dashboard/metric/[slug]/page.tsx",
  "./reports/page.tsx",
] as const;

describe("reporting-page default year consistency", () => {
  it.each(REPORTING_PAGES)(
    "%s uses the shared current-plan-year resolver",
    (relativePath) => {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");

      expect(source).toContain("resolveStrategicReportingYear(");
      expect(source).not.toContain("Math.max(...years)");
    },
  );
});
