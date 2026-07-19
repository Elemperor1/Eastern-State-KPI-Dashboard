import { describe, expect, it } from "vitest";
import type { PersistedTarget } from "./records";
import { resolveEffectiveTargetPolicy } from "./target-policy";

describe("effective Target policy", () => {
  it.each([
    {
      name: "an Annual Target for the Reporting Year before every Full-Plan Target",
      reportingYear: 2026,
      targets: [
        target({ id: 8, target_scope: "full_plan", reporting_year: null, target_year: 2026, target_value: 80 }),
        target({ id: 4, target_scope: "annual", reporting_year: 2026, target_year: 2026, target_value: 20 }),
      ],
      expectedId: 4,
      expectedKind: "annual",
    },
    {
      name: "the nearest future Full-Plan Target when there is no Annual Target",
      reportingYear: 2026,
      targets: [
        target({ id: 3, target_scope: "full_plan", reporting_year: null, target_year: 2029, target_value: 90 }),
        target({ id: 2, target_scope: "full_plan", reporting_year: null, target_year: 2027, target_value: 70 }),
      ],
      expectedId: 2,
      expectedKind: "future_full_plan",
    },
    {
      name: "the latest past Full-Plan Target when no future Target exists",
      reportingYear: 2028,
      targets: [
        target({ id: 1, target_scope: "full_plan", reporting_year: null, target_year: 2025, target_value: 50 }),
        target({ id: 2, target_scope: "full_plan", reporting_year: null, target_year: 2027, target_value: 70 }),
      ],
      expectedId: 2,
      expectedKind: "past_full_plan",
    },
    {
      name: "the lowest stable id when equally effective Targets exist",
      reportingYear: 2026,
      targets: [
        target({ id: 9, target_scope: "full_plan", reporting_year: null, target_year: 2027, target_value: 90 }),
        target({ id: 3, target_scope: "full_plan", reporting_year: null, target_year: 2027, target_value: 30 }),
      ],
      expectedId: 3,
      expectedKind: "future_full_plan",
    },
  ])("selects $name", ({ reportingYear, targets, expectedId, expectedKind }) => {
    const decision = resolveEffectiveTargetPolicy({
      targets,
      reportingYear,
      measurementType: "percentage",
      parentConfigurationStatus: "active",
    });

    expect(decision.effective.target?.id).toBe(expectedId);
    expect(decision.effective.kind).toBe(expectedKind);
  });

  it("preserves zero and maps unresolved configuration to one calculation status", () => {
    const zero = resolveEffectiveTargetPolicy({
      targets: [target({ target_value: 0 })],
      reportingYear: 2026,
      measurementType: "count",
      parentConfigurationStatus: "active",
    });
    const draft = resolveEffectiveTargetPolicy({
      targets: [target({ target_value: 25, configuration_status: "draft" })],
      reportingYear: 2026,
      measurementType: "percentage",
      parentConfigurationStatus: "active",
    });
    const undefinedStructured = resolveEffectiveTargetPolicy({
      targets: [
        target({
          target_value: null,
          structured_target: { unsupported: true },
          configuration_status: "active",
        }),
      ],
      reportingYear: 2026,
      measurementType: "percentage",
      parentConfigurationStatus: "active",
    });

    expect(zero.effective).toMatchObject({
      value: 0,
      calculationConfigurationStatus: "active",
      progressStatus: "not_started",
    });
    expect(draft.effective).toMatchObject({
      value: null,
      calculationConfigurationStatus: "needs_target",
      progressStatus: "target_not_finalized",
    });
    expect(undefinedStructured.effective).toMatchObject({
      value: null,
      calculationConfigurationStatus: "needs_definition",
      progressStatus: "needs_definition",
    });
  });

  it("ignores archived Targets and retains separate Annual and Full-Plan decisions", () => {
    const decision = resolveEffectiveTargetPolicy({
      targets: [
        target({ id: 1, target_value: 10, archived_at: "2026-01-01" }),
        target({ id: 2, target_value: 20 }),
        target({
          id: 3,
          target_scope: "full_plan",
          reporting_year: null,
          target_year: 2029,
          target_value: 90,
        }),
      ],
      reportingYear: 2026,
      measurementType: "count",
      parentConfigurationStatus: "active",
    });

    expect(decision.annual.target?.id).toBe(2);
    expect(decision.fullPlan.target?.id).toBe(3);
    expect(decision.effective.target?.id).toBe(2);
  });
});

/** Supports the target test scenario. */
function target(overrides: Partial<PersistedTarget> = {}): PersistedTarget {
  return {
    id: 1,
    kpi_id: 1,
    component_id: null,
    target_scope: "annual",
    reporting_year: 2026,
    target_year: 2026,
    external_target_year: false,
    target_value: 10,
    structured_target: null,
    target_description: "Reach the target.",
    baseline_year: null,
    baseline_value: null,
    configuration_status: "active",
    source_reference: null,
    last_reviewed_date: null,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_by: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
