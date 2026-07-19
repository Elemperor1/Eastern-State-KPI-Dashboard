import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { StrategicGoalEditorRecord } from "@/components/strategic-goal-editor-model";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ /** Supports the use router test scenario. */ useRouter: () => router }));

import {
  StrategicGoalsEditorClient,
  StrategicGoalSettingsForm,
} from "./StrategicGoalsEditorClient";

/** Supports the goal test scenario. */
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

/** Supports the run mutation test scenario. */
const runMutation = async () => ({ ok: true, error: null });
/** Supports the run membership mutation test scenario. */
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
        planYears: [2025, 2026, 2027, 2028, 2029],
        runMutation,
        runMembershipMutation,
      }),
    );
    expect(html).toContain("Count by");
    expect(html).toContain("Amount needed");
    expect(html).toContain("Plan milestones completed");
    expect(html).toContain("For information only");
    expect(html).toContain("How it counts");
    expect(html).toContain("List order");
    expect(html).toContain("Save measure");
    expect(html).toContain("Save goal");
    expect(html).toContain("Plan future change");
  });

  it("shows manual completion status only for manual rules", () => {
    const html = renderToStaticMarkup(
      createElement(StrategicGoalSettingsForm, {
        goal: goal({
          completion_rule: "manual_status",
          manual_status: "in_progress",
        }),
        reportingYear: 2026,
        planYears: [2025, 2026, 2027, 2028, 2029],
        runMutation,
        runMembershipMutation,
      }),
    );
    expect(html).toContain("Current progress");
    expect(html).toContain("In progress");
    expect(html).not.toContain("Count by");
  });

  it("renders archived goals as read-only with a restore action", () => {
    const html = renderToStaticMarkup(
      createElement(StrategicGoalSettingsForm, {
        goal: goal({
          configuration_status: "archived",
          archived_at: "2026-07-09 12:00:00",
        }),
        reportingYear: 2026,
        planYears: [2025, 2026, 2027, 2028, 2029],
        runMutation,
        runMembershipMutation,
      }),
    );
    expect(html).toContain("This goal is archived");
    expect(html).toContain("Restore goal");
    expect(html).toContain("fieldset disabled");
    expect(html).toContain("Save goal");
  });

  it("hides successor actions in the final selectable plan year", () => {
    const html = renderToStaticMarkup(
      createElement(StrategicGoalSettingsForm, {
        goal: goal(),
        reportingYear: 2029,
        planYears: [2025, 2026, 2027, 2028, 2029],
        runMutation,
        runMembershipMutation,
      }),
    );
    expect(html).not.toContain("Plan future change");
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
        planYears: [2025, 2026, 2027, 2028, 2029],
      }),
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('goal=52');
    expect(html).toContain(
      '<h2 id="strategic-goal-settings-title" class="mt-1 text-xl font-semibold text-ink-900">Interpretive plan successor</h2>',
    );
  });
});
