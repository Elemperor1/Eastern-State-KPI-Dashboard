import { describe, expect, it } from "vitest";
import { BoardReportingScopeUpdateSchema } from "./validation";

describe("Board reporting scope validation", () => {
  it("accepts explicit unmeasured statements and an empty Board view", () => {
    expect(BoardReportingScopeUpdateSchema.safeParse({
      expectedRevision: 0,
      priorities: [],
    }).success).toBe(true);
    expect(BoardReportingScopeUpdateSchema.safeParse({
      expectedRevision: 0,
      priorities: [{
        priorityId: 1,
        displayTitle: "Historic preservation",
        statements: [{ text: "Complete the assessment phase.", kpiIds: [] }],
      }],
    }).success).toBe(true);
  });

  it("rejects duplicate priorities, duplicate links, and blank statements", () => {
    const result = BoardReportingScopeUpdateSchema.safeParse({
      expectedRevision: 0,
      priorities: [
        {
          priorityId: 1,
          displayTitle: "Visitor",
          statements: [{ text: "", kpiIds: [2, 2] }],
        },
        { priorityId: 1, displayTitle: "Visitor again", statements: [] },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Enter a focus statement.",
          "A measure can be linked only once per statement.",
          "Each priority can appear only once.",
        ]),
      );
    }
  });
});
