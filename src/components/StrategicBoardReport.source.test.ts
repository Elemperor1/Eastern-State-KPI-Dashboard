import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StrategicBoardReport.tsx", import.meta.url),
  "utf8",
);

describe("StrategicBoardReport render contract", () => {
  it("renders every supplied board-report layer and detail type", () => {
    for (const requiredSource of [
      "report.organizationGoalCompletion",
      "report.priorities.map",
      "priority.goalCompletion",
      "priority.goals.map",
      "goal.kpis.map",
      "kpi.result.displayValue",
      "kpi.annualProgress",
      "kpi.fullPlanProgress",
      "kpi.components",
      "kpi.demographics",
      "kpi.revenueBreakdown",
      "report.unresolvedReasons",
      "goal.excludedReasons",
      "kpi.unresolvedReasons",
      "component.unresolvedReasons",
    ]) {
      expect(source, `Missing render source: ${requiredSource}`).toContain(
        requiredSource,
      );
    }
  });

  it("uses shared report primitives and accessible table captions", () => {
    expect(source).toContain('from "@/components/ui"');
    expect(source).toContain("<PrintReportHeader");
    expect(source).toContain("<PrintReportFooter");
    expect(source).toContain("<Card");
    expect(source).toContain("<Table");
    expect(source).toContain("<Progress");
    expect(source).toContain("<caption");
    expect(source).toContain("data-raster-export-text");
    expect(source).not.toMatch(/<(button|input|select|table)\b/);
  });

  it("marks logical export blocks and rows as wrap-safe", () => {
    expect((source.match(/data-pdf-keep-together/g) ?? []).length).toBeGreaterThan(
      8,
    );
    expect((source.match(/break-inside-avoid/g) ?? []).length).toBeGreaterThan(
      8,
    );
    expect(source).toContain("data-raster-export-text");
    expect(source).toContain("wrap-break-word");
    expect(source).toContain("data-raster-export-deferred");
    expect(source).toContain('data-raster-export-min-width="1600"');
    expect(source).toContain("board-report-measure");
  });

  it("states respondent and revenue caveats explicitly", () => {
    expect(source).toContain("Respondent population caveat");
    expect(source).toContain(
      "Respondents may appear in more than one band",
    );
    expect(source).toContain(
      "Values and shares are presented as supplied by the report model.",
    );
    expect(source).toContain(
      "Components remain separate; no unrelated values are averaged here.",
    );
  });

  it("qualifies every compact status badge with its subject", () => {
    expect(source).toContain('label="Board status"');
    expect(source).toContain('label="Setup status"');
    expect(source).toContain('label="Result state"');
    expect(source).toContain('label={`${component.label} result state`}');
    expect(source).toContain('label="Target status"');
    expect(source).not.toContain('<StatusBadge label="Board"');
    expect(source).not.toContain('<StatusBadge label="Setup"');
    expect(source).not.toContain('<StatusBadge label="Result"');
  });
});
