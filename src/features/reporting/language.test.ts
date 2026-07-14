import { describe, expect, it } from "vitest";
import {
  humanizeReportingReason,
  humanizeReportingReasons,
} from "./language";

describe("reporting language", () => {
  it("translates internal completion codes into respectful product language", () => {
    expect(humanizeReportingReason("NO_ELIGIBLE_KPIS")).toBe(
      "No required, fully configured measures are ready",
    );
    expect(humanizeReportingReason("needs_target")).toBe(
      "One or more measure targets are not finalized",
    );
    expect(humanizeReportingReason("GOAL_NEEDS_DEFINITION")).toBe(
      "The goal definition is not finalized",
    );
  });

  it("preserves a goal label while translating compound reason codes", () => {
    expect(
      humanizeReportingReason(
        "Broaden Programming: NO_ELIGIBLE_KPIS; needs_target",
      ),
    ).toBe(
      "Broaden Programming: No required, fully configured measures are ready; One or more measure targets are not finalized",
    );
  });

  it("deduplicates translated reasons without rewriting normal sentences", () => {
    expect(
      humanizeReportingReasons([
        "needs_target",
        "needs_target",
        "Finalize the approved target.",
      ]),
    ).toEqual([
      "One or more measure targets are not finalized",
      "Finalize the approved target.",
    ]);
  });
});
