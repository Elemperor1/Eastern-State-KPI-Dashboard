import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const clientSource = readFileSync(
  new URL("./StrategicDataEntryClient.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("strategic data-entry UI contract", () => {
  it("renders through shared controls and keeps destructive actions confirmed", () => {
    expect(clientSource).toContain('from "@/components/ui"');
    for (const primitive of [
      "<Button",
      "<Checkbox",
      "<ConfirmDialog",
      "<FormField",
      "<IconButton",
      "<Input",
      "<Select",
      "<StatusBanner",
      "<Table",
      "<Textarea",
    ]) {
      expect(clientSource).toContain(primitive);
    }
    expect(clientSource).not.toMatch(/<(button|input|select|table|textarea)\b/);
  });

  it("provides an explicit input surface for every strategic measurement family", () => {
    for (const requiredCopy of [
      'measurementType === "count"',
      'measurementType === "currency"',
      'measurementType === "cumulative"',
      'measurementType === "year_over_year"',
      'measurementType === "binary"',
      'measurementType === "milestone"',
      'measurementType === "percentage"',
      'measurementType === "ratio"',
      'measurementType === "average"',
      'measurementType === "distribution"',
      'kpi.measurementType === "multi_component"',
      "Average input method",
      "Numerator",
      "Denominator",
      "Respondent total",
      "Categories are mutually exclusive",
      "Notes",
      "Source reference",
    ]) {
      expect(clientSource, `Missing UI contract: ${requiredCopy}`).toContain(
        requiredCopy,
      );
    }
  });

  it("shows periods as domain labels without exposing annual storage month zero", () => {
    expect(clientSource).toContain("entryPeriodOptions");
    expect(clientSource).toContain("strategicDataEntryPeriodLabel");
    expect(clientSource).toContain("No month selector is required");
    expect(clientSource).not.toMatch(/month 0/i);
  });

  it("loads all first-class value families and preserves their raw source fields", () => {
    for (const operation of [
      "listStrategyObservations",
      "listStrategyComponentEntries",
      "listStrategyDistributions",
      "listEffectiveDistributionBands",
    ]) {
      expect(pageSource).toContain(operation);
    }
    expect(clientSource).toContain("strategicDataEntryRawValueLabel");
    expect(clientSource).toContain("record.notes");
    expect(clientSource).toContain("record.sourceReference");
    expect(clientSource).toContain("band.labelSnapshot");
  });
});
