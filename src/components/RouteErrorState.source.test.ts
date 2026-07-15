import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(new URL("./RouteErrorState.tsx", import.meta.url), "utf8");

describe("route error recovery contract", () => {
  it("focuses a friendly heading and preserves safe navigation plus retry", () => {
    expect(component).toContain("headingRef.current?.focus()");
    expect(component).toContain("tabIndex={-1}");
    expect(component).toContain("isLoading={isRetrying}");
    expect(component).toContain("reset();");
    expect(component).toContain("router.refresh();");
    expect(component).toContain("ROUTE_RECOVERY_FOCUS_KEY");
    expect(component).toContain('href="/dashboard/overview"');
    expect(component).toContain('href="/reports"');
    expect(component).toContain("Eastern State Strategic Plan");
    expect(component).not.toContain("Eastern State KPI");
    expect(component).not.toContain("error.message");
  });

  it("is installed at every canonical destination boundary", () => {
    for (const route of [
      "../app/dashboard/overview/error.tsx",
      "../app/data-entry/error.tsx",
      "../app/reports/error.tsx",
      "../app/setup/error.tsx",
    ]) {
      const source = readFileSync(new URL(route, import.meta.url), "utf8");
      expect(source).toContain("<RouteErrorState");
    }
  });
});
