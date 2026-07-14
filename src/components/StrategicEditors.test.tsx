import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  PersistedMeasurementConfig,
  StrategyComponentWithTargets,
} from "@/features/strategy";
import { StrategicDistributionBandsEditor } from "./StrategicDistributionBandsEditor";
import { StrategicKpiComponentsEditor } from "./StrategicKpiComponentsEditor";
import type {
  StrategicDistributionBandEditorRecord,
  StrategyEditorMutationRunner,
} from "./strategic-kpi-editor-model";

const runMutation: StrategyEditorMutationRunner = async () => ({
  ok: true,
  error: null,
});

describe("strategic definition editors", () => {
  it("renders every input together without duplicating target editing", () => {
    const html = renderToStaticMarkup(
      <StrategicKpiComponentsEditor
        configuration={configuration()}
        components={[component()]}
        reportingYear={2026}
        runMutation={runMutation}
      />,
    );

    expect(html).toContain("Inputs");
    expect(html).toContain("Participant satisfaction");
    expect(html).toContain("Add input");
    expect(html).toContain("What will people enter?");
    expect(html).toContain("Move Participant satisfaction up");
    expect(html).toContain("Used as");
    expect(html).toContain("Top number");
    expect(html).toContain("Total number");
    expect(html).not.toContain("annual target");
    expect(html).not.toContain("Structured target (JSON)");
  });

  it("isolates demographic bands by their parent or component owner", () => {
    const bands: StrategicDistributionBandEditorRecord[] = [
      band({ id: 30, componentId: null, slug: "all-visitors", label: "All visitors" }),
      band({ id: 31, componentId: 20, slug: "age-18-24", label: "Age 18–24" }),
    ];
    const html = renderToStaticMarkup(
      <StrategicDistributionBandsEditor
        kpiId={42}
        componentId={20}
        reportingYear={2026}
        measurementType="distribution"
        bands={bands}
        runMutation={runMutation}
      />,
    );

    expect(html).toContain("Reporting groups");
    expect(html).toContain("Age 18–24");
    expect(html).not.toContain("All visitors");
    expect(html).toContain("component-20-active-distribution-bands-title");
  });
});

function configuration(): PersistedMeasurementConfig {
  return {
    id: 7,
    kpi_id: 42,
    effective_from_year: 2025,
    effective_to_year: 2029,
    measurement_type: "multi_component",
    unit: "mixed",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    baseline_value: null,
    reporting_frequency: "annual",
    aggregation_method: "ratio",
    board_level_status: "on_track",
    calculation_precision: 1,
    configuration_status: "active",
    unresolved_question: null,
    owner: null,
    due_date: null,
    resolution_notes: null,
    source_reference: null,
    last_reviewed_date: null,
    allow_score_over_max: false,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function component(): StrategyComponentWithTargets {
  return {
    id: 20,
    kpi_id: 42,
    configuration_id: 7,
    slug: "participant-satisfaction",
    label: "Participant satisfaction",
    measurement_type: "average",
    unit: "% normalized",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    baseline_value: null,
    previous_period_value: null,
    aggregation_role: "numerator",
    weight: 1,
    display_order: 0,
    configuration_status: "needs_target",
    unresolved_question: "Finalize the board-approved target.",
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    updated_at: "2026-01-01T00:00:00Z",
    targets: [],
  };
}

function band(
  overrides: Partial<StrategicDistributionBandEditorRecord>,
): StrategicDistributionBandEditorRecord {
  return {
    id: 1,
    kpiId: 42,
    componentId: null,
    slug: "band",
    label: "Band",
    effectiveFromYear: 2025,
    effectiveToYear: 2029,
    displayOrder: 0,
    isUnknown: false,
    isDeclined: false,
    derivedGroup: null,
    archivedAt: null,
    ...overrides,
  };
}
