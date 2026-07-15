import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("uses semantic soft warning and keeps the bright accent explicit", () => {
    const warning = renderToStaticMarkup(<Badge variant="warning">Needs attention</Badge>);
    const accent = renderToStaticMarkup(<Badge variant="accent">Sample data</Badge>);

    expect(warning).toContain("var(--color-warning-bg)");
    expect(warning).not.toContain("bg-accent-300");
    expect(accent).toContain("bg-accent-300");
  });

  it("renders a visible subject label for qualified statuses", () => {
    const html = renderToStaticMarkup(
      <Badge variant="incomplete" label="Target status">Not finalized</Badge>,
    );

    expect(html).toContain("Target status:");
    expect(html).toContain("Not finalized");
    expect(html).toContain("bg-ink-100");
  });
});
