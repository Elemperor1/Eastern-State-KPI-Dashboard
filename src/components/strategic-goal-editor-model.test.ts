import { describe, expect, it } from "vitest";
import type { StrategicGoalEditorRecord } from "./strategic-goal-editor-model";
import {
  STRATEGIC_GOALS_ENDPOINT,
  STRATEGIC_GOAL_MEMBERSHIPS_ENDPOINT,
  buildStrategicGoalMembershipMutation,
  buildStrategicGoalLifecycleMutation,
  buildStrategicGoalSettingsPayload,
  buildStrategicGoalUpdateMutation,
  filterStrategicGoals,
  strategicGoalDraftFromData,
  strategicGoalMembershipDraftFromData,
  strategicGoalPriorityOptions,
} from "./strategic-goal-editor-model";

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
    due_date: "2027-12-31",
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
    ],
    ...overrides,
  };
}

describe("strategic goal editor model", () => {
  it("creates editable drafts without losing threshold or metadata state", () => {
    const draft = strategicGoalDraftFromData(
      goal({
        completion_rule: "threshold_count",
        threshold_percentage: 75,
        owner: null,
      }),
    );
    expect(draft).toMatchObject({
      completionRule: "threshold_count",
      thresholdMode: "percentage",
      thresholdValue: "75",
      owner: "",
      lastReviewedDate: "2026-07-09",
    });
  });

  it("builds strict positive membership updates without changing effective years", () => {
    const member = goal().members[0]!;
    const draft = strategicGoalMembershipDraftFromData(member);
    draft.role = "informational";
    draft.weight = "2.5";
    draft.displayOrder = "4";
    expect(buildStrategicGoalMembershipMutation(member.id, draft)).toEqual({
      ok: true,
      errors: {},
      mutation: {
        endpoint: STRATEGIC_GOAL_MEMBERSHIPS_ENDPOINT,
        method: "PATCH",
        body: {
          id: member.id,
          role: "informational",
          weight: 2.5,
          display_order: 4,
        },
      },
    });
  });

  it("rejects zero membership weight and fractional display order", () => {
    const member = goal().members[0]!;
    expect(
      buildStrategicGoalMembershipMutation(member.id, {
        role: "required",
        weight: "0",
        displayOrder: "1.5",
      }),
    ).toMatchObject({
      ok: false,
      errors: {
        weight: expect.any(String),
        display_order: expect.any(String),
      },
    });
    expect(
      buildStrategicGoalMembershipMutation(member.id, {
        role: "required",
        weight: "1",
        displayOrder: "",
      }),
    ).toMatchObject({
      ok: false,
      errors: { display_order: expect.any(String) },
    });
  });

  it("builds a count-threshold update and clears incompatible manual state", () => {
    const current = goal({
      completion_rule: "manual_status",
      manual_status: "in_progress",
    });
    const draft = strategicGoalDraftFromData(current);
    draft.completionRule = "threshold_count";
    draft.thresholdMode = "count";
    draft.thresholdValue = "2";

    const result = buildStrategicGoalSettingsPayload(current, draft);
    expect(result).toEqual({
      ok: true,
      payload: expect.objectContaining({
        id: current.id,
        completion_rule: "threshold_count",
        threshold_count: 2,
        threshold_percentage: null,
        manual_status: null,
      }),
    });
  });

  it("requires valid thresholds, manual state, and unresolved context", () => {
    const current = goal();
    const missingThreshold = strategicGoalDraftFromData(current);
    missingThreshold.completionRule = "threshold_count";
    missingThreshold.thresholdValue = "";
    const thresholdResult = buildStrategicGoalSettingsPayload(
      current,
      missingThreshold,
    );
    expect(thresholdResult).toMatchObject({
      ok: false,
      errors: expect.objectContaining({ threshold_count: expect.any(String) }),
    });

    const missingManual = strategicGoalDraftFromData(current);
    missingManual.completionRule = "manual_status";
    missingManual.manualStatus = "";
    expect(buildStrategicGoalSettingsPayload(current, missingManual)).toMatchObject({
      ok: false,
      errors: expect.objectContaining({ manual_status: expect.any(String) }),
    });

    const unresolved = strategicGoalDraftFromData(current);
    unresolved.configurationStatus = "needs_target";
    unresolved.unresolvedQuestion = "";
    expect(buildStrategicGoalSettingsPayload(current, unresolved)).toMatchObject({
      ok: false,
      errors: expect.objectContaining({ unresolved_question: expect.any(String) }),
    });
  });

  it("produces the exact update and lifecycle route contracts", () => {
    expect(buildStrategicGoalUpdateMutation({ id: 1, owner: "Board" })).toEqual({
      endpoint: STRATEGIC_GOALS_ENDPOINT,
      method: "PATCH",
      body: { action: "update", update: { id: 1, owner: "Board" } },
    });
    expect(buildStrategicGoalLifecycleMutation(1, "archive")).toEqual({
      endpoint: STRATEGIC_GOALS_ENDPOINT,
      method: "PATCH",
      body: { action: "archive", id: 1 },
    });
  });

  it("filters archived goals and returns unique priority options", () => {
    const goals = [
      goal(),
      goal({ id: 2, archived_at: "2026-07-09", name: "Archived goal" }),
      goal({
        id: 3,
        priority_id: 20,
        priority_slug: "preservation",
        priority_name: "Historic Preservation",
        name: "Preservation goal",
      }),
    ];
    expect(
      filterStrategicGoals(goals, {
        priorityId: 10,
        includeArchived: false,
      }).map((item) => item.id),
    ).toEqual([1]);
    expect(strategicGoalPriorityOptions(goals)).toEqual([
      { id: 20, name: "Historic Preservation" },
      { id: 10, name: "Visitor Experience" },
    ]);
  });
});
