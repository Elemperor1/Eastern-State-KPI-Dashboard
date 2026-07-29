import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("defaults to type=\"button\" so it never implicitly submits a form", () => {
    const html = renderToStaticMarkup(<Button>Do something</Button>);

    expect(html).toContain('type="button"');
  });

  it("keeps an explicit submit intent overridable", () => {
    const html = renderToStaticMarkup(<Button type="submit">Save</Button>);

    expect(html).toContain('type="submit"');
    expect(html).not.toContain('type="button"');
  });
});
