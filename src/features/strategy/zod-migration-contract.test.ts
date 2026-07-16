import contractFixture from "./fixtures/zod-migration-production-contract.json";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "@/lib/zod";
import type { StrategyJsonValue } from "./types";
import { asStrategicAuditEvent, asTarget } from "./records";
import {
  MeasurementConfigurationCreateSchema,
  StrategicTargetCreateSchema,
  StrategyAuditEventInputSchema,
} from "./validation";
import {
  StrategyObservationSubmissionSchema,
  StrategyObservationWriteSchema,
} from "./value-entry";

describe("Zod migration production-compatible contract", () => {
  it("parses current persisted configuration, target, and recursive audit fixtures", () => {
    const configuration = MeasurementConfigurationCreateSchema.parse(
      contractFixture.measurementConfiguration,
    );
    expect(configuration).toEqual({
      ...contractFixture.measurementConfiguration,
      numerator_label: null,
      denominator_label: null,
      fixed_denominator: null,
      baseline_value: null,
      aggregation_method: "none",
      board_level_status: "not_reported",
      calculation_precision: 1,
      allow_score_over_max: false,
      unresolved_question: null,
      owner: null,
      due_date: null,
      resolution_notes: null,
      source_reference: null,
      last_reviewed_date: null,
    });

    const target = StrategicTargetCreateSchema.parse(contractFixture.strategicTarget);
    expectTypeOf(target.structured_target).toEqualTypeOf<
      Record<string, StrategyJsonValue> | null
    >();
    expect(target.structured_target).toEqual(
      contractFixture.strategicTarget.structured_target,
    );
    expect(target).not.toHaveProperty("component_id");
    expect(target).toMatchObject({
      reporting_year: null,
      external_target_year: false,
      target_value: null,
      target_description: null,
      baseline_year: null,
      baseline_value: null,
      last_reviewed_date: null,
    });

    const audit = StrategyAuditEventInputSchema.parse(contractFixture.auditEvent);
    expect(audit.previous_value).toEqual(contractFixture.auditEvent.previous_value);
    expect(audit.new_value).toEqual(contractFixture.auditEvent.new_value);
    expect(
      StrategyAuditEventInputSchema.parse({
        ...contractFixture.auditEvent,
        occurred_at: "2026-07-16T14:00:00+0400",
      }).occurred_at,
    ).toBe("2026-07-16T14:00:00+0400");
    expect(
      StrategyAuditEventInputSchema.parse({
        ...contractFixture.auditEvent,
        occurred_at: "2026-07-16T14:00:00+9999",
      }).occurred_at,
    ).toBe("2026-07-16T14:00:00+9999");
  });

  it("loads serialized production-compatible target and audit rows before validation", () => {
    const persistedTarget = asTarget({
      id: 7,
      kpi_id: contractFixture.strategicTarget.kpi_id,
      component_id: null,
      target_scope: contractFixture.strategicTarget.target_scope,
      reporting_year: null,
      target_year: contractFixture.strategicTarget.target_year,
      external_target_year: 0,
      target_value: null,
      structured_target_json: JSON.stringify(
        contractFixture.strategicTarget.structured_target,
      ),
      target_description: null,
      baseline_year: null,
      baseline_value: null,
      configuration_status: contractFixture.strategicTarget.configuration_status,
      source_reference: contractFixture.strategicTarget.source_reference,
      last_reviewed_date: null,
      archived_at: null,
      created_by: 2,
      created_at: "2026-07-16 14:00:00",
      updated_by: 2,
      updated_at: "2026-07-16 14:00:00",
    });
    expect(persistedTarget.structured_target).toEqual(
      contractFixture.strategicTarget.structured_target,
    );
    expect(
      StrategicTargetCreateSchema.parse({
        kpi_id: persistedTarget.kpi_id,
        component_id: persistedTarget.component_id,
        target_scope: persistedTarget.target_scope,
        reporting_year: persistedTarget.reporting_year,
        target_year: persistedTarget.target_year,
        external_target_year: persistedTarget.external_target_year,
        target_value: persistedTarget.target_value,
        structured_target: persistedTarget.structured_target,
        target_description: persistedTarget.target_description,
        baseline_year: persistedTarget.baseline_year,
        baseline_value: persistedTarget.baseline_value,
        configuration_status: persistedTarget.configuration_status,
        source_reference: persistedTarget.source_reference,
        last_reviewed_date: persistedTarget.last_reviewed_date,
      }).structured_target,
    ).toEqual(contractFixture.strategicTarget.structured_target);

    const persistedAudit = asStrategicAuditEvent({
      id: 12,
      entity_type: contractFixture.auditEvent.entity_type,
      entity_id: contractFixture.auditEvent.entity_id,
      event_type: contractFixture.auditEvent.action,
      entity_display_name: contractFixture.auditEvent.entity_display_name,
      parent_priority_name: contractFixture.auditEvent.parent_priority_name,
      parent_goal_name: contractFixture.auditEvent.parent_goal_name,
      previous_value_json: JSON.stringify(contractFixture.auditEvent.previous_value),
      new_value_json: JSON.stringify(contractFixture.auditEvent.new_value),
      actor_id: contractFixture.auditEvent.actor_id,
      actor_email_snapshot: contractFixture.auditEvent.actor_email,
      source_reference: null,
      occurred_at: contractFixture.auditEvent.occurred_at,
    });
    expect(persistedAudit.previous_value).toEqual(
      contractFixture.auditEvent.previous_value,
    );
    expect(persistedAudit.new_value).toEqual(contractFixture.auditEvent.new_value);
    expect(
      StrategyAuditEventInputSchema.parse({
        entity_type: persistedAudit.entity_type,
        entity_id: persistedAudit.entity_id,
        action: persistedAudit.event_type,
        entity_display_name: persistedAudit.entity_display_name,
        parent_priority_id: null,
        parent_priority_name: null,
        parent_goal_id: null,
        parent_goal_name: null,
        previous_value: persistedAudit.previous_value,
        new_value: persistedAudit.new_value,
        actor_id: persistedAudit.actor_id,
        actor_display_name: contractFixture.auditEvent.actor_display_name,
        actor_email: persistedAudit.actor_email_snapshot,
        occurred_at: persistedAudit.occurred_at,
      }).new_value,
    ).toEqual(contractFixture.auditEvent.new_value);
  });

  it("preserves value-entry defaults, zero values, and arbitrary JSON record values", () => {
    expect(
      StrategyObservationWriteSchema.parse(contractFixture.observationWrite),
    ).toEqual({
      ...contractFixture.observationWrite,
      reporting_month: null,
      reporting_quarter: null,
      flexible_mode: null,
      numerator: null,
      denominator: null,
      average_inputs: null,
      source_reference: null,
    });

    expect(
      StrategyObservationWriteSchema.parse(contractFixture.averageObservationWrite),
    ).toEqual({
      ...contractFixture.averageObservationWrite,
      reporting_month: null,
      reporting_quarter: null,
      flexible_mode: null,
      value: null,
      numerator: null,
      denominator: null,
      notes: null,
      source_reference: null,
    });
  });

  it("preserves record key and value domains for recursive JSON and raw averages", () => {
    const invalidJsonValue = StrategicTargetCreateSchema.safeParse({
      ...contractFixture.strategicTarget,
      structured_target: {
        valid_key: "kept",
        invalid_value: undefined,
      },
    });
    expect(invalidJsonValue.success).toBe(false);
    if (!invalidJsonValue.success) {
      expect(invalidJsonValue.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["structured_target", "invalid_value"] }),
        ]),
      );
    }

    const rawAverage = StrategyObservationWriteSchema.parse({
      ...contractFixture.averageObservationWrite,
      average_inputs: {
        "source-system": "survey-platform",
        nested: { accepted: true, score: 4.5 },
      },
    });
    expect(rawAverage.average_inputs).toEqual({
      "source-system": "survey-platform",
      nested: { accepted: true, score: 4.5 },
    });
  });

  it("preserves strict unknown-field handling, missing fields, and user-facing paths", () => {
    const unknownField = StrategyObservationWriteSchema.safeParse({
      ...contractFixture.observationWrite,
      unexpected: true,
    });
    expect(unknownField.success).toBe(false);
    if (!unknownField.success) {
      expect(z.flattenError(unknownField.error)).toMatchObject({
        formErrors: [expect.stringMatching(/unrecognized key/i)],
        fieldErrors: {},
      });
    }

    const missingTarget = StrategicTargetCreateSchema.safeParse({
      kpi_id: 41,
      target_scope: "full_plan",
      target_year: 2029,
    });
    expect(missingTarget.success).toBe(false);
    if (!missingTarget.success) {
      expect(missingTarget.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["target_value"],
            message: "Provide a numeric, structured, or descriptive target.",
          }),
        ]),
      );
    }
  });

  it("keeps single and multi-input API submission shapes distinct", () => {
    expect(
      StrategyObservationSubmissionSchema.safeParse(
        contractFixture.observationWrite,
      ).success,
    ).toBe(true);
    expect(
      StrategyObservationSubmissionSchema.safeParse({
        submission_type: "multi_input",
        writes: [],
      }).success,
    ).toBe(false);
    expect(
      StrategyObservationSubmissionSchema.safeParse({
        submission_type: "multi_input",
        writes: [
          {
            kind: "component_entry",
            input: {
              component_id: 9,
              reporting_year: 2026,
              value: 12,
              unexpected: true,
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe integer identifiers and numeric strings at JSON boundaries", () => {
    expect(
      StrategyObservationWriteSchema.safeParse({
        ...contractFixture.observationWrite,
        kpi_id: Number.MAX_SAFE_INTEGER,
      }).success,
    ).toBe(true);
    expect(
      StrategyObservationWriteSchema.safeParse({
        ...contractFixture.observationWrite,
        kpi_id: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
    expect(
      StrategyObservationWriteSchema.safeParse({
        ...contractFixture.observationWrite,
        reporting_year: "2026",
      }).success,
    ).toBe(false);
  });
});
