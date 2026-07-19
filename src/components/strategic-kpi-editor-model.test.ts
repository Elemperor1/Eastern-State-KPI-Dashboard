import { describe, expect, it } from "vitest";
import type {
  PersistedMeasurementConfig,
  PersistedTarget,
  StrategyComponentWithTargets,
  StrategyKpiIdentity,
} from "@/features/strategy";
import {
  STRATEGY_EDITOR_ENDPOINTS,
  buildComponentFormPayload,
  buildComponentLifecycleMutation,
  buildComponentMutation,
  buildComponentReorderMutation,
  buildConfigurationFormPayload,
  buildConfigurationMutation,
  buildSuccessorConfigurationMutation,
  buildDistributionBandLifecycleMutation,
  buildDistributionBandMutation,
  buildDistributionBandPayload,
  buildDistributionBandReorderMutation,
  buildTargetFormPayload,
  buildTargetMutation,
  canCreateMeasurementSuccessor,
  componentDraftFromData,
  configurationDraftFromData,
  distributionBandDraftFromData,
  moveId,
  targetDraftForScope,
  successorConfigurationDraftFromData,
  type ComponentFormDraft,
  type ConfigurationFormDraft,
  type DistributionBandFormDraft,
  type TargetFormDraft,
} from "./strategic-kpi-editor-model";

const metadata = {
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_by: null,
  updated_at: "2026-01-01T00:00:00Z",
};

function kpi(): StrategyKpiIdentity {
  return {
    id: 42,
    slug: "conversion-rate",
    name: "Visitor conversion rate",
    unit: "%",
    category_id: 2,
    category_slug: "financial",
    category_name: "Financial Sustainability",
  };
}

function configuration(
  overrides: Partial<PersistedMeasurementConfig> = {},
): PersistedMeasurementConfig {
  return {
    id: 7,
    kpi_id: 42,
    effective_from_year: 2025,
    effective_to_year: 2029,
    measurement_type: "percentage",
    unit: "%",
    numerator_label: "Purchasers",
    denominator_label: "Visitors",
    fixed_denominator: null,
    baseline_value: 0,
    reporting_frequency: "annual",
    aggregation_method: "none",
    board_level_status: "on_track",
    calculation_precision: 1,
    configuration_status: "active",
    unresolved_question: null,
    owner: "Finance",
    due_date: null,
    resolution_notes: null,
    source_reference: null,
    last_reviewed_date: "2026-06-01",
    allow_score_over_max: false,
    archived_at: null,
    ...metadata,
    ...overrides,
  };
}

function target(
  overrides: Partial<PersistedTarget> = {},
): PersistedTarget {
  return {
    id: 10,
    kpi_id: 42,
    component_id: null,
    target_scope: "annual",
    reporting_year: 2026,
    target_year: 2026,
    external_target_year: false,
    target_value: 0,
    structured_target: null,
    target_description: "Maintain zero exceptions",
    baseline_year: null,
    baseline_value: null,
    configuration_status: "active",
    source_reference: null,
    last_reviewed_date: null,
    archived_at: null,
    ...metadata,
    ...overrides,
  };
}

function component(
  overrides: Partial<StrategyComponentWithTargets> = {},
): StrategyComponentWithTargets {
  return {
    id: 20,
    kpi_id: 42,
    configuration_id: 7,
    slug: "admissions",
    label: "Admissions",
    measurement_type: "currency",
    unit: "USD",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    baseline_value: 0,
    previous_period_value: 0,
    aggregation_role: "value",
    weight: 1,
    display_order: 0,
    configuration_status: "active",
    unresolved_question: null,
    archived_at: null,
    targets: [],
    ...metadata,
    ...overrides,
  };
}

function validConfigurationDraft(
  overrides: Partial<ConfigurationFormDraft> = {},
): ConfigurationFormDraft {
  return {
    effectiveStartYear: "2025",
    effectiveEndYear: "2029",
    measurementType: "percentage",
    unit: "%",
    numeratorLabel: "Purchasers",
    denominatorLabel: "Visitors",
    fixedDenominator: "",
    baselineValue: "0",
    reportingFrequency: "annual",
    aggregationMethod: "none",
    boardStatus: "on_track",
    calculationPrecision: "1",
    allowScoreOverMax: false,
    configurationStatus: "active",
    unresolvedQuestion: "",
    owner: "Finance",
    dueDate: "",
    resolutionNotes: "",
    sourceReference: "",
    lastReviewedDate: "2026-06-01",
    ...overrides,
  };
}

function validTargetDraft(
  overrides: Partial<TargetFormDraft> = {},
): TargetFormDraft {
  return {
    id: null,
    scope: "annual",
    targetYear: "2026",
    externalTargetYear: false,
    targetValue: "0",
    structuredTarget: "",
    targetDescription: "Maintain zero exceptions",
    configurationStatus: "active",
    sourceReference: "",
    lastReviewedDate: "",
    ...overrides,
  };
}

function validComponentDraft(
  overrides: Partial<ComponentFormDraft> = {},
): ComponentFormDraft {
  return {
    id: null,
    slug: "admissions",
    label: "Admissions",
    measurementType: "currency",
    unit: "USD",
    numeratorLabel: "",
    denominatorLabel: "",
    fixedDenominator: "",
    baselineValue: "0",
    previousPeriodValue: "0",
    aggregationRole: "value",
    weight: "1",
    displayOrder: "0",
    configurationStatus: "draft",
    unresolvedQuestion: "",
    ...overrides,
  };
}

function validBandDraft(
  overrides: Partial<DistributionBandFormDraft> = {},
): DistributionBandFormDraft {
  return {
    id: null,
    slug: "declined",
    label: "Declined to answer",
    effectiveFromYear: "2025",
    effectiveToYear: "2029",
    displayOrder: "0",
    isUnknown: false,
    isDeclined: true,
    derivedGroup: "",
    ...overrides,
  };
}

describe("strategic KPI editor form model", () => {
  it("creates drafts without losing valid zero values", () => {
    const configDraft = configurationDraftFromData(configuration(), kpi(), 2026);
    const componentDraft = componentDraftFromData(component(), 0);
    expect(configDraft.baselineValue).toBe("0");
    expect(componentDraft.baselineValue).toBe("0");
    expect(componentDraft.previousPeriodValue).toBe("0");
  });

  it("validates complete percentage configuration definitions", () => {
    const result = buildConfigurationFormPayload(
      validConfigurationDraft({ numeratorLabel: "", denominatorLabel: "" }),
      42,
      7,
    );
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        errors: expect.objectContaining({ numerator_label: expect.any(String) }),
      }),
    );
  });

  it("requires an explicit question for unresolved configuration", () => {
    const result = buildConfigurationFormPayload(
      validConfigurationDraft({
        configurationStatus: "needs_target",
        unresolvedQuestion: "",
      }),
      42,
      7,
    );
    expect(result).toMatchObject({
      ok: false,
      errors: { unresolved_question: expect.any(String) },
    });
  });

  it("builds create and update configuration requests with isolated endpoints", () => {
    const create = buildConfigurationFormPayload(
      validConfigurationDraft(),
      42,
      null,
    );
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    expect(create.payload).toMatchObject({ kpi_id: 42, baseline_value: 0 });
    expect(buildConfigurationMutation(create.payload, true)).toMatchObject({
      endpoint: STRATEGY_EDITOR_ENDPOINTS.configurations,
      method: "POST",
      body: { kpi_id: 42 },
    });
    expect(buildConfigurationMutation({ id: 7 }, false)).toEqual({
      endpoint: STRATEGY_EDITOR_ENDPOINTS.configurations,
      method: "PATCH",
      body: { action: "update", update: { id: 7 } },
    });
  });

  it("builds an explicit future successor without mutating the predecessor payload", () => {
    const draft = successorConfigurationDraftFromData(
      configuration(),
      kpi(),
      2026,
    );
    expect(draft).toMatchObject({
      effectiveStartYear: "2027",
      effectiveEndYear: "2029",
      measurementType: "percentage",
    });
    const built = buildConfigurationFormPayload(draft, 42, null);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(buildSuccessorConfigurationMutation(7, built.payload)).toEqual({
      endpoint: STRATEGY_EDITOR_ENDPOINTS.configurations,
      method: "PATCH",
      body: {
        action: "create_successor",
        predecessor_id: 7,
        successor: expect.objectContaining({
          kpi_id: 42,
          effective_start_year: 2027,
        }),
      },
    });
  });

  it("does not offer an inaccessible successor after the final plan year", () => {
    expect(canCreateMeasurementSuccessor(configuration(), 2028, 2029)).toBe(true);
    expect(canCreateMeasurementSuccessor(configuration(), 2029, 2029)).toBe(false);
    expect(
      canCreateMeasurementSuccessor(
        configuration({ effective_to_year: 2027 }),
        2027,
        2029,
      ),
    ).toBe(false);
  });

  it("selects annual and full-plan targets independently and ignores archives", () => {
    const targets = [
      target({ id: 1, reporting_year: 2025, target_year: 2025 }),
      target({ id: 2, reporting_year: 2026, target_year: 2026 }),
      target({
        id: 3,
        target_scope: "full_plan",
        reporting_year: null,
        target_year: 2029,
      }),
      target({ id: 4, archived_at: "2026-01-01T00:00:00Z" }),
    ];
    expect(targetDraftForScope(targets, "annual", 2026, 2029).id).toBe(2);
    expect(targetDraftForScope(targets, "full_plan", 2026, 2029).id).toBe(3);
  });

  it("edits the nearest-future then latest-past full-plan boundary target", () => {
    const targets = [
      target({
        id: 26,
        target_scope: "full_plan",
        reporting_year: null,
        target_year: 2026,
      }),
      target({
        id: 29,
        target_scope: "full_plan",
        reporting_year: null,
        target_year: 2029,
      }),
    ];
    expect(targetDraftForScope(targets, "full_plan", 2025, 2029).id).toBe(26);
    expect(targetDraftForScope(targets, "full_plan", 2027, 2029).id).toBe(29);
    expect(targetDraftForScope(targets, "full_plan", 2030, 2029).id).toBe(29);
  });

  it("round-trips a future annual target draft for the selected reporting year", () => {
    const future = target({
      id: 28,
      reporting_year: 2028,
      target_year: 2028,
      target_value: 24,
    });
    const reloaded = targetDraftForScope([future], "annual", 2028, 2029);
    expect(reloaded).toMatchObject({
      id: 28,
      targetYear: "2028",
      targetValue: "24",
    });
    const built = buildTargetFormPayload(reloaded, 42, "count", 2025, 2029);
    expect(built).toMatchObject({
      ok: true,
      payload: {
        id: 28,
        reporting_year: 2028,
        target_year: 2028,
        target_value: 24,
      },
    });
  });

  it("preserves zero targets and rejects missing or invalid percentage targets", () => {
    const zero = buildTargetFormPayload(validTargetDraft(), 42, "count", 2025, 2029);
    expect(zero.ok).toBe(true);
    if (zero.ok) expect(zero.payload.target_value).toBe(0);

    expect(
      buildTargetFormPayload(
        validTargetDraft({ targetValue: "", structuredTarget: "", targetDescription: "" }),
        42,
        "count",
        2025,
        2029,
      ),
    ).toMatchObject({ ok: false, errors: { target_value: expect.any(String) } });
    expect(
      buildTargetFormPayload(
        validTargetDraft({ targetValue: "101" }),
        42,
        "percentage",
        2025,
        2029,
      ),
    ).toMatchObject({ ok: false, errors: { target_value: expect.any(String) } });
  });

  it("parses structured targets, rejects invalid JSON, and preserves component ownership", () => {
    const structured = buildTargetFormPayload(
      validTargetDraft({
        targetValue: "",
        structuredTarget: '{"completed":true}',
      }),
      42,
      "binary",
      2025,
      2029,
      20,
    );
    expect(structured.ok).toBe(true);
    if (structured.ok) {
      expect(structured.payload).toMatchObject({
        kpi_id: null,
        component_id: 20,
        target_value: null,
        structured_target: { completed: true },
      });
    }
    expect(
      buildTargetFormPayload(
        validTargetDraft({ targetValue: "", structuredTarget: "[1,2]" }),
        42,
        "count",
        2025,
        2029,
      ),
    ).toMatchObject({
      ok: false,
      errors: { structured_target: expect.any(String) },
    });
  });

  it("keeps target request envelopes scope-specific", () => {
    const annual = buildTargetFormPayload(validTargetDraft(), 42, "count", 2025, 2029);
    expect(annual.ok).toBe(true);
    if (!annual.ok) return;
    expect(annual.payload).toMatchObject({
      target_scope: "annual",
      reporting_year: 2026,
      target_year: 2026,
    });
    expect(buildTargetMutation(annual.payload, true).method).toBe("POST");
    expect(buildTargetMutation({ id: 10 }, false).body).toEqual({
      action: "update",
      update: { id: 10 },
    });
  });

  it("requires an explicit external marker for target years outside the plan", () => {
    expect(
      buildTargetFormPayload(
        validTargetDraft({ targetYear: "2031" }),
        42,
        "count",
        2025,
        2029,
      ),
    ).toMatchObject({ ok: false, errors: { target_year: expect.any(String) } });
    const external = buildTargetFormPayload(
      validTargetDraft({
        scope: "full_plan",
        targetYear: "2031",
        externalTargetYear: true,
      }),
      42,
      "count",
      2025,
      2029,
    );
    expect(external.ok).toBe(true);
    if (external.ok) {
      expect(external.payload).toMatchObject({
        target_year: 2031,
        external_target_year: true,
      });
    }
  });

  it("validates component unresolved and ratio definitions", () => {
    expect(
      buildComponentFormPayload(
        validComponentDraft({
          configurationStatus: "needs_definition",
          unresolvedQuestion: "",
        }),
        7,
      ),
    ).toMatchObject({
      ok: false,
      errors: { unresolved_question: expect.any(String) },
    });
    expect(
      buildComponentFormPayload(
        validComponentDraft({
          id: 20,
          measurementType: "ratio",
          configurationStatus: "active",
          numeratorLabel: "",
          denominatorLabel: "",
        }),
        7,
      ),
    ).toMatchObject({
      ok: false,
      errors: expect.objectContaining({ numerator_label: expect.any(String) }),
    });
  });

  it("builds component update, lifecycle, and reorder envelopes", () => {
    const built = buildComponentFormPayload(
      validComponentDraft({ id: 20, configurationStatus: "active" }),
      7,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(buildComponentMutation(built.payload, false).body).toMatchObject({
      action: "update",
      update: { id: 20, baseline_value: 0 },
    });
    expect(buildComponentLifecycleMutation(20, "archive").body).toEqual({
      action: "archive",
      id: 20,
    });
    expect(buildComponentReorderMutation(7, [20, 21]).body).toEqual({
      action: "reorder",
      reorder: { configuration_id: 7, ordered_component_ids: [20, 21] },
    });
  });

  it("preserves an explicit ratio aggregation role in component mutations", () => {
    const built = buildComponentFormPayload(
      validComponentDraft({ aggregationRole: "denominator" }),
      7,
    );

    expect(built).toMatchObject({
      ok: true,
      payload: { aggregation_role: "denominator" },
    });
  });

  it("validates distribution band identity, years, and special flags", () => {
    expect(
      buildDistributionBandPayload(
        validBandDraft({ slug: "Not Valid", isUnknown: true }),
        42,
      ),
    ).toMatchObject({
      ok: false,
      errors: expect.objectContaining({
        slug: expect.any(String),
        isDeclined: expect.any(String),
      }),
    });
    expect(
      buildDistributionBandPayload(
        validBandDraft({ effectiveToYear: "2024" }),
        42,
      ),
    ).toMatchObject({
      ok: false,
      errors: { effective_to_year: expect.any(String) },
    });
  });

  it("builds distribution create, update, lifecycle, and reorder envelopes", () => {
    const built = buildDistributionBandPayload(validBandDraft(), 42);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(buildDistributionBandMutation(built.payload, true).body).toMatchObject({
      kpi_id: 42,
      slug: "declined",
    });
    expect(buildDistributionBandMutation({ id: 30 }, false).body).toEqual({
      action: "update",
      band: { id: 30 },
    });
    expect(buildDistributionBandLifecycleMutation(30, "restore").body).toEqual({
      action: "restore",
      id: 30,
    });
    expect(buildDistributionBandReorderMutation(42, 2026, [30, 31]).body).toEqual({
      action: "reorder",
      order: {
        kpi_id: 42,
        component_id: null,
        reporting_year: 2026,
        ordered_band_ids: [30, 31],
      },
    });
    const componentBand = buildDistributionBandPayload(
      validBandDraft(),
      42,
      20,
    );
    expect(componentBand.ok).toBe(true);
    if (componentBand.ok) {
      expect(componentBand.payload.component_id).toBe(20);
    }
    expect(
      buildDistributionBandReorderMutation(42, 2026, [30, 31], 20).body,
    ).toMatchObject({ order: { component_id: 20 } });
  });

  it("moves ordered records without mutating input or crossing boundaries", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(moveId(rows, 2, "up").map((row) => row.id)).toEqual([2, 1, 3]);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(moveId(rows, 1, "up")).toBe(rows);
    expect(moveId(rows, 3, "down")).toBe(rows);
  });

  it("creates a blank distribution-band draft with deterministic order", () => {
    expect(distributionBandDraftFromData(null, 2026, 4)).toMatchObject({
      id: null,
      effectiveFromYear: "2026",
      displayOrder: "4",
      isUnknown: false,
      isDeclined: false,
      derivedGroup: "",
    });
  });
});
