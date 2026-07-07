import { describe, expect, it } from "vitest";
import {
  CreateGoalSchema,
  DeleteGoalSchema,
  PatchGoalSchema,
  parseGoalListParams,
} from "./validation";

describe("goal validation", () => {
  it("normalizes list query parameters the same way as the API route", () => {
    const params = new URLSearchParams({
      throughMonth: "99",
      year: "2025.6",
    });

    expect(parseGoalListParams(params)).toEqual({ throughMonth: 12, year: 2026 });
  });

  it("omits invalid list query parameters", () => {
    const params = new URLSearchParams({
      throughMonth: "not-a-month",
      year: "nope",
    });

    expect(parseGoalListParams(params)).toEqual({ throughMonth: undefined, year: undefined });
  });

  it("accepts the create, patch, and delete payload shapes used by the route", () => {
    expect(
      CreateGoalSchema.safeParse({
        kpi_id: 1,
        target_year: 2026,
        goal_type: "pct",
        target_value: 12.5,
        enabled: true,
        notes: null,
      }).success,
    ).toBe(true);

    expect(
      PatchGoalSchema.safeParse({
        id: 1,
        enabled: false,
        goal_type: "number",
        target_value: 3,
        notes: "updated",
      }).success,
    ).toBe(true);

    expect(DeleteGoalSchema.safeParse({ id: 1 }).success).toBe(true);
  });

  it("rejects invalid mutation payloads", () => {
    expect(CreateGoalSchema.safeParse({ kpi_id: -1 }).success).toBe(false);
    expect(PatchGoalSchema.safeParse({ id: 1 }).success).toBe(false);
    expect(DeleteGoalSchema.safeParse({ id: 0 }).success).toBe(false);
  });
});
