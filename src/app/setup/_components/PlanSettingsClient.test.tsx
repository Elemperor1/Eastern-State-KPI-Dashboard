import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
import { PlanSettingsClient } from "./PlanSettingsClient";

describe("PlanSettingsClient", () => {
  it("renders the persisted organization identity and plan range as supported Setup fields", () => {
    const html = renderToStaticMarkup(
      createElement(PlanSettingsClient, {
        installation: {
          organization: {
            id: 1,
            slug: "example-museum",
            name: "Example Museum",
            shortName: "Example",
            status: "active",
            updatedAt: "2026-07-18 12:00:00",
          },
          plan: {
            id: 2,
            organizationId: 1,
            slug: "plan-2030-2032",
            name: "Community Plan",
            description: "A persisted plan.",
            startYear: 2030,
            endYear: 2032,
            status: "active",
            revision: 4,
            sourceReference: "Board minutes",
            updatedAt: "2026-07-18 12:00:00",
          },
          years: [2030, 2031, 2032],
        },
      }),
    );

    expect(html).toContain("Plan settings");
    expect(html).toContain('value="Example Museum"');
    expect(html).toContain('value="Community Plan"');
    expect(html).toContain('value="2030"');
    expect(html).toContain('value="2032"');
    expect(html).toContain("Save plan settings");
  });
});
