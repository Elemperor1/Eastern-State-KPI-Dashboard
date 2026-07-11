import { describe, expect, it } from "vitest";
import {
  isProgressToTargetStatus,
  normalizeProgressToTargetViewModel,
} from "./progress-to-target-model";

function model(
  overrides: Partial<Parameters<typeof normalizeProgressToTargetViewModel>[0]> = {},
) {
  return normalizeProgressToTargetViewModel({
    status: "in_progress",
    currentAmount: 2,
    targetAmount: 5,
    actualProgressPercentage: 40,
    displayProgressPercentage: 40,
    targetYear: 2029,
    targetDescription: "Complete five visitor amenity upgrades by 2029",
    pacingStatus: "On track",
    boardStatus: "Monitor",
    ...overrides,
  });
}

describe("ProgressToTarget view-model normalization", () => {
  it("recognizes all six explicit states", () => {
    for (const status of [
      "not_started",
      "in_progress",
      "complete",
      "exceeded",
      "target_not_finalized",
      "needs_definition",
    ]) {
      expect(isProgressToTargetStatus(status)).toBe(true);
    }
    expect(isProgressToTargetStatus("unknown")).toBe(false);
  });

  it("keeps uncapped actual text while capping only the visual fill", () => {
    expect(model({
      status: "exceeded",
      currentAmount: 6,
      actualProgressPercentage: 120,
      displayProgressPercentage: 120,
    })).toMatchObject({
      status: "exceeded",
      actualProgressPercentage: 120,
      actualPercentageLabel: "120%",
      displayProgressPercentage: 100,
      stateLabel: "Exceeded target",
      ariaValueText: "120% actual progress; Exceeded target. 6 current; 5 target.",
    });
  });

  it("preserves a zero target and distinguishes it from a missing target", () => {
    expect(model({
      status: "complete",
      currentAmount: 0,
      targetAmount: 0,
      currentAmountLabel: null,
      targetAmountLabel: null,
      actualProgressPercentage: 100,
    })).toMatchObject({
      status: "complete",
      currentAmountLabel: "0",
      targetAmountLabel: "0",
      hasCalculatedProgress: true,
    });

    expect(model({
      status: "in_progress",
      targetAmount: null,
      actualProgressPercentage: 40,
    })).toMatchObject({
      status: "target_not_finalized",
      targetAmountLabel: "Not finalized",
      actualPercentageLabel: "Not available",
      displayProgressPercentage: 0,
      hasCalculatedProgress: false,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "never exposes non-finite progress value %s",
    (unsafe) => {
      const normalized = model({
        status: "in_progress",
        actualProgressPercentage: unsafe,
        displayProgressPercentage: unsafe,
      });
      expect(normalized.status).toBe("needs_definition");
      expect(normalized.actualProgressPercentage).toBeNull();
      expect(normalized.actualPercentageLabel).toBe("Not available");
      expect(normalized.displayProgressPercentage).toBe(0);
      expect(JSON.stringify(normalized)).not.toMatch(/NaN|Infinity|undefined/);
    },
  );

  it("renders explicit fallback copy for configuration states", () => {
    expect(model({
      status: "target_not_finalized",
      targetAmount: null,
      targetDescription: null,
    })).toMatchObject({
      stateLabel: "Target not finalized",
      targetDescription: "Target details have not been finalized.",
      pacingStatus: "On track",
      boardStatus: "Monitor",
    });
    expect(model({
      status: "needs_definition",
      targetDescription: null,
      pacingStatus: null,
      boardStatus: null,
    })).toMatchObject({
      stateLabel: "Needs definition",
      targetDescription: "The measurement definition must be resolved before progress can be calculated.",
      pacingStatus: "Not assessed",
      boardStatus: "Not set",
    });
  });

  it("keeps target description prominent and safely formats amount/unit/year labels", () => {
    expect(model({
      currentAmount: 1234.5,
      targetAmount: 2000,
      unit: "visitors",
      currentAmountLabel: "NaN",
      targetAmountLabel: "undefined",
      targetYear: Number.NaN,
      accessibleLabel: "Visitor target progress",
    })).toMatchObject({
      currentAmountLabel: "1,234.5 visitors",
      targetAmountLabel: "2,000 visitors",
      targetYearLabel: "Target year not set",
      targetDescription: "Complete five visitor amenity upgrades by 2029",
      accessibleLabel: "Visitor target progress",
    });
  });

  it("provides stable copy for not-started, in-progress, complete, and exceeded", () => {
    expect(model({ status: "not_started", actualProgressPercentage: 0 })).toMatchObject({
      stateLabel: "Not started",
      actualPercentageLabel: "0%",
    });
    expect(model()).toMatchObject({ stateLabel: "In progress" });
    expect(model({ status: "complete", actualProgressPercentage: 100 })).toMatchObject({
      stateLabel: "Complete",
    });
    expect(model({ status: "exceeded", actualProgressPercentage: 110 })).toMatchObject({
      stateLabel: "Exceeded target",
    });
  });
});
