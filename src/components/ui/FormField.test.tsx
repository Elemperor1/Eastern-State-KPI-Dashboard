import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormField } from "./FormField";
import { Input } from "./Input";

describe("FormField", () => {
  it("associates field feedback with its matching control", () => {
    const html = renderToStaticMarkup(
      <FormField label="Value" htmlFor="result-value" hint="A value is required.">
        <Input id="result-value" aria-invalid />
      </FormField>,
    );

    expect(html).toContain('aria-describedby="result-value-hint"');
    expect(html).toContain('id="result-value-hint"');
    expect(html).toContain("A value is required.");
  });

  it("preserves an existing description when adding field feedback", () => {
    const html = renderToStaticMarkup(
      <FormField label="Value" htmlFor="result-value" hint="Reported in visits.">
        <Input id="result-value" aria-describedby="result-context" />
      </FormField>,
    );

    expect(html).toContain(
      'aria-describedby="result-context result-value-hint"',
    );
  });
});
