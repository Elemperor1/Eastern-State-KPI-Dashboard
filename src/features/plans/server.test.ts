import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapInstallation } from "@/features/installation/server";
import { getDb, resetDb } from "@/lib/db";
import {
  addDraftMeasureBundle,
  activateDraft,
  archiveDraftPriority,
  cancelDraft,
  classifyDraftQuestion,
  createSuccessorDraft,
  evaluateDraftReadiness,
  getPlanManagerModel,
  listPlanLifecycleEvents,
  reviewPlanSection,
  recordDraftLineage,
  saveDraftBoardScope,
  saveReadinessOverride,
  updateDraftDetails,
  updateDraftItem,
  type PlanLifecycleConflictError,
  type StrategicPlanSummary,
} from "./server";

const ELIGIBLE_NOW = new Date("2026-01-01T17:00:00.000Z");

interface SourceStructure {
  priorityId: number;
  goalId: number;
  kpiId: number;
  configurationId: number;
  componentId: number;
  bandId: number;
  membershipId: number;
  scopeId: number;
}

/** Returns one scalar count from the disposable lifecycle database. */
function count(sql: string, ...params: unknown[]): number {
  const row = getDb().prepare(sql).get(...params) as
    | { count?: number }
    | undefined;
  return Number(row?.count ?? 0);
}

/** Creates the one durable Admin used as the lifecycle event actor. */
function createActor(): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES ('plan-admin@example.org', 'Plan Admin', 'hash', 'admin')`,
      )
      .run().lastInsertRowid,
  );
}

/** Creates an original Active plan whose successor is eligible in 2026. */
function createInstallation(): StrategicPlanSummary {
  bootstrapInstallation({
    organization: {
      slug: "example-historic-site",
      name: "Example Historic Site",
      shortName: "Example",
    },
    plan: {
      slug: "strategic-plan-2021-2025",
      name: "Strategic Plan 2021–2025",
      description: "Current approved plan.",
      startYear: 2021,
      endYear: 2025,
      sourceReference: "Board approval 2021",
    },
  });
  return getPlanManagerModel().active;
}

/** Creates a Draft with complete top-level details and an empty Board scope. */
function createBlankDraft(actorId: number, name = "Strategic Plan 2026–2030") {
  return createSuccessorDraft(
    {
      creationMethod: "blank",
      name,
      description: "Successor planning cycle.",
      endYear: 2030,
      approvalSource: "Board planning resolution",
    },
    actorId,
  );
}

/** Adds one complete, owner-confirmed structure to a blank successor Draft. */
function addReadyDraftStructure(draft: StrategicPlanSummary): void {
  const db = getDb();
  const priorityId = Number(
    db
      .prepare(
        `INSERT INTO categories (plan_id, slug, name, sort_order)
         VALUES (?, ?, 'Successor Priority', 1)`,
      )
      .run(draft.id, `successor-priority-${draft.id}`).lastInsertRowid,
  );
  const kpiId = Number(
    db
      .prepare(
        `INSERT INTO kpis (
           category_id, slug, name, unit, unit_type, reporting_frequency,
           direction, sort_order
         ) VALUES (?, ?, 'Successor Measure', 'visits', 'count', 'annual',
                   'higher', 1)`,
      )
      .run(priorityId, `successor-measure-${draft.id}`).lastInsertRowid,
  );
  const goalId = Number(
    db
      .prepare(
        `INSERT INTO strategic_goals (
           priority_id, slug, name, plan_start_year, plan_end_year,
           configuration_status, owner, sort_order
         ) VALUES (?, ?, 'Successor Goal', ?, ?, 'ready',
                   'Executive Team', 1)`,
      )
      .run(
        priorityId,
        `successor-goal-${draft.id}`,
        draft.startYear,
        draft.endYear,
      ).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO goal_kpis (
       goal_id, kpi_id, is_required, effective_from_year, effective_to_year
     ) VALUES (?, ?, 1, ?, ?)`,
  ).run(goalId, kpiId, draft.startYear, draft.endYear);
  db.prepare(
    `INSERT INTO kpi_measurement_configs (
       kpi_id, effective_from_year, effective_to_year, measurement_type, unit,
       reporting_frequency, aggregation_method, configuration_status, owner
     ) VALUES (?, ?, ?, 'count', 'visits', 'annual', 'none', 'ready',
               'Measurement Team')`,
  ).run(kpiId, draft.startYear, draft.endYear);
  db.prepare(
    `INSERT INTO kpi_targets (
       kpi_id, target_scope, reporting_year, target_year, target_value,
       target_description, configuration_status
     ) VALUES (?, 'annual', ?, ?, 100, 'First-year target', 'ready')`,
  ).run(kpiId, draft.startYear, draft.startYear);
}

/** Approves each persistent readiness section against its latest revision. */
function approveAllSections(
  draft: StrategicPlanSummary,
  actorId: number,
): StrategicPlanSummary {
  let current = draft;
  const board = getPlanManagerModel().draftBoard;
  if (board?.reviewStatus === "needs_review") {
    current = saveDraftBoardScope(
      {
        planId: current.id,
        expectedWholePlanRevision: current.wholePlanRevision,
        expectedBoardRevision: board.revision,
        intentionalEmpty: true,
        confirmationName: current.name,
        reviewedPriorityIds: [],
        priorities: [],
      },
      actorId,
    );
  }
  for (const section of [
    "plan_details",
    "plan_structure",
    "targets_board",
  ] as const) {
    const sectionReview = getPlanManagerModel().sectionReviews.find(
      (candidate) => candidate.section === section,
    );
    if (!sectionReview) throw new Error(`Missing ${section} review.`);
    current = reviewPlanSection(
      {
        planId: current.id,
        expectedWholePlanRevision: current.wholePlanRevision,
        expectedSectionUpdatedAt: sectionReview.updatedAt,
        section,
      },
      actorId,
    );
  }
  return current;
}

/** Produces a Draft that satisfies every activation requirement without overrides. */
function createReadyDraft(actorId: number): StrategicPlanSummary {
  const draft = createBlankDraft(actorId);
  addReadyDraftStructure(draft);
  const current = getPlanManagerModel().draft;
  if (!current) throw new Error("Expected a successor Draft.");
  return approveAllSections(current, actorId);
}

/** Seeds representative structure plus result, Target, and audit history. */
function seedSourceStructure(
  active: StrategicPlanSummary,
  actorId: number,
): SourceStructure {
  const db = getDb();
  const priorityId = Number(
    db
      .prepare(
        `INSERT INTO categories (plan_id, slug, name, description, sort_order)
         VALUES (?, 'visitor-experience', 'Visitor Experience',
                 'Predecessor priority', 1)`,
      )
      .run(active.id).lastInsertRowid,
  );
  const kpiId = Number(
    db
      .prepare(
        `INSERT INTO kpis (
           category_id, slug, name, unit, unit_type, reporting_frequency,
           direction, description, sort_order
         ) VALUES (?, 'annual-visitors', 'Annual visitors', 'visits', 'count',
                   'annual', 'higher', 'Predecessor measure', 1)`,
      )
      .run(priorityId).lastInsertRowid,
  );
  const goalId = Number(
    db
      .prepare(
        `INSERT INTO strategic_goals (
           priority_id, slug, name, description, plan_start_year,
           plan_end_year, configuration_status, owner, sort_order
         ) VALUES (?, 'welcome-more-visitors', 'Welcome more visitors',
                   'Predecessor goal', 2021, 2025, 'active',
                   'Visitor Services', 1)`,
      )
      .run(priorityId).lastInsertRowid,
  );
  const membershipId = Number(
    db
      .prepare(
        `INSERT INTO goal_kpis (
           goal_id, kpi_id, is_required, effective_from_year,
           effective_to_year
         ) VALUES (?, ?, 1, 2021, 2025)`,
      )
      .run(goalId, kpiId).lastInsertRowid,
  );
  const configurationId = Number(
    db
      .prepare(
        `INSERT INTO kpi_measurement_configs (
           kpi_id, effective_from_year, effective_to_year, measurement_type,
           unit, reporting_frequency, aggregation_method,
           configuration_status, owner, baseline_value
         ) VALUES (?, 2021, 2025, 'count', 'visits', 'annual', 'sum',
                   'active', 'Visitor Services', 50)`,
      )
      .run(kpiId).lastInsertRowid,
  );
  const componentId = Number(
    db
      .prepare(
        `INSERT INTO kpi_components (
           kpi_id, configuration_id, slug, label, measurement_type, unit,
           configuration_status
         ) VALUES (?, ?, 'general-admission', 'General admission', 'count',
                   'visits', 'active')`,
      )
      .run(kpiId, configurationId).lastInsertRowid,
  );
  const bandId = Number(
    db
      .prepare(
        `INSERT INTO distribution_bands (
           kpi_id, slug, label, effective_from_year, effective_to_year,
           display_order
         ) VALUES (?, 'members', 'Members', 2021, 2025, 1)`,
      )
      .run(kpiId).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO kpi_observations (
       kpi_id, configuration_id, year, period_type, period_index,
       scalar_value, notes
     ) VALUES (?, ?, 2025, 'annual', 0, 75, 'Historical result')`,
  ).run(kpiId, configurationId);
  db.prepare(
    `INSERT INTO kpi_component_entries (
       component_id, year, period_type, period_index, scalar_value, notes
     ) VALUES (?, 2025, 'annual', 0, 60, 'Historical component result')`,
  ).run(componentId);
  db.prepare(
    `INSERT INTO kpi_targets (
       kpi_id, target_scope, reporting_year, target_year, target_value,
       target_description, configuration_status
     ) VALUES (?, 'annual', 2025, 2025, 80, 'Historical Target', 'active')`,
  ).run(kpiId);
  db.prepare(
    `INSERT INTO strategic_audit_events (
       entity_type, entity_id, event_type, entity_display_name,
       new_value_json, actor_id
     ) VALUES ('kpi', ?, 'update', 'Annual visitors', '{"value":75}', ?)`,
  ).run(kpiId, actorId);
  const scopeId = Number(
    db
      .prepare(
        `INSERT INTO board_reporting_scopes (
           plan_id, revision, review_status, created_by, updated_by
         ) VALUES (?, 1, 'approved', ?, ?)`,
      )
      .run(active.id, actorId, actorId).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO board_reporting_audit_events (
       scope_id, event_type, new_value_json, actor_id
     ) VALUES (?, 'create', '{"scope":"approved"}', ?)`,
  ).run(scopeId, actorId);
  return {
    priorityId,
    goalId,
    kpiId,
    configurationId,
    componentId,
    bandId,
    membershipId,
    scopeId,
  };
}

describe("Successor Strategic Plan lifecycle server", () => {
  let directory: string;
  let databasePath: string;
  let originalDatabasePath: string | undefined;
  let originalBackupDirectory: string | undefined;
  let actorId: number;
  let active: StrategicPlanSummary;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-plans-"));
    databasePath = path.join(directory, "plans.db");
    originalDatabasePath = process.env.DATABASE_PATH;
    originalBackupDirectory = process.env.PLAN_ACTIVATION_BACKUP_DIR;
    process.env.DATABASE_PATH = databasePath;
    process.env.PLAN_ACTIVATION_BACKUP_DIR = path.join(directory, "backups");
    resetDb();
    actorId = createActor();
    active = createInstallation();
  });

  afterEach(() => {
    resetDb();
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    if (originalBackupDirectory === undefined) {
      delete process.env.PLAN_ACTIVATION_BACKUP_DIR;
    } else {
      process.env.PLAN_ACTIVATION_BACKUP_DIR = originalBackupDirectory;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("creates a blank Draft with predecessor continuity and no plan structure", () => {
    const draft = createBlankDraft(actorId);

    expect(draft).toMatchObject({
      organizationId: active.organizationId,
      predecessorPlanId: active.id,
      lifecycleState: "draft",
      creationMethod: "blank",
      startYear: 2026,
      endYear: 2030,
      wholePlanRevision: 1,
      cloneSourceRevision: active.wholePlanRevision,
    });
    expect(count("SELECT COUNT(*) AS count FROM categories WHERE plan_id = ?", draft.id))
      .toBe(0);
    expect(
      getDb()
        .prepare(
          `SELECT review_status FROM board_reporting_scopes WHERE plan_id = ?`,
        )
        .get(draft.id),
    ).toEqual({ review_status: "needs_review" });
    expect(listPlanLifecycleEvents({ planId: draft.id })).toEqual([
      expect.objectContaining({
        action: "create_blank",
        beforeState: null,
        afterState: "draft",
        predecessorPlanId: active.id,
        actorEmail: "plan-admin@example.org",
      }),
    ]);
  });

  it("enforces the one-Draft limit without changing the existing Draft", () => {
    const first = createBlankDraft(actorId);

    expect(() =>
      createBlankDraft(actorId, "Competing Strategic Plan"),
    ).toThrow(
      expect.objectContaining<Partial<PlanLifecycleConflictError>>({
        code: "draft_exists",
      }),
    );
    expect(getPlanManagerModel().draft).toMatchObject({
      id: first.id,
      name: first.name,
      wholePlanRevision: first.wholePlanRevision,
    });
    expect(
      count(
        `SELECT COUNT(*) AS count FROM strategic_plan_lifecycle_events
         WHERE action IN ('create_blank','create_structural_clone')`,
      ),
    ).toBe(1);
  });

  it("rejects direct Draft creation while successor planning is disabled", () => {
    const previous = process.env.SUCCESSOR_PLANS_ENABLED;
    process.env.SUCCESSOR_PLANS_ENABLED = "false";
    try {
      expect(() =>
        createBlankDraft(actorId, "Disabled successor"),
      ).toThrow(
        expect.objectContaining<Partial<PlanLifecycleConflictError>>({
          code: "successor_planning_disabled",
        }),
      );
      expect(getPlanManagerModel().draft).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.SUCCESSOR_PLANS_ENABLED;
      else process.env.SUCCESSOR_PLANS_ENABLED = previous;
    }
  });

  it("clones current structure into new identities and lineage without results, Targets, or audit history", () => {
    const source = seedSourceStructure(active, actorId);
    const strategicAuditCount = count(
      "SELECT COUNT(*) AS count FROM strategic_audit_events",
    );
    const boardAuditCount = count(
      "SELECT COUNT(*) AS count FROM board_reporting_audit_events",
    );
    const installationAuditCount = count(
      "SELECT COUNT(*) AS count FROM installation_audit_events",
    );

    const draft = createSuccessorDraft(
      {
        creationMethod: "structural_clone",
        name: "Cloned Strategic Plan 2026–2030",
        description: "Independent successor structure.",
        endYear: 2030,
        approvalSource: "Board planning resolution",
      },
      actorId,
    );
    const clonedPriority = getDb()
      .prepare("SELECT id, name FROM categories WHERE plan_id = ?")
      .get(draft.id) as { id: number; name: string };
    const clonedKpi = getDb()
      .prepare(
        `SELECT kpi.id, kpi.name
         FROM kpis kpi
         JOIN categories priority ON priority.id = kpi.category_id
         WHERE priority.plan_id = ?`,
      )
      .get(draft.id) as { id: number; name: string };
    const lineage = getDb()
      .prepare(
        `SELECT item_kind, predecessor_item_id, successor_item_id
         FROM successor_lineage WHERE successor_plan_id = ?
         ORDER BY item_kind`,
      )
      .all(draft.id);

    expect(clonedPriority).toMatchObject({
      name: "Visitor Experience",
    });
    expect(clonedPriority.id).not.toBe(source.priorityId);
    expect(clonedKpi).toMatchObject({ name: "Annual visitors" });
    expect(clonedKpi.id).not.toBe(source.kpiId);
    expect(lineage).toEqual(
      expect.arrayContaining([
        {
          item_kind: "priority",
          predecessor_item_id: source.priorityId,
          successor_item_id: clonedPriority.id,
        },
        {
          item_kind: "kpi",
          predecessor_item_id: source.kpiId,
          successor_item_id: clonedKpi.id,
        },
        expect.objectContaining({
          item_kind: "goal",
          predecessor_item_id: source.goalId,
        }),
        expect.objectContaining({
          item_kind: "measurement_config",
          predecessor_item_id: source.configurationId,
        }),
        expect.objectContaining({
          item_kind: "component",
          predecessor_item_id: source.componentId,
        }),
        expect.objectContaining({
          item_kind: "distribution_band",
          predecessor_item_id: source.bandId,
        }),
        expect.objectContaining({
          item_kind: "membership",
          predecessor_item_id: source.membershipId,
        }),
        expect.objectContaining({
          item_kind: "board_scope",
          predecessor_item_id: source.scopeId,
        }),
      ]),
    );
    expect(
      count(
        `SELECT COUNT(*) AS count
         FROM kpi_observations observation
         JOIN kpis kpi ON kpi.id = observation.kpi_id
         JOIN categories priority ON priority.id = kpi.category_id
         WHERE priority.plan_id = ?`,
        draft.id,
      ),
    ).toBe(0);
    expect(
      count(
        `SELECT COUNT(*) AS count
         FROM kpi_component_entries entry
         JOIN kpi_components component ON component.id = entry.component_id
         JOIN kpis kpi ON kpi.id = component.kpi_id
         JOIN categories priority ON priority.id = kpi.category_id
         WHERE priority.plan_id = ?`,
        draft.id,
      ),
    ).toBe(0);
    expect(
      count(
        `SELECT COUNT(*) AS count
         FROM kpi_targets target
         LEFT JOIN kpis kpi ON kpi.id = target.kpi_id
         LEFT JOIN kpi_components component ON component.id = target.component_id
         JOIN categories priority
           ON priority.id = COALESCE(kpi.category_id, (
             SELECT component_kpi.category_id
             FROM kpis component_kpi WHERE component_kpi.id = component.kpi_id
           ))
         WHERE priority.plan_id = ?`,
        draft.id,
      ),
    ).toBe(0);
    expect(count("SELECT COUNT(*) AS count FROM strategic_audit_events"))
      .toBe(strategicAuditCount);
    expect(count("SELECT COUNT(*) AS count FROM board_reporting_audit_events"))
      .toBe(boardAuditCount);
    expect(count("SELECT COUNT(*) AS count FROM installation_audit_events"))
      .toBe(installationAuditCount);
    const event = listPlanLifecycleEvents({ planId: draft.id })[0];
    expect(event.result).toMatchObject({
      historical_reporting_evidence_copied: false,
      targets_copied_automatically: false,
      priorities: 1,
      goals: 1,
      measures: 1,
      measurementDefinitions: 1,
      components: 1,
      reportingGroups: 1,
      memberships: 1,
    });
  });

  it("keeps cloned effective ranges aligned when the Draft final year changes", () => {
    seedSourceStructure(active, actorId);
    const draft = createSuccessorDraft(
      {
        creationMethod: "structural_clone",
        name: "Range-aligned successor",
        description: "Verify every copied reporting range.",
        endYear: 2030,
        approvalSource: "Board planning resolution",
      },
      actorId,
    );

    const updated = updateDraftDetails(
      {
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        expectedPlanRevision: draft.revision,
        name: draft.name,
        description: draft.description,
        endYear: 2032,
        approvalSource: draft.approvalSource,
      },
      actorId,
    );

    expect(updated.endYear).toBe(2032);
    expect(
      getDb()
        .prepare(
          `SELECT DISTINCT plan_end_year
           FROM strategic_goals goal
           JOIN categories priority ON priority.id = goal.priority_id
           WHERE priority.plan_id = ?`,
        )
        .all(draft.id),
    ).toEqual([{ plan_end_year: 2032 }]);
    for (const table of [
      "kpi_measurement_configs",
      "goal_kpis",
      "distribution_bands",
    ]) {
      const ownershipJoin =
        table === "goal_kpis"
          ? `JOIN strategic_goals goal ON goal.id = owned.goal_id
             JOIN categories priority ON priority.id = goal.priority_id`
          : `JOIN kpis kpi ON kpi.id = owned.kpi_id
             JOIN categories priority ON priority.id = kpi.category_id`;
      expect(
        getDb()
          .prepare(
            `SELECT DISTINCT owned.effective_to_year
             FROM ${table} owned
             ${ownershipJoin}
             WHERE priority.plan_id = ?`,
          )
          .all(draft.id),
      ).toEqual([{ effective_to_year: 2032 }]);
    }
    expect(
      getDb()
        .prepare(
          `SELECT section, review_status FROM plan_section_reviews
           WHERE plan_id = ? ORDER BY section`,
        )
        .all(draft.id),
    ).toEqual([
      { section: "plan_details", review_status: "needs_review" },
      { section: "plan_structure", review_status: "needs_review" },
      { section: "targets_board", review_status: "needs_review" },
    ]);
  });

  it("promotes reviewed cloned definitions from Draft to Ready", () => {
    seedSourceStructure(active, actorId);
    const draft = createSuccessorDraft(
      {
        creationMethod: "structural_clone",
        name: "Reviewed successor",
        description: "Promote copied definitions after review.",
        endYear: 2030,
        approvalSource: "Board planning resolution",
      },
      actorId,
    );
    const section = getPlanManagerModel().sectionReviews.find(
      (review) => review.section === "plan_structure",
    );
    if (!section) throw new Error("Missing structure review.");

    reviewPlanSection(
      {
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        expectedSectionUpdatedAt: section.updatedAt,
        section: "plan_structure",
      },
      actorId,
    );

    for (const table of [
      "strategic_goals",
      "kpi_measurement_configs",
      "kpi_components",
    ]) {
      expect(
        count(
          `SELECT COUNT(*) AS count FROM ${table}
           WHERE configuration_status = 'draft'`,
        ),
      ).toBe(0);
    }
    expect(
      count(
        `SELECT COUNT(*) AS count
         FROM kpi_measurement_configs configuration
         JOIN kpis kpi ON kpi.id = configuration.kpi_id
         JOIN categories priority ON priority.id = kpi.category_id
         WHERE priority.plan_id = ?
           AND configuration.configuration_status = 'ready'`,
        draft.id,
      ),
    ).toBe(1);
    expect(
      evaluateDraftReadiness(draft.id).requirements,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "first_year_definition_coverage" }),
      ]),
    );
  });

  it("does not invalidate successor structure review when Active-plan results change", () => {
    const source = seedSourceStructure(active, actorId);
    const draft = createSuccessorDraft(
      {
        creationMethod: "structural_clone",
        name: "Result-stable successor",
        description: "Current reporting must not invalidate copied structure.",
        endYear: 2030,
        approvalSource: "Board planning resolution",
      },
      actorId,
    );
    const section = getPlanManagerModel().sectionReviews.find(
      (review) => review.section === "plan_structure",
    );
    if (!section) throw new Error("Missing structure review.");
    reviewPlanSection(
      {
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        expectedSectionUpdatedAt: section.updatedAt,
        section: "plan_structure",
      },
      actorId,
    );
    const before = getDb()
      .prepare(
        `SELECT whole_plan_revision, source_changed_at
         FROM strategic_plans WHERE id = ?`,
      )
      .get(draft.id);
    const activeBefore = getDb()
      .prepare(
        "SELECT whole_plan_revision FROM strategic_plans WHERE id = ?",
      )
      .get(active.id);

    getDb()
      .prepare(
        `INSERT INTO kpi_observations (
           kpi_id, configuration_id, year, period_type, period_index,
           scalar_value, notes
         ) VALUES (?, ?, 2024, 'annual', 0, 70, 'Ordinary result')`,
      )
      .run(source.kpiId, source.configurationId);

    expect(
      getDb()
        .prepare(
          `SELECT whole_plan_revision, source_changed_at
           FROM strategic_plans WHERE id = ?`,
        )
        .get(draft.id),
    ).toEqual(before);
    expect(
      getDb()
        .prepare(
          "SELECT whole_plan_revision FROM strategic_plans WHERE id = ?",
        )
        .get(active.id),
    ).toEqual(activeBefore);
    expect(
      getDb()
        .prepare(
          `SELECT review_status FROM plan_section_reviews
           WHERE plan_id = ? AND section = 'plan_structure'`,
        )
        .get(draft.id),
    ).toEqual({ review_status: "approved" });
  });

  it("requires complete plain-language percentage semantics before marking a bundle Ready", () => {
    const draft = createBlankDraft(actorId);
    const input = {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      priorityName: "Membership",
      goalName: "Keep members",
      goalOwner: "Development",
      measureName: "Member renewal rate",
      measureOwner: "Development",
      unit: "percent",
      unitType: "percent" as const,
      numeratorLabel: null,
      denominatorLabel: null,
      reportingFrequency: "annual" as const,
      direction: "higher" as const,
    };

    expect(() => addDraftMeasureBundle(input, actorId)).toThrow();
    addDraftMeasureBundle(
      {
        ...input,
        numeratorLabel: "Members who renewed",
        denominatorLabel: "Members eligible to renew",
      },
      actorId,
    );

    expect(
      getDb()
        .prepare(
          `SELECT measurement_type, numerator_label, denominator_label,
                  aggregation_method, configuration_status
           FROM kpi_measurement_configs configuration
           JOIN kpis kpi ON kpi.id = configuration.kpi_id
           JOIN categories priority ON priority.id = kpi.category_id
           WHERE priority.plan_id = ?`,
        )
        .get(draft.id),
    ).toEqual({
      measurement_type: "percentage",
      numerator_label: "Members who renewed",
      denominator_label: "Members eligible to renew",
      aggregation_method: "none",
      configuration_status: "ready",
    });
  });

  it("retains a cancelled Draft as read-only and allows a replacement Draft", () => {
    const draft = createBlankDraft(actorId);
    const cancelled = cancelDraft(
      {
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        confirmationName: draft.name,
      },
      actorId,
    );

    expect(cancelled).toMatchObject({
      id: draft.id,
      lifecycleState: "cancelled",
    });
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(getPlanManagerModel()).toMatchObject({
      draft: null,
      cancelled: [expect.objectContaining({ id: draft.id })],
    });
    expect(() =>
      updateDraftDetails(
        {
          planId: draft.id,
          expectedWholePlanRevision: draft.wholePlanRevision,
          expectedPlanRevision: draft.revision,
          name: "Changed cancelled plan",
          description: "Should not save.",
          endYear: 2030,
          approvalSource: "None",
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining<Partial<PlanLifecycleConflictError>>({
        code: "invalid_state",
      }),
    );
    expect(() =>
      getDb()
        .prepare(
          `INSERT INTO categories (plan_id, slug, name)
           VALUES (?, 'cancelled-write', 'Cancelled write')`,
        )
        .run(draft.id),
    ).toThrow(/PLAN_IS_READ_ONLY/);

    const replacement = createBlankDraft(actorId, "Replacement Plan 2026–2030");
    expect(replacement).toMatchObject({
      predecessorPlanId: active.id,
      lifecycleState: "draft",
    });
    expect(replacement.id).not.toBe(draft.id);
    expect(getPlanManagerModel().cancelled).toEqual([
      expect.objectContaining({ id: draft.id }),
    ]);
  });

  it("rejects updates that move plan-owned rows into a read-only or non-Active destination", () => {
    const source = seedSourceStructure(active, actorId);
    const draft = createBlankDraft(actorId);
    addReadyDraftStructure(draft);
    const draftKpi = getDb()
      .prepare(
        `SELECT kpi.id
         FROM kpis kpi
         JOIN categories priority ON priority.id = kpi.category_id
         WHERE priority.plan_id = ?`,
      )
      .get(draft.id) as { id: number };

    expect(() =>
      getDb()
        .prepare("UPDATE kpi_observations SET kpi_id = ? WHERE kpi_id = ?")
        .run(draftKpi.id, source.kpiId),
    ).toThrow(/PLAN_IS_READ_ONLY/);

    const cancelled = cancelDraft(
      {
        planId: draft.id,
        expectedWholePlanRevision: getPlanManagerModel().draft!.wholePlanRevision,
        confirmationName: draft.name,
      },
      actorId,
    );
    expect(() =>
      getDb()
        .prepare("UPDATE categories SET plan_id = ? WHERE id = ?")
        .run(cancelled.id, source.priorityId),
    ).toThrow(/PLAN_IS_READ_ONLY/);
    expect(
      getDb()
        .prepare("SELECT plan_id FROM categories WHERE id = ?")
        .get(source.priorityId),
    ).toEqual({ plan_id: active.id });
  });

  it("advances both plan revisions when a writable row is reparented", () => {
    const source = seedSourceStructure(active, actorId);
    const draft = createBlankDraft(actorId);
    const before = getDb()
      .prepare(
        `SELECT id, whole_plan_revision
         FROM strategic_plans WHERE id IN (?, ?)`,
      )
      .all(active.id, draft.id) as Array<{
      id: number;
      whole_plan_revision: number;
    }>;
    const beforeById = new Map(
      before.map((plan) => [Number(plan.id), Number(plan.whole_plan_revision)]),
    );

    getDb()
      .prepare("UPDATE categories SET plan_id = ? WHERE id = ?")
      .run(draft.id, source.priorityId);

    const after = getDb()
      .prepare(
        `SELECT id, whole_plan_revision
         FROM strategic_plans WHERE id IN (?, ?)`,
      )
      .all(active.id, draft.id) as Array<{
      id: number;
      whole_plan_revision: number;
    }>;
    const afterById = new Map(
      after.map((plan) => [Number(plan.id), Number(plan.whole_plan_revision)]),
    );
    expect(afterById.get(active.id)).toBeGreaterThan(beforeById.get(active.id)!);
    expect(afterById.get(draft.id)).toBeGreaterThan(beforeById.get(draft.id)!);
  });

  it("edits and removes copied Draft structure without deleting lineage", () => {
    const source = seedSourceStructure(active, actorId);
    let draft = createSuccessorDraft(
      {
        creationMethod: "structural_clone",
        name: "Editable successor",
        description: "Successor planning cycle.",
        endYear: 2030,
        approvalSource: "Board planning resolution",
      },
      actorId,
    );
    const copiedPriority = getDb().prepare(
      `SELECT id, updated_at
       FROM categories WHERE plan_id = ? AND archived_at IS NULL`,
    ).get(draft.id) as { id: number; updated_at: string };
    draft = updateDraftItem({
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      expectedRecordUpdatedAt: copiedPriority.updated_at,
      itemKind: "priority",
      itemId: copiedPriority.id,
      name: "Successor Visitor Experience",
      owner: null,
    }, actorId);
    expect(
      getDb().prepare("SELECT name FROM categories WHERE id = ?").get(copiedPriority.id),
    ).toEqual({ name: "Successor Visitor Experience" });

    archiveDraftPriority({
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      expectedRecordUpdatedAt: String(
        (
          getDb().prepare(
            "SELECT updated_at FROM categories WHERE id = ?",
          ).get(copiedPriority.id) as { updated_at: string }
        ).updated_at,
      ),
      priorityId: copiedPriority.id,
    }, actorId);
    expect(
      getDb().prepare(
        "SELECT name, archived_at FROM categories WHERE id = ?",
      ).get(copiedPriority.id),
    ).toEqual({
      name: "Successor Visitor Experience",
      archived_at: expect.any(String),
    });
    expect(
      count(
        `SELECT COUNT(*) AS count FROM successor_lineage
         WHERE successor_plan_id = ? AND item_kind = 'priority'
           AND predecessor_item_id = ? AND successor_item_id = ?`,
        draft.id,
        source.priorityId,
        copiedPriority.id,
      ),
    ).toBe(1);
    expect(
      getDb().prepare(
        `SELECT configuration_status, archived_at
         FROM kpi_components
         WHERE id = (
           SELECT successor_item_id
           FROM successor_lineage
           WHERE successor_plan_id = ? AND item_kind = 'component'
             AND predecessor_item_id = ?
         )`,
      ).get(draft.id, source.componentId),
    ).toEqual({
      configuration_status: "archived",
      archived_at: expect.any(String),
    });
    expect(
      getDb().prepare(
        `SELECT archived_at
         FROM distribution_bands
         WHERE id = (
           SELECT successor_item_id
           FROM successor_lineage
           WHERE successor_plan_id = ? AND item_kind = 'distribution_band'
             AND predecessor_item_id = ?
         )`,
      ).get(draft.id, source.bandId),
    ).toEqual({ archived_at: expect.any(String) });
    expect(
      getDb().prepare(
        "SELECT review_status FROM board_reporting_scopes WHERE plan_id = ?",
      ).get(draft.id),
    ).toEqual({ review_status: "needs_review" });
  });

  it("prepares multiple successor-only Board details without deleting copied identities", () => {
    let draft = createBlankDraft(actorId);
    addReadyDraftStructure(draft);
    let manager = getPlanManagerModel();
    draft = manager.draft!;
    const priority = manager.draftStructure[0];
    const measure = priority.goals[0].measures[0];
    const initialBoardRevision = manager.draftBoard!.revision;

    draft = saveDraftBoardScope(
      {
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        expectedBoardRevision: initialBoardRevision,
        intentionalEmpty: false,
        confirmationName: null,
        reviewedPriorityIds: [priority.id],
        priorities: [{
          id: null,
          priorityId: priority.id,
          displayTitle: "Board Successor Priority",
          statements: [{
            id: null,
            text: "Track successor performance.",
            kpiIds: [measure.id],
          }],
        }],
      },
      actorId,
    );
    manager = getPlanManagerModel();
    expect(manager.draftBoard).toMatchObject({
      revision: initialBoardRevision + 1,
      reviewStatus: "approved",
      priorities: [{
        priorityId: priority.id,
        displayTitle: "Board Successor Priority",
        statements: [{
          text: "Track successor performance.",
          measures: [{ id: measure.id, name: measure.name }],
        }],
      }],
    });
    expect(() =>
      saveDraftBoardScope(
        {
          planId: draft.id,
          expectedWholePlanRevision: draft.wholePlanRevision,
          expectedBoardRevision: initialBoardRevision,
          intentionalEmpty: true,
          confirmationName: draft.name,
          reviewedPriorityIds: [],
          priorities: [],
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining<Partial<PlanLifecycleConflictError>>({
        code: "stale_revision",
      }),
    );

    const boardPriorityId = manager.draftBoard!.priorities[0].id;
    draft = saveDraftBoardScope(
      {
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        expectedBoardRevision: manager.draftBoard!.revision,
        intentionalEmpty: true,
        confirmationName: draft.name,
        reviewedPriorityIds: [],
        priorities: [],
      },
      actorId,
    );
    expect(getPlanManagerModel().draftBoard).toMatchObject({
      reviewStatus: "intentional_empty",
      priorities: [],
    });
    expect(
      getDb().prepare(
        "SELECT archived_at FROM board_reporting_priorities WHERE id = ?",
      ).get(boardPriorityId),
    ).toEqual({ archived_at: expect.any(String) });
  });

  it("classifies open questions as documented follow-up or answers them now", () => {
    let draft = createBlankDraft(actorId);
    addReadyDraftStructure(draft);
    const goal = getDb().prepare(
      `SELECT goal.id
       FROM strategic_goals goal
       JOIN categories priority ON priority.id = goal.priority_id
       WHERE priority.plan_id = ?`,
    ).get(draft.id) as { id: number };
    getDb().prepare(
      `UPDATE strategic_goals
       SET unresolved_question = 'Who owns final approval?',
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(goal.id);
    let manager = getPlanManagerModel();
    draft = manager.draft!;
    const question = manager.draftQuestions[0];

    draft = classifyDraftQuestion(
      {
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        expectedRecordUpdatedAt: question.updatedAt,
        itemKind: question.itemKind,
        itemId: question.itemId,
        decision: "follow_up",
        explanation: "Executive Team will confirm ownership in February.",
      },
      actorId,
    );
    manager = getPlanManagerModel();
    expect(manager.draftQuestions[0]).toMatchObject({
      classification: "follow_up",
      explanation: "Executive Team will confirm ownership in February.",
    });
    expect(
      evaluateDraftReadiness(draft.id, { now: ELIGIBLE_NOW }).warnings.map(
        (item) => item.key,
      ),
    ).toContain("approved_follow_up_questions");

    draft = classifyDraftQuestion(
      {
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        expectedRecordUpdatedAt: manager.draftQuestions[0].updatedAt,
        itemKind: "goal",
        itemId: goal.id,
        decision: "resolve_now",
        explanation: "The Executive Team owns final approval.",
      },
      actorId,
    );
    expect(getPlanManagerModel().draftQuestions).toEqual([]);
    expect(
      getDb().prepare(
        "SELECT unresolved_question, resolution_notes FROM strategic_goals WHERE id = ?",
      ).get(goal.id),
    ).toEqual({
      unresolved_question: null,
      resolution_notes: "The Executive Team owns final approval.",
    });
  });

  it("records valid merged lineage and refuses cross-kind or mutable provenance", () => {
    const source = seedSourceStructure(active, actorId);
    const secondPriorityId = Number(
      getDb().prepare(
        `INSERT INTO categories (plan_id, slug, name)
         VALUES (?, 'community', 'Community')`,
      ).run(active.id).lastInsertRowid,
    );
    let draft = createBlankDraft(actorId);
    addReadyDraftStructure(draft);
    let manager = getPlanManagerModel();
    draft = manager.draft!;
    const successorPriorityId = manager.draftStructure[0].id;

    draft = recordDraftLineage(
      {
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        itemKind: "priority",
        successorItemId: successorPriorityId,
        relationshipType: "merged_from",
        predecessorItemIds: [source.priorityId, secondPriorityId],
      },
      actorId,
    );
    manager = getPlanManagerModel();
    expect(
      manager.lineage.filter(
        (lineage) =>
          lineage.itemKind === "priority" &&
          lineage.successorItemId === successorPriorityId,
      ),
    ).toEqual([
      expect.objectContaining({
        relationshipType: "merged_from",
        predecessorName: "Visitor Experience",
      }),
      expect.objectContaining({
        relationshipType: "merged_from",
        predecessorName: "Community",
      }),
    ]);
    expect(() =>
      getDb().prepare(
        `UPDATE successor_lineage SET predecessor_name_snapshot = 'Changed'
         WHERE successor_plan_id = ?`,
      ).run(draft.id),
    ).toThrow(/SUCCESSOR_LINEAGE_IMMUTABLE/);
    expect(() =>
      recordDraftLineage(
        {
          planId: draft.id,
          expectedWholePlanRevision: draft.wholePlanRevision,
          itemKind: "priority",
          successorItemId: successorPriorityId,
          relationshipType: "copied_from",
          predecessorItemIds: [source.goalId],
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining<Partial<PlanLifecycleConflictError>>({
        code: "invalid_state",
      }),
    );
  });

  it("recomputes readiness, preserves reasoned overrides, and rejects stale revisions", () => {
    let draft = createBlankDraft(actorId);
    const tooEarly = evaluateDraftReadiness(draft.id, {
      now: new Date("2025-12-31T17:00:00.000Z"),
    });
    expect(tooEarly).toMatchObject({
      outcome: "cannot_activate",
      canActivate: false,
    });
    expect(tooEarly.hardRules.map((item) => item.key)).toContain(
      "activation_eligibility_date",
    );

    draft = approveAllSections(draft, actorId);
    const needsDecision = evaluateDraftReadiness(draft.id, {
      now: ELIGIBLE_NOW,
    });
    expect(needsDecision).toMatchObject({
      outcome: "needs_decisions",
      canActivate: false,
    });
    expect(needsDecision.requirements.map((item) => item.key)).toEqual([
      "minimum_plan_structure",
    ]);
    const staleRevision = draft.wholePlanRevision;
    draft = saveReadinessOverride(
      {
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        requirementKey: "minimum_plan_structure",
        reason: "Leadership approved a staged structure after activation.",
      },
      actorId,
    );
    const overridden = evaluateDraftReadiness(draft.id, {
      now: ELIGIBLE_NOW,
    });
    expect(overridden).toMatchObject({
      outcome: "ready_with_warnings",
      canActivate: true,
      requirements: [
        expect.objectContaining({
          key: "minimum_plan_structure",
          overridden: true,
          overrideReason:
            "Leadership approved a staged structure after activation.",
        }),
      ],
    });
    expect(() =>
      reviewPlanSection(
        {
          planId: draft.id,
          expectedWholePlanRevision: staleRevision,
          expectedSectionUpdatedAt:
            getPlanManagerModel().sectionReviews.find(
              (candidate) => candidate.section === "plan_details",
            )?.updatedAt ?? "",
          section: "plan_details",
        },
        actorId,
      ),
    ).toThrow(
      expect.objectContaining<Partial<PlanLifecycleConflictError>>({
        code: "stale_revision",
      }),
    );

    const readyDraft = cancelDraft(
      {
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        confirmationName: draft.name,
      },
      actorId,
    );
    expect(readyDraft.lifecycleState).toBe("cancelled");
    const complete = createReadyDraft(actorId);
    expect(
      evaluateDraftReadiness(complete.id, { now: ELIGIBLE_NOW }),
    ).toMatchObject({
      outcome: "ready",
      hardRules: [],
      requirements: [],
      warnings: [],
      canActivate: true,
    });
  });

  it("creates and records a verified backup, activates atomically, and returns an idempotent retry", async () => {
    const draft = createReadyDraft(actorId);
    const activationId = crypto.randomUUID();

    const activated = await activateDraft(
      {
        activationId,
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        confirmationName: draft.name,
        acknowledgeWarnings: false,
      },
      actorId,
    );
    expect(activated).toMatchObject({
      activationId,
      predecessorPlanId: active.id,
      successorPlanId: draft.id,
      status: "verified",
      idempotent: false,
    });
    const operation = getDb()
      .prepare(
        `SELECT phase, backup_path, backup_sha256, backup_size,
                committed_write_counter
         FROM plan_activation_operations WHERE activation_id = ?`,
      )
      .get(activationId) as Record<string, unknown>;
    expect(operation).toMatchObject({
      phase: "verified",
      backup_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(Number(operation.backup_size)).toBeGreaterThan(0);
    expect(Number(operation.committed_write_counter)).toBeGreaterThan(0);
    expect(fs.existsSync(String(operation.backup_path))).toBe(true);
    expect(getPlanManagerModel()).toMatchObject({
      active: { id: draft.id, lifecycleState: "active" },
      draft: null,
      archived: [expect.objectContaining({ id: active.id })],
    });
    expect(
      listPlanLifecycleEvents({ action: "archive" }),
    ).toHaveLength(1);
    expect(
      listPlanLifecycleEvents({ action: "activate" }),
    ).toHaveLength(1);

    const retried = await activateDraft(
      {
        activationId,
        planId: draft.id,
        expectedWholePlanRevision: draft.wholePlanRevision,
        confirmationName: draft.name,
        acknowledgeWarnings: false,
      },
      actorId,
    );
    expect(retried).toMatchObject({
      activationId,
      status: "verified",
      idempotent: true,
    });
    expect(
      count(
        `SELECT COUNT(*) AS count FROM strategic_plan_lifecycle_events
         WHERE activation_id = ?`,
        activationId,
      ),
    ).toBe(2);
    expect(
      fs
        .readdirSync(process.env.PLAN_ACTIVATION_BACKUP_DIR ?? "")
        .filter((fileName) => fileName.endsWith(".sqlite")),
    ).toHaveLength(1);
  });

  it("rolls activation back atomically after a verified backup when Admin authority changes", async () => {
    const draft = createReadyDraft(actorId);
    const activationId = crypto.randomUUID();
    getDb()
      .prepare("UPDATE users SET disabled = 1 WHERE id = ?")
      .run(actorId);

    await expect(
      activateDraft(
        {
          activationId,
          planId: draft.id,
          expectedWholePlanRevision: draft.wholePlanRevision,
          confirmationName: draft.name,
          acknowledgeWarnings: false,
        },
        actorId,
      ),
    ).rejects.toMatchObject({
      name: "PlanLifecycleConflictError",
      code: "invalid_state",
    });
    expect(getPlanManagerModel()).toMatchObject({
      active: { id: active.id, lifecycleState: "active" },
      draft: { id: draft.id, lifecycleState: "draft" },
      archived: [],
    });
    expect(
      getDb()
        .prepare(
          `SELECT phase, failure_code FROM plan_activation_operations
           WHERE activation_id = ?`,
        )
        .get(activationId),
    ).toEqual({
      phase: "failed_precommit",
      failure_code: "activation_validation_failed",
    });
    expect(
      getDb()
        .prepare(
          `SELECT key, value FROM meta
           WHERE key IN (
             'plan_activation_write_pause',
             'plan_activation_internal_write',
             'active_plan_integrity_blocked'
           ) ORDER BY key`,
        )
        .all(),
    ).toEqual([
      { key: "active_plan_integrity_blocked", value: "0" },
      { key: "plan_activation_internal_write", value: "0" },
      { key: "plan_activation_write_pause", value: "0" },
    ]);
    expect(
      count(
        `SELECT COUNT(*) AS count FROM strategic_plan_lifecycle_events
         WHERE activation_id = ?`,
        activationId,
      ),
    ).toBe(0);
    expect(
      fs
        .readdirSync(process.env.PLAN_ACTIVATION_BACKUP_DIR ?? "")
        .filter((fileName) => fileName.endsWith(".sqlite")),
    ).toHaveLength(1);
  });

  it("reconciles an interrupted pre-commit activation, reopens saving, and releases the retry identity", async () => {
    const draft = createBlankDraft(actorId);
    const activationId = crypto.randomUUID();
    getDb().prepare(
      `INSERT INTO plan_activation_operations (
         activation_id, predecessor_plan_id, successor_plan_id,
         requested_revision, phase, requested_by
       ) VALUES (?, ?, ?, ?, 'pausing', ?)`,
    ).run(
      activationId,
      active.id,
      draft.id,
      draft.wholePlanRevision,
      actorId,
    );
    getDb().prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('plan_activation_write_pause', '1')",
    ).run();

    resetDb();
    const reconciled = getDb();

    expect(
      reconciled.prepare(
        `SELECT phase, failure_code
         FROM plan_activation_operations WHERE activation_id = ?`,
      ).get(activationId),
    ).toEqual({
      phase: "failed_precommit",
      failure_code: "restart_before_commit",
    });
    expect(
      reconciled.prepare(
        "SELECT value FROM meta WHERE key = 'plan_activation_write_pause'",
      ).get(),
    ).toEqual({ value: "0" });
    expect(
      reconciled.prepare(
        `SELECT action, integrity_result
         FROM activation_recovery_audit_events WHERE activation_id = ?`,
      ).get(activationId),
    ).toEqual({
      action: "reopen_service",
      integrity_result: "verified_precommit_unchanged",
    });
    await expect(
      activateDraft(
        {
          activationId,
          planId: draft.id,
          expectedWholePlanRevision: draft.wholePlanRevision,
          confirmationName: draft.name,
          acknowledgeWarnings: false,
        },
        actorId,
      ),
    ).rejects.toMatchObject({
      name: "PlanLifecycleConflictError",
      code: "activation_failed_precommit",
    });
  });

  it("keeps a verification-failed committed activation paused and fails closed on retry", async () => {
    const draft = createBlankDraft(actorId);
    const activationId = crypto.randomUUID();
    const committedAt = new Date().toISOString();
    getDb().prepare(
      `INSERT INTO plan_activation_operations (
         activation_id, predecessor_plan_id, successor_plan_id,
         requested_revision, phase, requested_by, committed_at
       ) VALUES (?, ?, ?, ?, 'verification_failed', ?, ?)`,
    ).run(
      activationId,
      active.id,
      draft.id,
      draft.wholePlanRevision,
      actorId,
      committedAt,
    );
    getDb().prepare(
      `UPDATE strategic_plans
       SET status = 'archived', lifecycle_state = 'archived',
           archived_at = ?
       WHERE id = ?`,
    ).run(committedAt, active.id);
    getDb().prepare(
      `UPDATE strategic_plans
       SET status = 'active', lifecycle_state = 'active',
           activation_id = ?, activated_at = ?
       WHERE id = ?`,
    ).run(activationId, committedAt, draft.id);
    for (const [planId, action, beforeState, afterState] of [
      [active.id, "archive", "active", "archived"],
      [draft.id, "activate", "draft", "active"],
    ] as const) {
      getDb().prepare(
        `INSERT INTO strategic_plan_lifecycle_events (
           event_id, plan_id, predecessor_plan_id, action, before_state,
           after_state, result_json, actor_id, activation_id
         ) VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
      ).run(
        crypto.randomUUID(),
        planId,
        active.id,
        action,
        beforeState,
        afterState,
        actorId,
        activationId,
      );
    }
    getDb().prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('plan_activation_write_pause', '1')",
    ).run();
    getDb().prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('active_plan_integrity_blocked', '1')",
    ).run();

    resetDb();
    const reconciled = getDb();

    expect(
      reconciled.prepare(
        `SELECT phase, failure_code
         FROM plan_activation_operations WHERE activation_id = ?`,
      ).get(activationId),
    ).toEqual({
      phase: "verification_failed",
      failure_code: null,
    });
    expect(
      reconciled.prepare(
        `SELECT key, value FROM meta
         WHERE key IN (
           'plan_activation_write_pause',
           'active_plan_integrity_blocked'
         ) ORDER BY key`,
      ).all(),
    ).toEqual([
      { key: "active_plan_integrity_blocked", value: "1" },
      { key: "plan_activation_write_pause", value: "1" },
    ]);
    expect(
      count(
        `SELECT COUNT(*) AS count FROM strategic_plan_lifecycle_events
         WHERE activation_id = ? AND action = 'activation_recovered'`,
        activationId,
      ),
    ).toBe(0);
    await expect(
      activateDraft(
        {
          activationId,
          planId: draft.id,
          expectedWholePlanRevision: draft.wholePlanRevision,
          confirmationName: draft.name,
          acknowledgeWarnings: false,
        },
        actorId,
      ),
    ).rejects.toMatchObject({
      name: "PlanActivationCommittedVerificationError",
      result: {
        activationId,
        status: "committed_verification_failed",
        idempotent: true,
      },
    });
  });

  it("keeps an integrity incident paused without automatic state repair", () => {
    const draft = createBlankDraft(actorId);
    const activationId = crypto.randomUUID();
    getDb().prepare(
      `INSERT INTO plan_activation_operations (
         activation_id, predecessor_plan_id, successor_plan_id,
         requested_revision, phase, requested_by, failure_code
       ) VALUES (?, ?, ?, ?, 'integrity_incident', ?,
                 'injected_integrity_incident')`,
    ).run(
      activationId,
      active.id,
      draft.id,
      draft.wholePlanRevision,
      actorId,
    );
    getDb().prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('plan_activation_write_pause', '1')",
    ).run();
    getDb().prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('active_plan_integrity_blocked', '1')",
    ).run();

    resetDb();
    const reconciled = getDb();

    expect(
      reconciled.prepare(
        `SELECT phase, failure_code
         FROM plan_activation_operations WHERE activation_id = ?`,
      ).get(activationId),
    ).toEqual({
      phase: "integrity_incident",
      failure_code: "injected_integrity_incident",
    });
    expect(
      reconciled.prepare(
        `SELECT key, value FROM meta
         WHERE key IN (
           'plan_activation_write_pause',
           'active_plan_integrity_blocked'
         ) ORDER BY key`,
      ).all(),
    ).toEqual([
      { key: "active_plan_integrity_blocked", value: "1" },
      { key: "plan_activation_write_pause", value: "1" },
    ]);
  });
});
