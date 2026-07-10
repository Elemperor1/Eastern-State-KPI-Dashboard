import { describe, expect, it } from "vitest";
import { normalizeProgressValue } from "./progress-values";

describe("Progress normalization", () => {
  it("caps visual and accessible values while callers retain the raw result", () => {
    expect(normalizeProgressValue(120)).toEqual({
      value: 100,
      max: 100,
      percentage: 100,
    });
  });

  it("clamps negative values to zero", () => {
    expect(normalizeProgressValue(-10, 50)).toEqual({
      value: 0,
      max: 50,
      percentage: 0,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "renders non-finite value %s as an intentional zero",
    (value) => {
      expect(normalizeProgressValue(value)).toEqual({
        value: 0,
        max: 100,
        percentage: 0,
      });
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "uses a finite default when max is %s",
    (max) => {
      expect(normalizeProgressValue(25, max)).toEqual({
        value: 25,
        max: 100,
        percentage: 25,
      });
    },
  );
});
