import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { StrategicGoalEditorRecord } from "@/components/strategic-goal-editor-model";
import { StrategicGoalSettingsForm } from "./StrategicGoalsEditorClient";

function goal(
  overrides: Partial<StrategicGoalEditorRecord> = {},
): StrategicGoalEditorRecord {
  return {
    id: 1,
    priority_id: 10,
    priority_slug: "visitor-experience",
    priority_name: "Visitor Experience",
    slug: "interpretive-plan",
    name: "Develop the interpretive plan",
    description: "Complete and adopt the primary interpretive plan.",
    plan_start_year: 2025,
    plan_end_year: 2029,
    completion_rule: "all_required_kpis",
    threshold_count: null,
    threshold_percentage: null,
    manual_status: null,
    board_level_status: "on_track",
    configuration_status: "active",
    unresolved_question: null,
    owner: "Interpretation",
    due_date: null,
    resolution_notes: null,
    source_reference: "Strategic plan",
    last_reviewed_date: "2026-07-09",
    sort_order: 10,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01 00:00:00",
    updated_by: null,
    updated_at: "2026-01-01 00:00:00",
    members: [
      {
        id: 101,
        name: "Plan milestones completed",
        role: "required",
        weight: 1,
        displayOrder: 0,
        effectiveFromYear: 2025,
        effectiveToYear: 2029,
        configurationStatus: "active",
      },
      {
        id: 102,
        name: "Community feedback participation",
        role: "informational",
        weight: 0.5,
        displayOrder: 1,
        effectiveFromYear: 2025,
        effectiveToYear: 2029,
        configurationStatus: "needs_target",
      },
    ],
    ...overrides,
  };
}

const runMutation = async () => ({ ok: true, error: null });
const runMembershipMutation = async () => ({ ok: true, error: null });

describe("StrategicGoalSettingsForm", () => {
  it("renders threshold controls and KPI membership context", () => {
    const html = renderToStaticMarkup(
      createElement(StrategicGoalSettingsForm, {
        goal: goal({
          completion_rule: "threshold_count",
          threshold_count: 2,
        }),
        runMutation,
        runMembershipMutation,
      }),
    );
    expect(html).toContain("Threshold type");
    expect(html).toContain("Threshold value");
    expect(html).toContain("Plan milestones completed");
    expect(html).toContain("Informational");
    expect(html).toContain("Completion role");
    expect(html).toContain("Display order");
    expect(html).toContain("Save membership");
    expect(html).toContain("Save goal settings");
  });

  it("shows manual completion status only for manual rules", () => {
    const html = renderToStaticMarkup(
      createElement(StrategicGoalSettingsForm, {
        goal: goal({
          completion_rule: "manual_status",
          manual_status: "in_progress",
        }),
        runMutation,
        runMembershipMutation,
      }),
    );
    expect(html).toContain("Manual completion status");
    expect(html).toContain("In progress");
    expect(html).not.toContain("Threshold type");
  });

  it("renders archived goals as read-only with a restore action", () => {
    const html = renderToStaticMarkup(
      createElement(StrategicGoalSettingsForm, {
        goal: goal({
          configuration_status: "archived",
          archived_at: "2026-07-09 12:00:00",
        }),
        runMutation,
        runMembershipMutation,
      }),
    );
    expect(html).toContain("This strategic goal is archived");
    expect(html).toContain("Restore goal");
    expect(html).toContain("fieldset disabled");
    expect(html).toContain("Save goal settings");
  });
});
