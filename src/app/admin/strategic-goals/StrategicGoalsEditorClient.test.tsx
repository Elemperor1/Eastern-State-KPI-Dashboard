import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { StrategicGoalEditorRecord } from "@/components/strategic-goal-editor-model";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import {
  StrategicGoalsEditorClient,
  StrategicGoalSettingsForm,
} from "./StrategicGoalsEditorClient";

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
        reportingYear: 2026,
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
    expect(html).toContain("Create successor version");
    expect(html).toContain("Create successor membership");
  });

  it("shows manual completion status only for manual rules", () => {
    const html = renderToStaticMarkup(
      createElement(StrategicGoalSettingsForm, {
        goal: goal({
          completion_rule: "manual_status",
          manual_status: "in_progress",
        }),
        reportingYear: 2026,
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
        reportingYear: 2026,
        runMutation,
        runMembershipMutation,
      }),
    );
    expect(html).toContain("This strategic goal is archived");
    expect(html).toContain("Restore goal");
    expect(html).toContain("fieldset disabled");
    expect(html).toContain("Save goal settings");
  });

  it("hides successor actions in the final selectable plan year", () => {
    const html = renderToStaticMarkup(
      createElement(StrategicGoalSettingsForm, {
        goal: goal(),
        reportingYear: 2029,
        runMutation,
        runMembershipMutation,
      }),
    );
    expect(html).not.toContain("Create successor version");
    expect(html).not.toContain("Create successor membership");
  });

  it("renders a carried successor selection instead of falling back to the first goal", () => {
    const successor = goal({
      id: 52,
      name: "Interpretive plan successor",
      slug: "interpretive-plan-from-2027",
      plan_start_year: 2027,
    });
    const html = renderToStaticMarkup(
      createElement(StrategicGoalsEditorClient, {
        initialGoals: [goal({ id: 99, name: "First visible goal" }), successor],
        initialSelectedGoalId: successor.id,
        reportingYear: 2027,
      }),
    );
    expect(html).toContain('value="52" selected=""');
    expect(html).toContain(
      '<h2 id="strategic-goal-settings-title" class="mt-1 text-xl font-semibold text-ink-900">Interpretive plan successor</h2>',
    );
  });
});
