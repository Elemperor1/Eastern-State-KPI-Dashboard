import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BoardReportingEditorClient } from "./BoardReportingEditorClient";

describe("BoardReportingEditorClient", () => {
  const model = {
    scope: {
      id: 1,
      planId: 2,
      revision: 3,
      priorities: [{
        id: 4,
        priorityId: 5,
        prioritySlug: "visitor",
        priorityName: "Visitor Experience",
        displayTitle: "Board visitor focus",
        displayOrder: 10,
        statements: [{
          id: 6,
          text: "Grow attendance.",
          displayOrder: 10,
          measures: [{ id: 7, slug: "attendance", name: "Attendance" }],
        }],
      }],
    },
    availablePriorities: [{
      id: 5,
      slug: "visitor",
      name: "Visitor Experience",
      measures: [
        { id: 7, slug: "attendance", name: "Attendance" },
        { id: 8, slug: "budget", name: "Budget impact" },
      ],
    }],
  };

  it("renders editable persisted scope controls and the saved-result preview", () => {
    const html = renderToStaticMarkup(createElement(BoardReportingEditorClient, {
      initialModel: model,
    }));
    expect(html).toContain("Board visibility");
    expect(html).toContain("Board visitor focus");
    expect(html).toContain("Grow attendance.");
    expect(html).toContain("Attendance ×");
    expect(html).toContain("Budget impact");
    expect(html).toContain("Board preview");
    expect(html).toContain("Save Board visibility");
  });

  it("participates as an independent source in the shared unsaved-change guard", () => {
    const source = readFileSync(new URL("./BoardReportingEditorClient.tsx", import.meta.url), "utf8");
    expect(source).toContain('setSourceState("board-reporting", { dirty: isDirty, busy })');
    expect(source).toContain('clearSourceState("board-reporting")');
  });
});
