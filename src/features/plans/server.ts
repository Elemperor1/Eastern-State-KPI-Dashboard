import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import schemaVersionConfig from "@/lib/schema-version.json";
import { getDb, resolveDbPath, transaction } from "@/lib/db";
import { slugFromLabel } from "@/lib/slug";
import {
  AddDraftMeasureBundleSchema,
  AddDraftTargetSchema,
  CopyDraftTargetSchema,
  ArchiveDraftPrioritySchema,
  ActivateDraftSchema,
  CancelDraftSchema,
  ClassifyDraftQuestionSchema,
  CreateSuccessorDraftSchema,
  ReadinessOverrideSchema,
  RecordDraftLineageSchema,
  ReviewPlanSectionSchema,
  SaveDraftBoardScopeSchema,
  UpdateDraftItemSchema,
  UpdateDraftDetailsSchema,
  type AddDraftMeasureBundleInput,
  type AddDraftTargetInput,
  type CopyDraftTargetInput,
  type ArchiveDraftPriorityInput,
  type ActivateDraftInput,
  type CancelDraftInput,
  type ClassifyDraftQuestionInput,
  type CreateSuccessorDraftInput,
  type ReadinessOverrideInput,
  type RecordDraftLineageInput,
  type ReviewPlanSectionInput,
  type SaveDraftBoardScopeInput,
  type UpdateDraftItemInput,
  type UpdateDraftDetailsInput,
} from "./validation";
import type {
  DraftBoardSummary,
  DraftPrioritySummary,
  DraftQuestionSummary,
  PlanLineageDisclosure,
  PlanLineageSource,
  PlanActivationResult,
  PlanLifecycleEventRecord,
  PlanManagerModel,
  PlanReadinessEvaluation,
  PlanReadinessItem,
  PlanSectionReview,
  StrategicPlanCreationMethod,
  StrategicPlanLifecycleState,
  StrategicPlanSummary,
} from "./types";

export class PlanLifecycleConflictError extends Error {
  /** Creates a new lifecycle conflict. */
  constructor(
    message: string,
    public readonly code:
      | "draft_exists"
      | "stale_revision"
      | "invalid_state"
      | "confirmation_mismatch"
      | "activation_in_progress" = "invalid_state",
  ) {
    super(message);
    this.name = "PlanLifecycleConflictError";
  }
}

export class PlanLifecycleValidationError extends Error {
  /** Creates a new lifecycle validation error. */
  constructor(
    message: string,
    public readonly issues: PlanReadinessItem[] = [],
  ) {
    super(message);
    this.name = "PlanLifecycleValidationError";
  }
}

export class PlanLifecycleNotFoundError extends Error {
  /** Creates a new not-found error. */
  constructor(message = "The requested Strategic Plan was not found.") {
    super(message);
    this.name = "PlanLifecycleNotFoundError";
  }
}

export class PlanActivationBackupError extends Error {
  /** Creates a new verified-backup failure. */
  constructor(
    message =
      "Activation did not begin because the safety backup could not be created and verified. The Active plan and Draft are unchanged. Ask the system operator for help.",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PlanActivationBackupError";
  }
}

export class PlanActivationCommittedVerificationError extends Error {
  /** Creates a post-commit fail-closed verification error. */
  constructor(
    public readonly result: PlanActivationResult,
  ) {
    super(
      "Plan activation committed, but the safety verification did not finish successfully. Saving remains paused. Ask the system operator to follow the activation recovery runbook.",
    );
    this.name = "PlanActivationCommittedVerificationError";
  }
}

interface PlanRow extends Record<string, unknown> {
  id: number;
  organization_id: number;
  predecessor_plan_id: number | null;
  slug: string;
  name: string;
  description: string | null;
  start_year: number;
  end_year: number;
  lifecycle_state: StrategicPlanLifecycleState;
  creation_method: StrategicPlanCreationMethod;
  revision: number;
  whole_plan_revision: number;
  clone_source_revision: number | null;
  approval_source: string | null;
  source_changed_at: string | null;
  archived_at: string | null;
  cancelled_at: string | null;
  activated_at: string | null;
  activation_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CloneMaps {
  priorities: Map<number, number>;
  goals: Map<number, number>;
  kpis: Map<number, number>;
  configurations: Map<number, number>;
  components: Map<number, number>;
  bands: Map<number, number>;
  memberships: Map<number, number>;
}

/** Maps the persisted lifecycle row to the feature interface. */
function mapPlan(row: PlanRow): StrategicPlanSummary {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    predecessorPlanId:
      row.predecessor_plan_id === null
        ? null
        : Number(row.predecessor_plan_id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description === null ? null : String(row.description),
    startYear: Number(row.start_year),
    endYear: Number(row.end_year),
    lifecycleState: row.lifecycle_state,
    creationMethod: row.creation_method,
    revision: Number(row.revision),
    wholePlanRevision: Number(row.whole_plan_revision),
    cloneSourceRevision:
      row.clone_source_revision === null
        ? null
        : Number(row.clone_source_revision),
    approvalSource:
      row.approval_source === null ? null : String(row.approval_source),
    sourceChangedAt:
      row.source_changed_at === null ? null : String(row.source_changed_at),
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
    cancelledAt:
      row.cancelled_at === null ? null : String(row.cancelled_at),
    activatedAt:
      row.activated_at === null ? null : String(row.activated_at),
    activationId:
      row.activation_id === null ? null : String(row.activation_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Reads one plan without assuming it is Active. */
function planRow(planId: number): PlanRow {
  const row = getDb()
    .prepare("SELECT * FROM strategic_plans WHERE id = ?")
    .get(planId) as PlanRow | undefined;
  if (!row) throw new PlanLifecycleNotFoundError();
  return row;
}

/** Reads the one authoritative Active plan and fails closed otherwise. */
export function getLifecycleActivePlan(): StrategicPlanSummary {
  const rows = getDb()
    .prepare(
      `SELECT * FROM strategic_plans
       WHERE lifecycle_state = 'active' AND archived_at IS NULL
       ORDER BY id`,
    )
    .all() as PlanRow[];
  if (rows.length !== 1) {
    throw new PlanLifecycleConflictError(
      "Plan integrity needs operator attention. Saving is unavailable until the single Active plan is restored.",
      "invalid_state",
    );
  }
  return mapPlan(rows[0]);
}

/** Lists plans in stable lifecycle and creation order. */
export function listStrategicPlans(): StrategicPlanSummary[] {
  return (
    getDb()
      .prepare(
        `SELECT * FROM strategic_plans
         ORDER BY
           CASE lifecycle_state
             WHEN 'active' THEN 0
             WHEN 'draft' THEN 1
             WHEN 'archived' THEN 2
             ELSE 3
           END,
           start_year DESC, id DESC`,
      )
      .all() as PlanRow[]
  ).map(mapPlan);
}

/** Produces a collision-free internal slug while preserving visible names. */
function uniquePlanSlug(name: string, startYear: number, endYear: number): string {
  const rawBase = slugFromLabel(name) || "strategic-plan";
  const base = `${rawBase.slice(0, 88)}-${startYear}-${endYear}`;
  let candidate = base;
  let suffix = 2;
  while (
    getDb()
      .prepare("SELECT 1 FROM strategic_plans WHERE slug = ?")
      .get(candidate)
  ) {
    candidate = `${base.slice(0, 112)}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Existing catalog slugs are globally unique for backward compatibility.
 * Successor rows therefore receive a stable internal suffix; lineage retains
 * the predecessor's original plan-scoped reference for disclosure.
 */
function clonedInternalSlug(sourceSlug: string, successorPlanId: number): string {
  return `${sourceSlug.slice(0, 104)}-plan-${successorPlanId}`;
}

/** Produces a collision-free global catalog slug for deliberately new content. */
function uniqueCatalogSlug(name: string, table: "categories" | "kpis" | "strategic_goals", planId: number): string {
  const base = `${(slugFromLabel(name) || "item").slice(0, 96)}-plan-${planId}`;
  let candidate = base;
  let suffix = 2;
  while (getDb().prepare(`SELECT 1 FROM ${table} WHERE slug = ?`).get(candidate)) {
    candidate = `${base.slice(0, 112)}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** Reads a non-secret actor snapshot for immutable lifecycle evidence. */
function actorEmail(actorId: number): string | null {
  const row = getDb()
    .prepare("SELECT email FROM users WHERE id = ?")
    .get(actorId) as { email?: string } | undefined;
  return row?.email ? String(row.email) : null;
}

/** Records one immutable, completed lifecycle event. */
function recordLifecycleEvent(input: {
  planId: number;
  predecessorPlanId: number | null;
  action:
    | "create_blank"
    | "create_structural_clone"
    | "cancel"
    | "activate"
    | "archive"
    | "activation_recovered";
  beforeState: StrategicPlanLifecycleState | null;
  afterState: StrategicPlanLifecycleState;
  checkedPlanRevision: number | null;
  checkedPredecessorRevision: number | null;
  confirmationText: string | null;
  result: Record<string, unknown>;
  actorId: number;
  activationId?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO strategic_plan_lifecycle_events (
         event_id, plan_id, predecessor_plan_id, action, before_state,
         after_state, checked_plan_revision, checked_predecessor_revision,
         confirmation_text, result_json, actor_id, actor_email_snapshot,
         activation_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      input.planId,
      input.predecessorPlanId,
      input.action,
      input.beforeState,
      input.afterState,
      input.checkedPlanRevision,
      input.checkedPredecessorRevision,
      input.confirmationText,
      JSON.stringify(input.result),
      input.actorId,
      actorEmail(input.actorId),
      input.activationId ?? null,
    );
}

/** Records immutable item-level provenance for a copied successor row. */
function recordCopiedLineage(input: {
  organizationId: number;
  predecessorPlanId: number;
  successorPlanId: number;
  itemKind:
    | "priority"
    | "goal"
    | "kpi"
    | "measurement_config"
    | "component"
    | "distribution_band"
    | "membership"
    | "target"
    | "board_scope"
    | "board_priority"
    | "board_statement";
  predecessorItemId: number;
  successorItemId: number;
  predecessorName: string;
  predecessorContext: Record<string, unknown>;
  actorId: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO successor_lineage (
         organization_id, predecessor_plan_id, successor_plan_id, item_kind,
         predecessor_item_id, successor_item_id, relationship_type,
         predecessor_name_snapshot, predecessor_context_json, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, 'copied_from', ?, ?, ?)`,
    )
    .run(
      input.organizationId,
      input.predecessorPlanId,
      input.successorPlanId,
      input.itemKind,
      input.predecessorItemId,
      input.successorItemId,
      input.predecessorName,
      JSON.stringify(input.predecessorContext),
      input.actorId,
    );
}

/** Marks copied content as requiring deliberate Successor Review. */
function recordNeedsReview(
  planId: number,
  itemKind:
    | "priority"
    | "goal"
    | "kpi"
    | "measurement_config"
    | "component"
    | "distribution_band"
    | "membership"
    | "target"
    | "board_priority",
  itemId: number,
): void {
  getDb()
    .prepare(
      `INSERT INTO plan_item_reviews (
         plan_id, item_kind, item_id, review_status
       ) VALUES (?, ?, ?, 'needs_review')`,
    )
    .run(planId, itemKind, itemId);
}

/** Initializes the three persistent guide sections. */
function initializeSectionReviews(
  planId: number,
  predecessorRevision: number,
): void {
  const statement = getDb().prepare(
    `INSERT INTO plan_section_reviews (
       plan_id, section, review_status, predecessor_revision
     ) VALUES (?, ?, 'needs_review', ?)`,
  );
  for (const section of [
    "plan_details",
    "plan_structure",
    "targets_board",
  ]) {
    statement.run(planId, section, predecessorRevision);
  }
}

/** Returns lineage snapshot context shared by every copied item. */
function lineageContext(
  predecessor: StrategicPlanSummary,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    predecessor_plan_name: predecessor.name,
    predecessor_start_year: predecessor.startYear,
    predecessor_end_year: predecessor.endYear,
    ...extra,
  };
}

/** Structurally clones all current, non-archived plan-owned definitions. */
function clonePlanStructure(
  predecessor: StrategicPlanSummary,
  successor: StrategicPlanSummary,
  actorId: number,
): Record<string, number> {
  const db = getDb();
  const maps: CloneMaps = {
    priorities: new Map(),
    goals: new Map(),
    kpis: new Map(),
    configurations: new Map(),
    components: new Map(),
    bands: new Map(),
    memberships: new Map(),
  };
  const counts = {
    priorities: 0,
    goals: 0,
    measures: 0,
    measurementDefinitions: 0,
    components: 0,
    reportingGroups: 0,
    memberships: 0,
    boardPriorities: 0,
    boardStatements: 0,
  };

  const priorities = db
    .prepare(
      `SELECT * FROM categories
       WHERE plan_id = ? AND archived_at IS NULL
       ORDER BY sort_order, id`,
    )
    .all(predecessor.id);
  for (const source of priorities) {
    const successorId = Number(
      db
        .prepare(
          `INSERT INTO categories (
             plan_id, slug, name, description, sort_order
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          successor.id,
          clonedInternalSlug(String(source.slug), successor.id),
          source.name,
          source.description ?? null,
          source.sort_order,
        ).lastInsertRowid,
    );
    maps.priorities.set(Number(source.id), successorId);
    recordNeedsReview(successor.id, "priority", successorId);
    recordCopiedLineage({
      organizationId: successor.organizationId,
      predecessorPlanId: predecessor.id,
      successorPlanId: successor.id,
      itemKind: "priority",
      predecessorItemId: Number(source.id),
      successorItemId: successorId,
      predecessorName: String(source.name),
      predecessorContext: lineageContext(predecessor, {
        slug: source.slug,
      }),
      actorId,
    });
    counts.priorities += 1;
  }

  const measures = db
    .prepare(
      `SELECT kpi.*
       FROM kpis kpi
       JOIN categories priority ON priority.id = kpi.category_id
       WHERE priority.plan_id = ?
         AND priority.archived_at IS NULL
         AND kpi.archived_at IS NULL
         AND kpi.is_active = 1
       ORDER BY kpi.sort_order, kpi.id`,
    )
    .all(predecessor.id);
  for (const source of measures) {
    const successorPriorityId = maps.priorities.get(Number(source.category_id));
    if (!successorPriorityId) continue;
    const successorId = Number(
      db
        .prepare(
          `INSERT INTO kpis (
             category_id, parent_id, slug, name, unit, unit_type,
             reporting_frequency, direction, description, sort_order,
             is_active
           ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          successorPriorityId,
          clonedInternalSlug(String(source.slug), successor.id),
          source.name,
          source.unit,
          source.unit_type,
          source.reporting_frequency,
          source.direction,
          source.description ?? null,
          source.sort_order,
        ).lastInsertRowid,
    );
    maps.kpis.set(Number(source.id), successorId);
    recordNeedsReview(successor.id, "kpi", successorId);
    recordCopiedLineage({
      organizationId: successor.organizationId,
      predecessorPlanId: predecessor.id,
      successorPlanId: successor.id,
      itemKind: "kpi",
      predecessorItemId: Number(source.id),
      successorItemId: successorId,
      predecessorName: String(source.name),
      predecessorContext: lineageContext(predecessor, {
        slug: source.slug,
      }),
      actorId,
    });
    counts.measures += 1;
  }
  for (const source of measures) {
    if (source.parent_id === null) continue;
    const successorId = maps.kpis.get(Number(source.id));
    const successorParentId = maps.kpis.get(Number(source.parent_id));
    if (successorId && successorParentId) {
      db.prepare("UPDATE kpis SET parent_id = ? WHERE id = ?").run(
        successorParentId,
        successorId,
      );
    }
  }

  const goals = db
    .prepare(
      `SELECT goal.*
       FROM strategic_goals goal
       JOIN categories priority ON priority.id = goal.priority_id
       WHERE priority.plan_id = ?
         AND priority.archived_at IS NULL
         AND goal.archived_at IS NULL
         AND goal.configuration_status <> 'archived'
         AND goal.plan_start_year <= ?
         AND goal.plan_end_year >= ?
       ORDER BY goal.sort_order, goal.id`,
    )
    .all(predecessor.id, predecessor.endYear, predecessor.endYear);
  for (const source of goals) {
    const successorPriorityId = maps.priorities.get(Number(source.priority_id));
    if (!successorPriorityId) continue;
    const successorId = Number(
      db
        .prepare(
          `INSERT INTO strategic_goals (
             priority_id, slug, name, description, plan_start_year,
             plan_end_year, completion_rule, threshold_count,
             threshold_percentage, manual_status, board_level_status,
             configuration_status, unresolved_question, owner, due_date,
             resolution_notes, source_reference, last_reviewed_date,
             sort_order, created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'not_reported',
                     'draft', ?, ?, NULL, ?, ?, NULL, ?, ?, ?)`,
        )
        .run(
          successorPriorityId,
          clonedInternalSlug(String(source.slug), successor.id),
          source.name,
          source.description ?? null,
          successor.startYear,
          successor.endYear,
          source.completion_rule,
          source.threshold_count ?? null,
          source.threshold_percentage ?? null,
          source.unresolved_question ?? null,
          source.owner ?? null,
          source.resolution_notes ?? null,
          source.source_reference ?? null,
          source.sort_order,
          actorId,
          actorId,
        ).lastInsertRowid,
    );
    maps.goals.set(Number(source.id), successorId);
    recordNeedsReview(successor.id, "goal", successorId);
    recordCopiedLineage({
      organizationId: successor.organizationId,
      predecessorPlanId: predecessor.id,
      successorPlanId: successor.id,
      itemKind: "goal",
      predecessorItemId: Number(source.id),
      successorItemId: successorId,
      predecessorName: String(source.name),
      predecessorContext: lineageContext(predecessor, {
        slug: source.slug,
      }),
      actorId,
    });
    counts.goals += 1;
  }

  const configurations = db
    .prepare(
      `SELECT configuration.*
       FROM kpi_measurement_configs configuration
       JOIN kpis kpi ON kpi.id = configuration.kpi_id
       JOIN categories priority ON priority.id = kpi.category_id
       WHERE priority.plan_id = ?
         AND configuration.archived_at IS NULL
         AND configuration.configuration_status <> 'archived'
         AND configuration.effective_from_year <= ?
         AND COALESCE(configuration.effective_to_year, ?) >= ?
       ORDER BY configuration.id`,
    )
    .all(
      predecessor.id,
      predecessor.endYear,
      predecessor.endYear,
      predecessor.endYear,
    );
  for (const source of configurations) {
    const successorKpiId = maps.kpis.get(Number(source.kpi_id));
    if (!successorKpiId) continue;
    const successorId = Number(
      db
        .prepare(
          `INSERT INTO kpi_measurement_configs (
             kpi_id, effective_from_year, effective_to_year,
             measurement_type, unit, numerator_label, denominator_label,
             fixed_denominator, baseline_value, reporting_frequency,
             aggregation_method, board_level_status, calculation_precision,
             configuration_status, unresolved_question, owner, due_date,
             resolution_notes, source_reference, last_reviewed_date,
             allow_score_over_max, created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'not_reported', ?,
                     'draft', ?, ?, NULL, ?, ?, NULL, ?, ?, ?)`,
        )
        .run(
          successorKpiId,
          successor.startYear,
          successor.endYear,
          source.measurement_type ?? null,
          source.unit ?? null,
          source.numerator_label ?? null,
          source.denominator_label ?? null,
          source.fixed_denominator ?? null,
          source.reporting_frequency ?? null,
          source.aggregation_method ?? null,
          source.calculation_precision,
          source.unresolved_question ?? null,
          source.owner ?? null,
          source.resolution_notes ?? null,
          source.source_reference ?? null,
          source.allow_score_over_max,
          actorId,
          actorId,
        ).lastInsertRowid,
    );
    maps.configurations.set(Number(source.id), successorId);
    recordNeedsReview(successor.id, "measurement_config", successorId);
    recordCopiedLineage({
      organizationId: successor.organizationId,
      predecessorPlanId: predecessor.id,
      successorPlanId: successor.id,
      itemKind: "measurement_config",
      predecessorItemId: Number(source.id),
      successorItemId: successorId,
      predecessorName: `Definition for ${String(source.kpi_id)}`,
      predecessorContext: lineageContext(predecessor, {
        kpi_id: source.kpi_id,
        effective_from_year: source.effective_from_year,
        effective_to_year: source.effective_to_year,
      }),
      actorId,
    });
    counts.measurementDefinitions += 1;
  }

  const components = db
    .prepare(
      `SELECT component.*
       FROM kpi_components component
       JOIN kpi_measurement_configs configuration
         ON configuration.id = component.configuration_id
       JOIN kpis kpi ON kpi.id = component.kpi_id
       JOIN categories priority ON priority.id = kpi.category_id
       WHERE priority.plan_id = ?
         AND component.archived_at IS NULL
         AND component.configuration_status <> 'archived'
         AND configuration.id IN (
           SELECT id FROM kpi_measurement_configs
           WHERE effective_from_year <= ?
             AND COALESCE(effective_to_year, ?) >= ?
         )
       ORDER BY component.display_order, component.id`,
    )
    .all(
      predecessor.id,
      predecessor.endYear,
      predecessor.endYear,
      predecessor.endYear,
    );
  for (const source of components) {
    const successorKpiId = maps.kpis.get(Number(source.kpi_id));
    const successorConfigurationId = maps.configurations.get(
      Number(source.configuration_id),
    );
    if (!successorKpiId || !successorConfigurationId) continue;
    const successorId = Number(
      db
        .prepare(
          `INSERT INTO kpi_components (
             kpi_id, configuration_id, slug, label, measurement_type, unit,
             numerator_label, denominator_label, fixed_denominator,
             baseline_value, previous_period_value, aggregation_role, weight,
             display_order, configuration_status, unresolved_question,
             created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 'draft',
                     ?, ?, ?)`,
        )
        .run(
          successorKpiId,
          successorConfigurationId,
          source.slug,
          source.label,
          source.measurement_type ?? null,
          source.unit ?? null,
          source.numerator_label ?? null,
          source.denominator_label ?? null,
          source.fixed_denominator ?? null,
          source.aggregation_role,
          source.weight,
          source.display_order,
          source.unresolved_question ?? null,
          actorId,
          actorId,
        ).lastInsertRowid,
    );
    maps.components.set(Number(source.id), successorId);
    recordNeedsReview(successor.id, "component", successorId);
    recordCopiedLineage({
      organizationId: successor.organizationId,
      predecessorPlanId: predecessor.id,
      successorPlanId: successor.id,
      itemKind: "component",
      predecessorItemId: Number(source.id),
      successorItemId: successorId,
      predecessorName: String(source.label),
      predecessorContext: lineageContext(predecessor, {
        slug: source.slug,
      }),
      actorId,
    });
    counts.components += 1;
  }

  const memberships = db
    .prepare(
      `SELECT membership.*, goal.name AS goal_name, kpi.name AS kpi_name
       FROM goal_kpis membership
       JOIN strategic_goals goal ON goal.id = membership.goal_id
       JOIN categories priority ON priority.id = goal.priority_id
       JOIN kpis kpi ON kpi.id = membership.kpi_id
       WHERE priority.plan_id = ?
         AND membership.archived_at IS NULL
         AND membership.effective_from_year <= ?
         AND COALESCE(membership.effective_to_year, ?) >= ?
       ORDER BY membership.display_order, membership.id`,
    )
    .all(
      predecessor.id,
      predecessor.endYear,
      predecessor.endYear,
      predecessor.endYear,
    );
  for (const source of memberships) {
    const successorGoalId = maps.goals.get(Number(source.goal_id));
    const successorKpiId = maps.kpis.get(Number(source.kpi_id));
    if (!successorGoalId || !successorKpiId) continue;
    const successorId = Number(
      db
        .prepare(
          `INSERT INTO goal_kpis (
             goal_id, kpi_id, is_required, weight, display_order,
             effective_from_year, effective_to_year, created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          successorGoalId,
          successorKpiId,
          source.is_required,
          source.weight,
          source.display_order,
          successor.startYear,
          successor.endYear,
          actorId,
          actorId,
        ).lastInsertRowid,
    );
    maps.memberships.set(Number(source.id), successorId);
    recordNeedsReview(successor.id, "membership", successorId);
    recordCopiedLineage({
      organizationId: successor.organizationId,
      predecessorPlanId: predecessor.id,
      successorPlanId: successor.id,
      itemKind: "membership",
      predecessorItemId: Number(source.id),
      successorItemId: successorId,
      predecessorName: `${String(source.kpi_name)} in ${String(source.goal_name)}`,
      predecessorContext: lineageContext(predecessor, {
        goal_id: source.goal_id,
        kpi_id: source.kpi_id,
      }),
      actorId,
    });
    counts.memberships += 1;
  }

  const bands = db
    .prepare(
      `SELECT band.*
       FROM distribution_bands band
       JOIN kpis kpi ON kpi.id = band.kpi_id
       JOIN categories priority ON priority.id = kpi.category_id
       WHERE priority.plan_id = ?
         AND band.archived_at IS NULL
         AND band.effective_from_year <= ?
         AND COALESCE(band.effective_to_year, ?) >= ?
       ORDER BY band.display_order, band.id`,
    )
    .all(
      predecessor.id,
      predecessor.endYear,
      predecessor.endYear,
      predecessor.endYear,
    );
  for (const source of bands) {
    const successorKpiId = maps.kpis.get(Number(source.kpi_id));
    const successorComponentId =
      source.component_id === null
        ? null
        : maps.components.get(Number(source.component_id)) ?? null;
    if (!successorKpiId) continue;
    if (source.component_id !== null && successorComponentId === null) continue;
    const successorId = Number(
      db
        .prepare(
          `INSERT INTO distribution_bands (
             kpi_id, component_id, slug, label, effective_from_year,
             effective_to_year, display_order, is_unknown, is_declined,
             derived_group, created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          successorKpiId,
          successorComponentId,
          source.slug,
          source.label,
          successor.startYear,
          successor.endYear,
          source.display_order,
          source.is_unknown,
          source.is_declined,
          source.derived_group ?? null,
          actorId,
          actorId,
        ).lastInsertRowid,
    );
    maps.bands.set(Number(source.id), successorId);
    recordNeedsReview(successor.id, "distribution_band", successorId);
    recordCopiedLineage({
      organizationId: successor.organizationId,
      predecessorPlanId: predecessor.id,
      successorPlanId: successor.id,
      itemKind: "distribution_band",
      predecessorItemId: Number(source.id),
      successorItemId: successorId,
      predecessorName: String(source.label),
      predecessorContext: lineageContext(predecessor, {
        slug: source.slug,
      }),
      actorId,
    });
    counts.reportingGroups += 1;
  }

  cloneBoardScope(predecessor, successor, maps, actorId, counts);
  return counts;
}

/** Clones only lineage-backed Board content and omits empty statements. */
function cloneBoardScope(
  predecessor: StrategicPlanSummary,
  successor: StrategicPlanSummary,
  maps: CloneMaps,
  actorId: number,
  counts: Record<string, number>,
): void {
  const db = getDb();
  const sourceScope = db
    .prepare("SELECT * FROM board_reporting_scopes WHERE plan_id = ?")
    .get(predecessor.id);
  const successorScopeId = Number(
    db
      .prepare(
        `INSERT INTO board_reporting_scopes (
           plan_id, revision, review_status, created_by, updated_by
         ) VALUES (?, 0, 'needs_review', ?, ?)`,
      )
      .run(successor.id, actorId, actorId).lastInsertRowid,
  );
  if (!sourceScope) return;
  recordCopiedLineage({
    organizationId: successor.organizationId,
    predecessorPlanId: predecessor.id,
    successorPlanId: successor.id,
    itemKind: "board_scope",
    predecessorItemId: Number(sourceScope.id),
    successorItemId: successorScopeId,
    predecessorName: `${predecessor.name} Board scope`,
    predecessorContext: lineageContext(predecessor, {}),
    actorId,
  });
  const sourcePriorities = db
    .prepare(
      `SELECT board_priority.*
       FROM board_reporting_priorities board_priority
       WHERE board_priority.scope_id = ?
         AND board_priority.archived_at IS NULL
       ORDER BY board_priority.display_order, board_priority.id`,
    )
    .all(Number(sourceScope.id));
  for (const sourcePriority of sourcePriorities) {
    const successorPriorityId = maps.priorities.get(
      Number(sourcePriority.priority_id),
    );
    if (!successorPriorityId) continue;
    const sourceStatements = db
      .prepare(
        `SELECT * FROM board_reporting_statements
         WHERE board_priority_id = ?
           AND archived_at IS NULL
         ORDER BY display_order, id`,
      )
      .all(Number(sourcePriority.id));
    const surviving = sourceStatements.flatMap((statement) => {
      const links = db
        .prepare(
          `SELECT * FROM board_reporting_statement_kpis
           WHERE statement_id = ?
           ORDER BY display_order, kpi_id`,
        )
        .all(Number(statement.id))
        .flatMap((link) => {
          const successorKpiId = maps.kpis.get(Number(link.kpi_id));
          return successorKpiId
            ? [{
                successorKpiId,
                displayOrder: Number(link.display_order),
              }]
            : [];
        });
      return links.length > 0 ? [{ statement, links }] : [];
    });
    if (surviving.length === 0) continue;
    const successorBoardPriorityId = Number(
      db
        .prepare(
          `INSERT INTO board_reporting_priorities (
             scope_id, priority_id, display_title, display_order,
             review_status, created_by, updated_by
           ) VALUES (?, ?, ?, ?, 'needs_review', ?, ?)`,
        )
        .run(
          successorScopeId,
          successorPriorityId,
          sourcePriority.display_title,
          sourcePriority.display_order,
          actorId,
          actorId,
        ).lastInsertRowid,
    );
    recordNeedsReview(successor.id, "board_priority", successorBoardPriorityId);
    recordCopiedLineage({
      organizationId: successor.organizationId,
      predecessorPlanId: predecessor.id,
      successorPlanId: successor.id,
      itemKind: "board_priority",
      predecessorItemId: Number(sourcePriority.id),
      successorItemId: successorBoardPriorityId,
      predecessorName: String(sourcePriority.display_title),
      predecessorContext: lineageContext(predecessor, {}),
      actorId,
    });
    counts.boardPriorities += 1;
    for (const { statement, links } of surviving) {
      const successorStatementId = Number(
        db
          .prepare(
            `INSERT INTO board_reporting_statements (
               board_priority_id, statement_text, display_order,
               created_by, updated_by
             ) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            successorBoardPriorityId,
            statement.statement_text,
            statement.display_order,
            actorId,
            actorId,
          ).lastInsertRowid,
      );
      recordCopiedLineage({
        organizationId: successor.organizationId,
        predecessorPlanId: predecessor.id,
        successorPlanId: successor.id,
        itemKind: "board_statement",
        predecessorItemId: Number(statement.id),
        successorItemId: successorStatementId,
        predecessorName: String(statement.statement_text),
        predecessorContext: lineageContext(predecessor, {}),
        actorId,
      });
      for (const link of links) {
        db.prepare(
          `INSERT INTO board_reporting_statement_kpis (
             statement_id, kpi_id, display_order, created_by
           ) VALUES (?, ?, ?, ?)`,
        ).run(
          successorStatementId,
          link.successorKpiId,
          link.displayOrder,
          actorId,
        );
      }
      counts.boardStatements += 1;
    }
  }
}

/** Creates a blank or structurally cloned successor Draft. */
export function createSuccessorDraft(
  input: CreateSuccessorDraftInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = CreateSuccessorDraftSchema.parse(input);
  return transaction(() => {
    const db = getDb();
    const active = getLifecycleActivePlan();
    const existingDraft = db
      .prepare(
        `SELECT id FROM strategic_plans
         WHERE organization_id = ?
           AND lifecycle_state = 'draft'
           AND cancelled_at IS NULL`,
      )
      .get(active.organizationId);
    if (existingDraft) {
      throw new PlanLifecycleConflictError(
        "A next plan is already being prepared. Continue that Draft before creating another.",
        "draft_exists",
      );
    }
    const startYear = active.endYear + 1;
    if (parsed.endYear < startYear) {
      throw new PlanLifecycleValidationError(
        `The next plan must end in ${startYear} or later.`,
      );
    }
    const planId = Number(
      db
        .prepare(
          `INSERT INTO strategic_plans (
             organization_id, predecessor_plan_id, slug, name, description,
             start_year, end_year, status, lifecycle_state, creation_method,
             revision, whole_plan_revision, clone_source_revision,
             source_reference, approval_source, created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'draft', ?, 1, 1, ?, ?, ?,
                     ?, ?)`,
        )
        .run(
          active.organizationId,
          active.id,
          uniquePlanSlug(parsed.name, startYear, parsed.endYear),
          parsed.name,
          parsed.description,
          startYear,
          parsed.endYear,
          parsed.creationMethod,
          active.wholePlanRevision,
          parsed.approvalSource,
          parsed.approvalSource,
          actorId,
          actorId,
        ).lastInsertRowid,
    );
    let successor = mapPlan(planRow(planId));
    initializeSectionReviews(planId, active.wholePlanRevision);
    let clonedCounts: Record<string, number> = {};
    if (parsed.creationMethod === "structural_clone") {
      clonedCounts = clonePlanStructure(active, successor, actorId);
    } else {
      db.prepare(
        `INSERT INTO board_reporting_scopes (
           plan_id, revision, review_status, created_by, updated_by
         ) VALUES (?, 0, 'needs_review', ?, ?)`,
      ).run(planId, actorId, actorId);
    }
    db.prepare(
      `UPDATE strategic_plans
       SET whole_plan_revision = 1, revision = 1,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(planId);
    recordLifecycleEvent({
      planId,
      predecessorPlanId: active.id,
      action:
        parsed.creationMethod === "structural_clone"
          ? "create_structural_clone"
          : "create_blank",
      beforeState: null,
      afterState: "draft",
      checkedPlanRevision: active.wholePlanRevision,
      checkedPredecessorRevision: active.wholePlanRevision,
      confirmationText: null,
      result: {
        creation_method: parsed.creationMethod,
        start_year: startYear,
        end_year: parsed.endYear,
        historical_reporting_evidence_copied: false,
        targets_copied_automatically: false,
        ...clonedCounts,
      },
      actorId,
    });
    successor = mapPlan(planRow(planId));
    return successor;
  });
}

/** Requires the caller's exact reviewed Draft revision. */
function requireCurrentDraft(
  planId: number,
  expectedWholePlanRevision: number,
): StrategicPlanSummary {
  const plan = mapPlan(planRow(planId));
  if (plan.lifecycleState !== "draft" || plan.cancelledAt !== null) {
    throw new PlanLifecycleConflictError(
      "This plan is no longer an editable Draft.",
      "invalid_state",
    );
  }
  if (plan.wholePlanRevision !== expectedWholePlanRevision) {
    throw new PlanLifecycleConflictError(
      "The Draft changed after this page was loaded. Refresh it, review the latest saved work, and try again.",
      "stale_revision",
    );
  }
  return plan;
}

/** Advances the Whole-Plan Revision after one successful Draft change. */
function bumpWholePlanRevision(planId: number, actorId: number): number {
  getDb()
    .prepare(
      `UPDATE strategic_plans
       SET whole_plan_revision = whole_plan_revision + 1,
           revision = revision + 1, updated_by = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(actorId, planId);
  return mapPlan(planRow(planId)).wholePlanRevision;
}

/** Saves successor plan details with optimistic concurrency. */
export function updateDraftDetails(
  input: UpdateDraftDetailsInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = UpdateDraftDetailsSchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    const predecessor = draft.predecessorPlanId
      ? mapPlan(planRow(draft.predecessorPlanId))
      : null;
    if (draft.revision !== parsed.expectedPlanRevision) {
      throw new PlanLifecycleConflictError(
        "The plan details changed after this form was loaded. Refresh Plans and reapply your change.",
        "stale_revision",
      );
    }
    if (!predecessor || draft.startYear !== predecessor.endYear + 1) {
      throw new PlanLifecycleValidationError(
        "Restore consecutive plan years before changing this Draft.",
      );
    }
    if (parsed.endYear < draft.startYear) {
      throw new PlanLifecycleValidationError(
        `The final year must be ${draft.startYear} or later.`,
      );
    }
    const updated = getDb()
      .prepare(
        `UPDATE strategic_plans
         SET name = ?, description = ?, end_year = ?, source_reference = ?,
             approval_source = ?, updated_by = ?, updated_at = datetime('now')
         WHERE id = ? AND lifecycle_state = 'draft' AND revision = ?`,
      )
      .run(
        parsed.name,
        parsed.description,
        parsed.endYear,
        parsed.approvalSource,
        parsed.approvalSource,
        actorId,
        parsed.planId,
        parsed.expectedPlanRevision,
      );
    if (updated.changes !== 1) {
      throw new PlanLifecycleConflictError(
        "The plan details changed while they were being saved. Refresh Plans and try again.",
        "stale_revision",
      );
    }
    bumpWholePlanRevision(parsed.planId, actorId);
    getDb()
      .prepare(
        `UPDATE plan_section_reviews
         SET review_status = 'needs_review', reviewed_by = NULL,
             reviewed_at = NULL, updated_at = datetime('now')
         WHERE plan_id = ? AND section = 'plan_details'`,
      )
      .run(parsed.planId);
    return mapPlan(planRow(parsed.planId));
  });
}

/** Confirms one guide section against the exact saved Draft revision. */
export function reviewPlanSection(
  input: ReviewPlanSectionInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = ReviewPlanSectionSchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    const predecessorRevision = draft.predecessorPlanId
      ? mapPlan(planRow(draft.predecessorPlanId)).wholePlanRevision
      : null;
    const reviewed = getDb()
      .prepare(
        `UPDATE plan_section_reviews
         SET review_status = 'approved', predecessor_revision = ?,
             reviewed_by = ?, reviewed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE plan_id = ? AND section = ? AND updated_at = ?`,
      )
      .run(
        predecessorRevision,
        actorId,
        parsed.planId,
        parsed.section,
        parsed.expectedSectionUpdatedAt,
      );
    if (reviewed.changes !== 1) {
      throw new PlanLifecycleConflictError(
        "This review section changed after the page was loaded. Refresh Plans and review the latest saved work.",
        "stale_revision",
      );
    }
    if (parsed.section === "plan_structure") {
      getDb()
        .prepare(
          `UPDATE plan_item_reviews
           SET review_status = 'approved', reviewed_by = ?,
               reviewed_at = datetime('now'), updated_at = datetime('now')
           WHERE plan_id = ? AND item_kind <> 'board_priority'`,
        )
        .run(actorId, parsed.planId);
    }
    bumpWholePlanRevision(parsed.planId, actorId);
    return mapPlan(planRow(parsed.planId));
  });
}

/** Stores one individually reasoned readiness override. */
export function saveReadinessOverride(
  input: ReadinessOverrideInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = ReadinessOverrideSchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    const evaluation = evaluateDraftReadiness(draft.id);
    const requirement = evaluation.requirements.find(
      (item) => item.key === parsed.requirementKey,
    );
    if (!requirement) {
      throw new PlanLifecycleValidationError(
        "That readiness item no longer needs an override. Refresh the readiness review.",
      );
    }
    getDb()
      .prepare(
        `INSERT INTO plan_readiness_overrides (
           plan_id, requirement_key, requirement_label_snapshot, reason,
           plan_revision, created_by
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(plan_id, requirement_key) WHERE resolved_at IS NULL
         DO UPDATE SET
           requirement_label_snapshot = excluded.requirement_label_snapshot,
           reason = excluded.reason,
           plan_revision = excluded.plan_revision,
           created_by = excluded.created_by,
           created_at = datetime('now')`,
      )
      .run(
        parsed.planId,
        requirement.key,
        requirement.title,
        parsed.reason,
        draft.wholePlanRevision,
        actorId,
      );
    bumpWholePlanRevision(parsed.planId, actorId);
    return mapPlan(planRow(parsed.planId));
  });
}

/** Permanently cancels, but never deletes, one exact reviewed Draft. */
export function cancelDraft(
  input: CancelDraftInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = CancelDraftSchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    if (parsed.confirmationName !== draft.name) {
      throw new PlanLifecycleConflictError(
        "Enter the Draft plan name exactly as shown to confirm cancellation.",
        "confirmation_mismatch",
      );
    }
    getDb()
      .prepare(
        `UPDATE strategic_plans
         SET lifecycle_state = 'cancelled', cancelled_at = datetime('now'),
             updated_by = ?, updated_at = datetime('now')
         WHERE id = ? AND lifecycle_state = 'draft'
           AND whole_plan_revision = ?`,
      )
      .run(actorId, draft.id, draft.wholePlanRevision);
    recordLifecycleEvent({
      planId: draft.id,
      predecessorPlanId: draft.predecessorPlanId,
      action: "cancel",
      beforeState: "draft",
      afterState: "cancelled",
      checkedPlanRevision: draft.wholePlanRevision,
      checkedPredecessorRevision: null,
      confirmationText: parsed.confirmationName,
      result: {
        retained: true,
        deleted: false,
        reporting_changed: false,
      },
      actorId,
    });
    return mapPlan(planRow(draft.id));
  });
}

/**
 * Adds one complete, understandable Priority → Goal → Measure starting point.
 *
 * This intentionally avoids exposing internal configuration tables in the
 * Plans guide. Admins can create a viable blank-plan structure in one save,
 * while ordinary Measure and Goal editors remain the detailed editing surface.
 */
export function addDraftMeasureBundle(
  input: AddDraftMeasureBundleInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = AddDraftMeasureBundleSchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    const db = getDb();
    const priorityId = Number(
      db.prepare(
        `INSERT INTO categories (
           plan_id, slug, name, description, sort_order
         ) VALUES (?, ?, ?, ?, COALESCE((
           SELECT MAX(sort_order) + 1 FROM categories WHERE plan_id = ?
         ), 0))`,
      ).run(
        draft.id,
        uniqueCatalogSlug(parsed.priorityName, "categories", draft.id),
        parsed.priorityName,
        "Prepared for the successor Strategic Plan.",
        draft.id,
      ).lastInsertRowid,
    );
    const goalId = Number(
      db.prepare(
        `INSERT INTO strategic_goals (
           priority_id, slug, name, description, plan_start_year, plan_end_year,
           completion_rule, configuration_status, owner, sort_order,
           created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, 'all_required_kpis', 'ready', ?, 0, ?, ?)`,
      ).run(
        priorityId,
        uniqueCatalogSlug(parsed.goalName, "strategic_goals", draft.id),
        parsed.goalName,
        "Prepared for the successor Strategic Plan.",
        draft.startYear,
        draft.endYear,
        parsed.goalOwner,
        actorId,
        actorId,
      ).lastInsertRowid,
    );
    const kpiId = Number(
      db.prepare(
        `INSERT INTO kpis (
           category_id, slug, name, unit, unit_type, reporting_frequency,
           direction, description, sort_order, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
      ).run(
        priorityId,
        uniqueCatalogSlug(parsed.measureName, "kpis", draft.id),
        parsed.measureName,
        parsed.unit,
        parsed.unitType,
        parsed.reportingFrequency,
        parsed.direction,
        "Prepared for the successor Strategic Plan.",
      ).lastInsertRowid,
    );
    const configurationId = Number(
      db.prepare(
        `INSERT INTO kpi_measurement_configs (
           kpi_id, effective_from_year, effective_to_year, measurement_type,
           unit, reporting_frequency, aggregation_method,
           configuration_status, owner, source_reference, created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, 'sum', 'ready', ?, ?, ?, ?)`,
      ).run(
        kpiId,
        draft.startYear,
        draft.endYear,
        parsed.unitType === "percent"
          ? "percentage"
          : parsed.unitType === "currency"
            ? "currency"
            : "count",
        parsed.unit,
        parsed.reportingFrequency === "monthly"
          ? "monthly"
          : parsed.reportingFrequency === "annual"
            ? "annual"
            : "flexible",
        parsed.measureOwner,
        draft.approvalSource,
        actorId,
        actorId,
      ).lastInsertRowid,
    );
    const membershipId = Number(
      db.prepare(
        `INSERT INTO goal_kpis (
           goal_id, kpi_id, is_required, weight, display_order,
           effective_from_year, effective_to_year, created_by, updated_by
         ) VALUES (?, ?, 1, 1, 0, ?, ?, ?, ?)`,
      ).run(
        goalId,
        kpiId,
        draft.startYear,
        draft.endYear,
        actorId,
        actorId,
      ).lastInsertRowid,
    );
    for (const [kind, id] of [
      ["priority", priorityId],
      ["goal", goalId],
      ["kpi", kpiId],
      ["measurement_config", configurationId],
      ["membership", membershipId],
    ] as const) {
      recordNeedsReview(draft.id, kind, id);
    }
    db.prepare(
      `UPDATE plan_section_reviews
       SET review_status = 'needs_review', reviewed_by = NULL,
           reviewed_at = NULL, updated_at = datetime('now')
       WHERE plan_id = ? AND section IN ('plan_structure','targets_board')`,
    ).run(draft.id);
    return mapPlan(planRow(draft.id));
  });
}

/** Adds one reviewed first-year Annual Target to a Draft Measure. */
export function addDraftTarget(
  input: AddDraftTargetInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = AddDraftTargetSchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    const owned = getDb().prepare(
      `SELECT kpi.id, kpi.updated_at
       FROM kpis kpi
       JOIN categories priority ON priority.id = kpi.category_id
       WHERE kpi.id = ? AND priority.plan_id = ?
         AND kpi.archived_at IS NULL AND kpi.is_active = 1`,
    ).get(parsed.kpiId, draft.id) as
      | { id: number; updated_at: string }
      | undefined;
    if (!owned) {
      throw new PlanLifecycleValidationError(
        "Choose an active Measure from this Draft.",
      );
    }
    if (owned.updated_at !== parsed.expectedKpiUpdatedAt) {
      throw new PlanLifecycleConflictError(
        "That Measure changed after this page was loaded. Refresh Plans before adding its Target.",
        "stale_revision",
      );
    }
    const existingTarget = getDb().prepare(
      `SELECT id, updated_at FROM kpi_targets
       WHERE kpi_id = ? AND target_scope = 'annual'
         AND reporting_year = ? AND target_year = ?`,
    ).get(parsed.kpiId, draft.startYear, draft.startYear) as
      | { id: number; updated_at: string }
      | undefined;
    let targetId: number;
    if (existingTarget) {
      if (
        parsed.expectedTargetUpdatedAt === null ||
        parsed.expectedTargetUpdatedAt !== existingTarget.updated_at
      ) {
        throw new PlanLifecycleConflictError(
          "That first-year Target changed after this page was loaded. Refresh Plans and review it again.",
          "stale_revision",
        );
      }
      const updated = getDb().prepare(
        `UPDATE kpi_targets
         SET target_value = ?, configuration_status = 'ready',
             source_reference = ?, last_reviewed_date = date('now'),
             updated_by = ?, updated_at = datetime('now')
         WHERE id = ? AND updated_at = ?`,
      ).run(
        parsed.targetValue,
        parsed.sourceReference,
        actorId,
        existingTarget.id,
        parsed.expectedTargetUpdatedAt,
      );
      if (updated.changes !== 1) {
        throw new PlanLifecycleConflictError(
          "That first-year Target changed while it was being saved. Refresh Plans and try again.",
          "stale_revision",
        );
      }
      targetId = existingTarget.id;
    } else {
      if (parsed.expectedTargetUpdatedAt !== null) {
        throw new PlanLifecycleConflictError(
          "That first-year Target is no longer available. Refresh Plans.",
          "stale_revision",
        );
      }
      targetId = Number(
        getDb().prepare(
          `INSERT INTO kpi_targets (
             kpi_id, target_scope, reporting_year, target_year, target_value,
             configuration_status, source_reference, last_reviewed_date,
             created_by, updated_by
           ) VALUES (?, 'annual', ?, ?, ?, 'ready', ?, date('now'), ?, ?)`,
        ).run(
          parsed.kpiId,
          draft.startYear,
          draft.startYear,
          parsed.targetValue,
          parsed.sourceReference,
          actorId,
          actorId,
        ).lastInsertRowid,
      );
      recordNeedsReview(draft.id, "target", targetId);
    }
    getDb().prepare(
      `UPDATE plan_item_reviews
       SET review_status = 'approved', reviewed_by = ?,
           reviewed_at = datetime('now'), updated_at = datetime('now')
       WHERE plan_id = ? AND item_kind = 'target' AND item_id = ?`,
    ).run(actorId, draft.id, targetId);
    getDb().prepare(
      `UPDATE plan_section_reviews
       SET review_status = 'needs_review', reviewed_by = NULL,
           reviewed_at = NULL, updated_at = datetime('now')
       WHERE plan_id = ? AND section = 'targets_board'`,
    ).run(draft.id);
    return mapPlan(planRow(draft.id));
  });
}

/** Explicitly copies one predecessor Target into the Draft for later review. */
export function copyDraftTarget(
  input: CopyDraftTargetInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = CopyDraftTargetSchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    if (draft.predecessorPlanId === null) {
      throw new PlanLifecycleValidationError(
        "This Draft has no predecessor Target to copy.",
      );
    }
    const measure = getDb().prepare(
      `SELECT kpi.updated_at
       FROM kpis kpi
       JOIN categories priority ON priority.id = kpi.category_id
       WHERE kpi.id = ? AND priority.plan_id = ?
         AND kpi.archived_at IS NULL AND kpi.is_active = 1`,
    ).get(parsed.kpiId, draft.id) as { updated_at: string } | undefined;
    if (!measure) {
      throw new PlanLifecycleValidationError(
        "Choose a Measure from this Draft.",
      );
    }
    if (measure.updated_at !== parsed.expectedKpiUpdatedAt) {
      throw new PlanLifecycleConflictError(
        "That Measure changed after this page was loaded. Refresh Plans before copying its Target.",
        "stale_revision",
      );
    }
    const source = getDb().prepare(
      `SELECT target.*, predecessor_kpi.name AS kpi_name
       FROM kpi_targets target
       JOIN kpis predecessor_kpi ON predecessor_kpi.id = target.kpi_id
       JOIN categories predecessor_priority
         ON predecessor_priority.id = predecessor_kpi.category_id
       JOIN successor_lineage lineage
         ON lineage.predecessor_item_id = predecessor_kpi.id
        AND lineage.successor_item_id = ?
        AND lineage.item_kind = 'kpi'
        AND lineage.predecessor_plan_id = ?
        AND lineage.successor_plan_id = ?
       WHERE target.id = ? AND target.archived_at IS NULL
         AND predecessor_priority.plan_id = ?`,
    ).get(
      parsed.kpiId,
      draft.predecessorPlanId,
      draft.id,
      parsed.predecessorTargetId,
      draft.predecessorPlanId,
    ) as Record<string, unknown> | undefined;
    if (!source) {
      throw new PlanLifecycleValidationError(
        "Choose a Target from this Measure’s immediate predecessor lineage.",
      );
    }
    const existing = getDb().prepare(
      `SELECT id FROM kpi_targets
       WHERE kpi_id = ? AND target_scope = 'annual'
         AND reporting_year = ? AND target_year = ?
         AND archived_at IS NULL`,
    ).get(parsed.kpiId, draft.startYear, draft.startYear);
    if (existing) {
      throw new PlanLifecycleConflictError(
        "This Measure already has a first-year Target. Review that Target instead.",
        "invalid_state",
      );
    }
    const targetId = Number(
      getDb().prepare(
        `INSERT INTO kpi_targets (
           kpi_id, target_scope, reporting_year, target_year, target_value,
           target_description, configuration_status, source_reference,
           created_by, updated_by
         ) VALUES (?, 'annual', ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      ).run(
        parsed.kpiId,
        draft.startYear,
        draft.startYear,
        source.target_value ?? null,
        source.target_description ?? null,
        source.source_reference ?? `Copied from ${String(source.kpi_name)}`,
        actorId,
        actorId,
      ).lastInsertRowid,
    );
    const predecessor = mapPlan(planRow(draft.predecessorPlanId));
    recordCopiedLineage({
      organizationId: draft.organizationId,
      predecessorPlanId: predecessor.id,
      successorPlanId: draft.id,
      itemKind: "target",
      predecessorItemId: parsed.predecessorTargetId,
      successorItemId: targetId,
      predecessorName:
        source.target_description === null
          ? `${String(source.kpi_name)} Target`
          : String(source.target_description),
      predecessorContext: lineageContext(predecessor, {
        kpi_name: source.kpi_name,
        target_scope: source.target_scope,
        reporting_year: source.reporting_year,
        target_year: source.target_year,
      }),
      actorId,
    });
    recordNeedsReview(draft.id, "target", targetId);
    getDb().prepare(
      `UPDATE plan_section_reviews
       SET review_status = 'needs_review', reviewed_by = NULL,
           reviewed_at = NULL, updated_at = datetime('now')
       WHERE plan_id = ? AND section = 'targets_board'`,
    ).run(draft.id);
    return mapPlan(planRow(draft.id));
  });
}

/** Saves and reviews the complete successor-only Draft Board scope atomically. */
export function saveDraftBoardScope(
  input: SaveDraftBoardScopeInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = SaveDraftBoardScopeSchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    const db = getDb();
    const scope = db.prepare(
      "SELECT id, revision FROM board_reporting_scopes WHERE plan_id = ?",
    ).get(draft.id) as { id: number; revision: number } | undefined;
    if (!scope) {
      throw new PlanLifecycleConflictError(
        "The Draft Board preparation record is missing. Ask the system operator for help.",
        "invalid_state",
      );
    }
    if (scope.revision !== parsed.expectedBoardRevision) {
      throw new PlanLifecycleConflictError(
        "The Draft Board preparation changed after this page was loaded. Refresh Plans and reapply your change.",
        "stale_revision",
      );
    }
    const currentBoard = loadDraftBoard(draft.id);
    if (!currentBoard) {
      throw new PlanLifecycleConflictError(
        "The Draft Board preparation record is missing. Ask the system operator for help.",
        "invalid_state",
      );
    }
    if (parsed.intentionalEmpty && parsed.confirmationName !== draft.name) {
      throw new PlanLifecycleConflictError(
        "Enter the Draft plan name exactly to confirm that this plan will have no Board report.",
        "confirmation_mismatch",
      );
    }
    for (const priority of parsed.priorities) {
      const priorityRow = db.prepare(
        `SELECT id FROM categories
         WHERE id = ? AND plan_id = ? AND archived_at IS NULL`,
      ).get(priority.priorityId, draft.id);
      if (!priorityRow) {
        throw new PlanLifecycleValidationError(
          "Every Board Priority must belong to this Draft.",
        );
      }
      for (const statement of priority.statements) {
        for (const kpiId of statement.kpiIds) {
          const measure = db.prepare(
            `SELECT id FROM kpis
             WHERE id = ? AND category_id = ? AND archived_at IS NULL
               AND is_active = 1`,
          ).get(kpiId, priority.priorityId);
          if (!measure) {
            throw new PlanLifecycleValidationError(
              "Every Board focus statement must link only to a visible Measure in its Priority.",
            );
          }
        }
      }
    }

    const retainedPriorityIds: number[] = [];
    parsed.priorities.forEach((priority, priorityIndex) => {
      const prior = currentBoard.priorities.find(
        (candidate) => candidate.priorityId === priority.priorityId,
      );
      const changed =
        !prior ||
        JSON.stringify({
          displayTitle: prior.displayTitle,
          statements: prior.statements.map((statement) => ({
            id: statement.id,
            text: statement.text,
            kpiIds: statement.measures.map((measure) => measure.id),
          })),
        }) !==
          JSON.stringify({
            displayTitle: priority.displayTitle,
            statements: priority.statements,
          });
      const reviewed = parsed.reviewedPriorityIds.includes(
        priority.priorityId,
      );
      const reviewStatus = reviewed
        ? "approved"
        : changed
          ? "needs_review"
          : prior.reviewStatus;
      const existing = priority.id === null
        ? db.prepare(
            `SELECT id FROM board_reporting_priorities
             WHERE scope_id = ? AND priority_id = ?`,
          ).get(scope.id, priority.priorityId) as { id: number } | undefined
        : db.prepare(
            `SELECT id FROM board_reporting_priorities
             WHERE id = ? AND scope_id = ? AND priority_id = ?`,
          ).get(priority.id, scope.id, priority.priorityId) as
            | { id: number }
            | undefined;
      let boardPriorityId: number;
      if (existing) {
        boardPriorityId = existing.id;
        db.prepare(
          `UPDATE board_reporting_priorities
           SET display_title = ?, display_order = ?, archived_at = NULL,
               review_status = ?, reviewed_by = ?,
               reviewed_at = ?, updated_by = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
        ).run(
          priority.displayTitle,
          (priorityIndex + 1) * 10,
          reviewStatus,
          reviewStatus === "approved" ? actorId : null,
          reviewStatus === "approved"
            ? new Date().toISOString()
            : null,
          actorId,
          boardPriorityId,
        );
      } else {
        boardPriorityId = Number(
          db.prepare(
            `INSERT INTO board_reporting_priorities (
               scope_id, priority_id, display_title, display_order,
               review_status, reviewed_by, reviewed_at, created_by, updated_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            scope.id,
            priority.priorityId,
            priority.displayTitle,
            (priorityIndex + 1) * 10,
            reviewStatus,
            reviewStatus === "approved" ? actorId : null,
            reviewStatus === "approved"
              ? new Date().toISOString()
              : null,
            actorId,
            actorId,
          ).lastInsertRowid,
        );
      }
      retainedPriorityIds.push(boardPriorityId);

      const retainedStatementIds: number[] = [];
      priority.statements.forEach((statement, statementIndex) => {
        const existingStatement = statement.id === null
          ? undefined
          : db.prepare(
              `SELECT id FROM board_reporting_statements
               WHERE id = ? AND board_priority_id = ?`,
            ).get(statement.id, boardPriorityId) as { id: number } | undefined;
        let statementId: number;
        if (existingStatement) {
          statementId = existingStatement.id;
          db.prepare(
            `UPDATE board_reporting_statements
             SET statement_text = ?, display_order = ?, archived_at = NULL,
                 updated_by = ?, updated_at = datetime('now')
             WHERE id = ?`,
          ).run(
            statement.text,
            (statementIndex + 1) * 10,
            actorId,
            statementId,
          );
        } else {
          statementId = Number(
            db.prepare(
              `INSERT INTO board_reporting_statements (
                 board_priority_id, statement_text, display_order,
                 created_by, updated_by
               ) VALUES (?, ?, ?, ?, ?)`,
            ).run(
              boardPriorityId,
              statement.text,
              (statementIndex + 1) * 10,
              actorId,
              actorId,
            ).lastInsertRowid,
          );
        }
        retainedStatementIds.push(statementId);
        db.prepare(
          "DELETE FROM board_reporting_statement_kpis WHERE statement_id = ?",
        ).run(statementId);
        statement.kpiIds.forEach((kpiId, kpiIndex) => {
          db.prepare(
            `INSERT INTO board_reporting_statement_kpis (
               statement_id, kpi_id, display_order, created_by
             ) VALUES (?, ?, ?, ?)`,
          ).run(statementId, kpiId, (kpiIndex + 1) * 10, actorId);
        });
      });
      if (retainedStatementIds.length > 0) {
        db.prepare(
          `UPDATE board_reporting_statements
           SET archived_at = datetime('now'), updated_by = ?,
               updated_at = datetime('now')
           WHERE board_priority_id = ? AND archived_at IS NULL
             AND id NOT IN (${retainedStatementIds.map(() => "?").join(",")})`,
        ).run(actorId, boardPriorityId, ...retainedStatementIds);
      }
      if (!db.prepare(
        `SELECT 1 FROM plan_item_reviews
         WHERE plan_id = ? AND item_kind = 'board_priority' AND item_id = ?`,
      ).get(draft.id, boardPriorityId)) {
        recordNeedsReview(draft.id, "board_priority", boardPriorityId);
      }
      db.prepare(
        `UPDATE plan_item_reviews
         SET review_status = ?, reviewed_by = ?, reviewed_at = ?,
             updated_at = datetime('now')
         WHERE plan_id = ? AND item_kind = 'board_priority'
           AND item_id = ?`,
      ).run(
        reviewStatus,
        reviewStatus === "approved" ? actorId : null,
        reviewStatus === "approved" ? new Date().toISOString() : null,
        draft.id,
        boardPriorityId,
      );
    });

    if (retainedPriorityIds.length > 0) {
      db.prepare(
        `UPDATE board_reporting_priorities
         SET archived_at = datetime('now'), review_status = 'needs_review',
             reviewed_by = NULL, reviewed_at = NULL, updated_by = ?,
             updated_at = datetime('now')
         WHERE scope_id = ? AND archived_at IS NULL
           AND id NOT IN (${retainedPriorityIds.map(() => "?").join(",")})`,
      ).run(actorId, scope.id, ...retainedPriorityIds);
    } else {
      db.prepare(
        `UPDATE board_reporting_priorities
         SET archived_at = datetime('now'), review_status = 'needs_review',
             reviewed_by = NULL, reviewed_at = NULL, updated_by = ?,
             updated_at = datetime('now')
         WHERE scope_id = ? AND archived_at IS NULL`,
      ).run(actorId, scope.id);
    }

    const pendingBoardPriorities = parsed.intentionalEmpty
      ? 0
      : Number(
          (
            db.prepare(
              `SELECT COUNT(*) AS count
               FROM board_reporting_priorities
               WHERE scope_id = ? AND archived_at IS NULL
                 AND review_status = 'needs_review'`,
            ).get(scope.id) as { count: number }
          ).count,
        );
    const scopeReviewStatus = parsed.intentionalEmpty
      ? "intentional_empty"
      : pendingBoardPriorities === 0
        ? "approved"
        : "needs_review";
    const scopeUpdate = db.prepare(
      `UPDATE board_reporting_scopes
       SET revision = revision + 1, review_status = ?,
           reviewed_by = ?, reviewed_at = ?,
           updated_by = ?, updated_at = datetime('now')
       WHERE id = ? AND revision = ?`,
    ).run(
      scopeReviewStatus,
      scopeReviewStatus === "needs_review" ? null : actorId,
      scopeReviewStatus === "needs_review"
        ? null
        : new Date().toISOString(),
      actorId,
      scope.id,
      parsed.expectedBoardRevision,
    );
    if (scopeUpdate.changes !== 1) {
      throw new PlanLifecycleConflictError(
        "The Draft Board preparation changed while it was being saved. Refresh Plans and try again.",
        "stale_revision",
      );
    }
    db.prepare(
      `UPDATE plan_section_reviews
       SET review_status = ?, reviewed_by = ?, reviewed_at = ?,
           updated_at = datetime('now')
       WHERE plan_id = ? AND section = 'targets_board'`,
    ).run(
      scopeReviewStatus === "needs_review" ? "needs_review" : "approved",
      scopeReviewStatus === "needs_review" ? null : actorId,
      scopeReviewStatus === "needs_review"
        ? null
        : new Date().toISOString(),
      draft.id,
    );
    return mapPlan(planRow(draft.id));
  });
}

/** Updates one Draft structure label or owner against the Whole-Plan Revision. */
export function updateDraftItem(
  input: UpdateDraftItemInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = UpdateDraftItemSchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    const db = getDb();
    let changes = 0;
    if (parsed.itemKind === "priority") {
      changes = Number(
        db.prepare(
          `UPDATE categories SET name = ?, updated_at = datetime('now')
           WHERE id = ? AND plan_id = ? AND archived_at IS NULL
             AND updated_at = ?`,
        ).run(
          parsed.name,
          parsed.itemId,
          draft.id,
          parsed.expectedRecordUpdatedAt,
        ).changes,
      );
    } else if (parsed.itemKind === "goal") {
      changes = Number(
        db.prepare(
          `UPDATE strategic_goals
           SET name = ?, owner = ?, updated_by = ?, updated_at = datetime('now')
           WHERE id = ? AND archived_at IS NULL
             AND updated_at = ?
             AND priority_id IN (
               SELECT id FROM categories WHERE plan_id = ?
             )`,
        ).run(
          parsed.name,
          parsed.owner,
          actorId,
          parsed.itemId,
          parsed.expectedRecordUpdatedAt,
          draft.id,
        ).changes,
      );
    } else {
      changes = Number(
        db.prepare(
          `UPDATE kpis
           SET name = ?, updated_at = datetime('now')
           WHERE id = ? AND archived_at IS NULL
             AND updated_at = ?
             AND category_id IN (
               SELECT id FROM categories WHERE plan_id = ?
             )`,
        ).run(
          parsed.name,
          parsed.itemId,
          parsed.expectedRecordUpdatedAt,
          draft.id,
        ).changes,
      );
      if (changes === 1) {
        db.prepare(
          `UPDATE kpi_measurement_configs
           SET owner = ?, updated_by = ?, updated_at = datetime('now')
           WHERE kpi_id = ? AND archived_at IS NULL
             AND effective_from_year <= ?
             AND COALESCE(effective_to_year, ?) >= ?`,
        ).run(
          parsed.owner,
          actorId,
          parsed.itemId,
          draft.startYear,
          draft.startYear,
          draft.startYear,
        );
      }
    }
    if (changes !== 1) {
      throw new PlanLifecycleConflictError(
        "That Draft item changed after this page was loaded. Refresh Plans and reapply your change.",
        "stale_revision",
      );
    }
    db.prepare(
      `UPDATE plan_item_reviews
       SET review_status = 'needs_review', reviewed_by = NULL,
           reviewed_at = NULL, updated_at = datetime('now')
       WHERE plan_id = ? AND item_kind = ? AND item_id = ?`,
    ).run(
      draft.id,
      parsed.itemKind === "measure" ? "kpi" : parsed.itemKind,
      parsed.itemId,
    );
    db.prepare(
      `UPDATE plan_section_reviews
       SET review_status = 'needs_review', reviewed_by = NULL,
           reviewed_at = NULL, updated_at = datetime('now')
       WHERE plan_id = ? AND section = 'plan_structure'`,
    ).run(draft.id);
    return mapPlan(planRow(draft.id));
  });
}

/** Records whether one Draft question was answered now or retained as follow-up. */
export function classifyDraftQuestion(
  input: ClassifyDraftQuestionInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = ClassifyDraftQuestionSchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    const db = getDb();
    let row: { updated_at: string; unresolved_question: string | null } | undefined;
    if (parsed.itemKind === "goal") {
      row = db.prepare(
        `SELECT goal.updated_at, goal.unresolved_question
         FROM strategic_goals goal
         JOIN categories priority ON priority.id = goal.priority_id
         WHERE goal.id = ? AND priority.plan_id = ?
           AND goal.archived_at IS NULL`,
      ).get(parsed.itemId, draft.id) as typeof row;
    } else if (parsed.itemKind === "measurement_config") {
      row = db.prepare(
        `SELECT configuration.updated_at, configuration.unresolved_question
         FROM kpi_measurement_configs configuration
         JOIN kpis kpi ON kpi.id = configuration.kpi_id
         JOIN categories priority ON priority.id = kpi.category_id
         WHERE configuration.id = ? AND priority.plan_id = ?
           AND configuration.archived_at IS NULL`,
      ).get(parsed.itemId, draft.id) as typeof row;
    } else {
      row = db.prepare(
        `SELECT component.updated_at, component.unresolved_question
         FROM kpi_components component
         JOIN kpis kpi ON kpi.id = component.kpi_id
         JOIN categories priority ON priority.id = kpi.category_id
         WHERE component.id = ? AND priority.plan_id = ?
           AND component.archived_at IS NULL`,
      ).get(parsed.itemId, draft.id) as typeof row;
    }
    if (!row || row.unresolved_question === null) {
      throw new PlanLifecycleNotFoundError(
        "That Draft question is no longer open. Refresh Plans.",
      );
    }
    if (row.updated_at !== parsed.expectedRecordUpdatedAt) {
      throw new PlanLifecycleConflictError(
        "That Draft question changed after this page was loaded. Refresh Plans and review the latest wording.",
        "stale_revision",
      );
    }
    if (parsed.decision === "resolve_now") {
      if (parsed.itemKind === "goal") {
        db.prepare(
          `UPDATE strategic_goals
           SET unresolved_question = NULL, resolution_notes = ?,
               updated_by = ?, updated_at = datetime('now')
           WHERE id = ? AND updated_at = ?`,
        ).run(
          parsed.explanation,
          actorId,
          parsed.itemId,
          parsed.expectedRecordUpdatedAt,
        );
      } else if (parsed.itemKind === "measurement_config") {
        db.prepare(
          `UPDATE kpi_measurement_configs
           SET unresolved_question = NULL, resolution_notes = ?,
               updated_by = ?, updated_at = datetime('now')
           WHERE id = ? AND updated_at = ?`,
        ).run(
          parsed.explanation,
          actorId,
          parsed.itemId,
          parsed.expectedRecordUpdatedAt,
        );
      } else {
        db.prepare(
          `UPDATE kpi_components
           SET unresolved_question = NULL, updated_by = ?,
               updated_at = datetime('now')
           WHERE id = ? AND updated_at = ?`,
        ).run(actorId, parsed.itemId, parsed.expectedRecordUpdatedAt);
      }
    }
    db.prepare(
      `INSERT INTO plan_question_decisions (
         plan_id, item_kind, item_id, classification, explanation,
         expected_revision, decided_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(plan_id, item_kind, item_id) DO UPDATE SET
         classification = excluded.classification,
         explanation = excluded.explanation,
         expected_revision = excluded.expected_revision,
         decided_by = excluded.decided_by,
         decided_at = datetime('now')`,
    ).run(
      draft.id,
      parsed.itemKind,
      parsed.itemId,
      parsed.decision === "resolve_now" ? "must_resolve" : "follow_up",
      parsed.explanation,
      parsed.expectedRecordUpdatedAt,
      actorId,
    );
    db.prepare(
      `UPDATE plan_section_reviews
       SET review_status = 'needs_review', reviewed_by = NULL,
           reviewed_at = NULL, updated_at = datetime('now')
       WHERE plan_id = ? AND section = 'plan_structure'`,
    ).run(draft.id);
    return mapPlan(planRow(draft.id));
  });
}

/** Returns one top-level plan item with ownership-safe lineage context. */
function topLevelLineageItem(
  planId: number,
  itemKind: "priority" | "goal" | "kpi",
  itemId: number,
): { name: string; context: Record<string, unknown> } | null {
  const db = getDb();
  if (itemKind === "priority") {
    const row = db.prepare(
      `SELECT id, slug, name FROM categories
       WHERE id = ? AND plan_id = ?`,
    ).get(itemId, planId) as Record<string, unknown> | undefined;
    return row
      ? { name: String(row.name), context: { slug: row.slug } }
      : null;
  }
  if (itemKind === "goal") {
    const row = db.prepare(
      `SELECT goal.id, goal.slug, goal.name, priority.name AS priority_name
       FROM strategic_goals goal
       JOIN categories priority ON priority.id = goal.priority_id
       WHERE goal.id = ? AND priority.plan_id = ?`,
    ).get(itemId, planId) as Record<string, unknown> | undefined;
    return row
      ? {
          name: String(row.name),
          context: {
            slug: row.slug,
            priority_name: row.priority_name,
          },
        }
      : null;
  }
  const row = db.prepare(
    `SELECT kpi.id, kpi.slug, kpi.name, priority.name AS priority_name
     FROM kpis kpi
     JOIN categories priority ON priority.id = kpi.category_id
     WHERE kpi.id = ? AND priority.plan_id = ?`,
  ).get(itemId, planId) as Record<string, unknown> | undefined;
  return row
    ? {
        name: String(row.name),
        context: {
          slug: row.slug,
          priority_name: row.priority_name,
        },
      }
    : null;
}

/** Records explicit Copied/Merged/Split provenance for a redesigned Draft item. */
export function recordDraftLineage(
  input: RecordDraftLineageInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = RecordDraftLineageSchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    if (draft.predecessorPlanId === null) {
      throw new PlanLifecycleValidationError(
        "This Draft has no immediate predecessor for lineage.",
      );
    }
    const predecessor = mapPlan(planRow(draft.predecessorPlanId));
    const successorItem = topLevelLineageItem(
      draft.id,
      parsed.itemKind,
      parsed.successorItemId,
    );
    if (!successorItem) {
      throw new PlanLifecycleValidationError(
        "Choose an item owned by this Draft.",
      );
    }
    const existing = getDb().prepare(
      `SELECT DISTINCT relationship_type
       FROM successor_lineage
       WHERE successor_plan_id = ? AND item_kind = ?
         AND successor_item_id = ?`,
    ).all(
      draft.id,
      parsed.itemKind,
      parsed.successorItemId,
    ) as Array<{ relationship_type: string }>;
    if (
      existing.length > 0 &&
      existing.some(
        (row) => row.relationship_type !== parsed.relationshipType,
      )
    ) {
      throw new PlanLifecycleConflictError(
        "This item already has a different immutable lineage choice. Keep that recorded provenance.",
        "invalid_state",
      );
    }
    if (
      parsed.relationshipType !== "merged_from" &&
      existing.length > 0
    ) {
      throw new PlanLifecycleConflictError(
        "This item already has immutable lineage.",
        "invalid_state",
      );
    }
    for (const predecessorItemId of parsed.predecessorItemIds) {
      const source = topLevelLineageItem(
        predecessor.id,
        parsed.itemKind,
        predecessorItemId,
      );
      if (!source) {
        throw new PlanLifecycleValidationError(
          "Every lineage source must be the same kind of item in the immediate predecessor plan.",
        );
      }
      getDb().prepare(
        `INSERT INTO successor_lineage (
           organization_id, predecessor_plan_id, successor_plan_id, item_kind,
           predecessor_item_id, successor_item_id, relationship_type,
           predecessor_name_snapshot, predecessor_context_json, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        draft.organizationId,
        predecessor.id,
        draft.id,
        parsed.itemKind,
        predecessorItemId,
        parsed.successorItemId,
        parsed.relationshipType,
        source.name,
        JSON.stringify(lineageContext(predecessor, source.context)),
        actorId,
      );
    }
    getDb().prepare(
      `UPDATE plan_section_reviews
       SET review_status = 'needs_review', reviewed_by = NULL,
           reviewed_at = NULL, updated_at = datetime('now')
       WHERE plan_id = ? AND section = 'plan_structure'`,
    ).run(draft.id);
    return mapPlan(planRow(draft.id));
  });
}

/** Removes a Priority from the Draft while retaining every row and lineage. */
export function archiveDraftPriority(
  input: ArchiveDraftPriorityInput,
  actorId: number,
): StrategicPlanSummary {
  const parsed = ArchiveDraftPrioritySchema.parse(input);
  return transaction(() => {
    const draft = requireCurrentDraft(
      parsed.planId,
      parsed.expectedWholePlanRevision,
    );
    const db = getDb();
    const priority = db.prepare(
      `SELECT id, updated_at FROM categories
       WHERE id = ? AND plan_id = ? AND archived_at IS NULL`,
    ).get(parsed.priorityId, draft.id) as
      | { id: number; updated_at: string }
      | undefined;
    if (!priority) {
      throw new PlanLifecycleNotFoundError(
        "That Draft Priority is no longer available. Refresh Plans.",
      );
    }
    if (priority.updated_at !== parsed.expectedRecordUpdatedAt) {
      throw new PlanLifecycleConflictError(
        "That Draft Priority changed after this page was loaded. Refresh Plans before removing it.",
        "stale_revision",
      );
    }
    db.prepare(
      `UPDATE board_reporting_priorities
       SET archived_at = datetime('now'), review_status = 'needs_review',
           reviewed_by = NULL, reviewed_at = NULL, updated_by = ?,
           updated_at = datetime('now')
       WHERE scope_id = (
         SELECT id FROM board_reporting_scopes WHERE plan_id = ?
       ) AND priority_id = ? AND archived_at IS NULL`,
    ).run(actorId, draft.id, parsed.priorityId);
    db.prepare(
      `UPDATE strategic_goals
       SET configuration_status = 'archived', archived_at = datetime('now'),
           updated_by = ?, updated_at = datetime('now')
       WHERE priority_id = ? AND archived_at IS NULL`,
    ).run(actorId, parsed.priorityId);
    db.prepare(
      `UPDATE kpi_measurement_configs
       SET configuration_status = 'archived', archived_at = datetime('now'),
           updated_by = ?, updated_at = datetime('now')
       WHERE kpi_id IN (
         SELECT id FROM kpis WHERE category_id = ?
       ) AND archived_at IS NULL`,
    ).run(actorId, parsed.priorityId);
    db.prepare(
      `UPDATE kpi_targets
       SET configuration_status = 'archived', archived_at = datetime('now'),
           updated_by = ?, updated_at = datetime('now')
       WHERE (
         kpi_id IN (
           SELECT id FROM kpis WHERE category_id = ?
         )
         OR component_id IN (
           SELECT component.id
           FROM kpi_components component
           JOIN kpis kpi ON kpi.id = component.kpi_id
           WHERE kpi.category_id = ?
         )
       ) AND archived_at IS NULL`,
    ).run(actorId, parsed.priorityId, parsed.priorityId);
    db.prepare(
      `UPDATE distribution_bands
       SET archived_at = datetime('now'), updated_by = ?,
           updated_at = datetime('now')
       WHERE kpi_id IN (
         SELECT id FROM kpis WHERE category_id = ?
       ) AND archived_at IS NULL`,
    ).run(actorId, parsed.priorityId);
    db.prepare(
      `UPDATE kpi_components
       SET configuration_status = 'archived', archived_at = datetime('now'),
           updated_by = ?, updated_at = datetime('now')
       WHERE kpi_id IN (
         SELECT id FROM kpis WHERE category_id = ?
       ) AND archived_at IS NULL`,
    ).run(actorId, parsed.priorityId);
    db.prepare(
      `UPDATE goal_kpis
       SET archived_at = datetime('now'), updated_by = ?,
           updated_at = datetime('now')
       WHERE goal_id IN (
         SELECT id FROM strategic_goals WHERE priority_id = ?
       ) AND archived_at IS NULL`,
    ).run(actorId, parsed.priorityId);
    db.prepare(
      `UPDATE kpis
       SET is_active = 0, archived_at = datetime('now'),
           updated_at = datetime('now')
       WHERE category_id = ? AND archived_at IS NULL`,
    ).run(parsed.priorityId);
    db.prepare(
      `UPDATE categories
       SET archived_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND plan_id = ?`,
    ).run(parsed.priorityId, draft.id);
    db.prepare(
      `UPDATE plan_section_reviews
       SET review_status = 'needs_review', reviewed_by = NULL,
           reviewed_at = NULL, updated_at = datetime('now')
       WHERE plan_id = ? AND section IN ('plan_structure','targets_board')`,
    ).run(draft.id);
    db.prepare(
      `UPDATE board_reporting_scopes
       SET revision = revision + 1, review_status = 'needs_review',
           reviewed_by = NULL, reviewed_at = NULL, updated_by = ?,
           updated_at = datetime('now')
       WHERE plan_id = ?`,
    ).run(actorId, draft.id);
    return mapPlan(planRow(draft.id));
  });
}

/** Returns today's civil date in the organization's America/New_York clock. */
function organizationLocalDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Builds one readiness item with direct, nontechnical corrective guidance. */
function readinessItem(
  key: string,
  level: PlanReadinessItem["level"],
  section: PlanReadinessItem["section"],
  title: string,
  guidance: string,
  affectedCount?: number,
): PlanReadinessItem {
  return {
    key,
    level,
    section,
    title,
    guidance,
    ...(affectedCount === undefined ? {} : { affectedCount }),
  };
}

/** Evaluates readiness from the latest saved Draft; no ready flag is cached. */
export function evaluateDraftReadiness(
  planId: number,
  options: { now?: Date } = {},
): PlanReadinessEvaluation {
  const db = getDb();
  const draft = mapPlan(planRow(planId));
  const evaluatedAt = (options.now ?? new Date()).toISOString();
  const hardRules: PlanReadinessItem[] = [];
  const requirements: PlanReadinessItem[] = [];
  const warnings: PlanReadinessItem[] = [];
  if (draft.lifecycleState !== "draft" || draft.cancelledAt !== null) {
    hardRules.push(
      readinessItem(
        "draft_state",
        "hard_rule",
        "check_activate",
        "This plan is not an editable Draft",
        "Open the current Draft from Setup → Plans.",
      ),
    );
  }
  const activeRows = db
    .prepare(
      `SELECT id FROM strategic_plans
       WHERE organization_id = ? AND lifecycle_state = 'active'`,
    )
    .all(draft.organizationId);
  const activeId =
    activeRows.length === 1 ? Number(activeRows[0].id) : null;
  if (activeId === null || activeId !== draft.predecessorPlanId) {
    hardRules.push(
      readinessItem(
        "single_active_predecessor",
        "hard_rule",
        "check_activate",
        "The Active plan relationship needs operator attention",
        "Do not activate. Ask the system operator to restore exactly one Active plan.",
      ),
    );
  }
  const predecessor = draft.predecessorPlanId
    ? mapPlan(planRow(draft.predecessorPlanId))
    : null;
  if (
    !predecessor ||
    draft.startYear !== predecessor.endYear + 1 ||
    draft.endYear < draft.startYear
  ) {
    hardRules.push(
      readinessItem(
        "plan_year_continuity",
        "hard_rule",
        "plan_details",
        "Plan years must be consecutive",
        "Set the next plan to begin in the year immediately after the Active plan ends.",
      ),
    );
  }
  const eligibilityDate = `${draft.startYear}-01-01`;
  if (organizationLocalDate(options.now) < eligibilityDate) {
    hardRules.push(
      readinessItem(
        "activation_eligibility_date",
        "hard_rule",
        "check_activate",
        `Activation becomes available on January 1, ${draft.startYear}`,
        "You can keep preparing the Draft now. Return on or after its first reporting day to activate it.",
      ),
    );
  }
  if (
    draft.name.trim().length === 0 ||
    !draft.description?.trim() ||
    !draft.approvalSource?.trim()
  ) {
    requirements.push(
      readinessItem(
        "plan_details_complete",
        "requirement",
        "plan_details",
        "Finish the plan details",
        "Add a name, description, final year, and the approval or source for this plan.",
      ),
    );
  }
  const structure = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM categories
          WHERE plan_id = ? AND archived_at IS NULL) AS priorities,
         (SELECT COUNT(*)
          FROM strategic_goals goal
          JOIN categories priority ON priority.id = goal.priority_id
          WHERE priority.plan_id = ? AND goal.archived_at IS NULL) AS goals,
         (SELECT COUNT(*)
          FROM goal_kpis membership
          JOIN strategic_goals goal ON goal.id = membership.goal_id
          JOIN categories priority ON priority.id = goal.priority_id
          JOIN kpis kpi ON kpi.id = membership.kpi_id
          WHERE priority.plan_id = ?
            AND membership.archived_at IS NULL
            AND kpi.archived_at IS NULL
            AND kpi.is_active = 1) AS memberships`,
    )
    .get(draft.id, draft.id, draft.id) as {
    priorities: number;
    goals: number;
    memberships: number;
  };
  if (
    Number(structure.priorities) < 1 ||
    Number(structure.goals) < 1 ||
    Number(structure.memberships) < 1
  ) {
    requirements.push(
      readinessItem(
        "minimum_plan_structure",
        "requirement",
        "plan_structure",
        "Add the minimum plan structure",
        "Include at least one Priority, one Goal in that Priority, and one Measure connected to that Goal.",
      ),
    );
  }
  const needsReview = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM plan_item_reviews
           WHERE plan_id = ? AND review_status = 'needs_review'
             AND item_kind <> 'board_priority'`,
        )
        .get(draft.id) as { count: number }
    ).count,
  );
  const sectionNeedsReview = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM plan_section_reviews
           WHERE plan_id = ? AND review_status = 'needs_review'
             AND section IN ('plan_details','plan_structure')`,
        )
        .get(draft.id) as { count: number }
    ).count,
  );
  if (needsReview > 0 || sectionNeedsReview > 0) {
    requirements.push(
      readinessItem(
        "successor_review",
        "requirement",
        "plan_structure",
        "Review the successor plan structure",
        "Open Plan structure, confirm the copied or newly prepared content, and save the review.",
        needsReview + sectionNeedsReview,
      ),
    );
  }
  const missingFirstYearDefinitions = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM kpis kpi
           JOIN categories priority ON priority.id = kpi.category_id
           WHERE priority.plan_id = ?
             AND priority.archived_at IS NULL
             AND kpi.archived_at IS NULL
             AND kpi.is_active = 1
             AND NOT EXISTS (
               SELECT 1 FROM kpi_measurement_configs configuration
               WHERE configuration.kpi_id = kpi.id
                 AND configuration.archived_at IS NULL
                 AND configuration.configuration_status IN ('ready','active')
                 AND configuration.effective_from_year <= ?
                 AND COALESCE(configuration.effective_to_year, ?) >= ?
             )`,
        )
        .get(
          draft.id,
          draft.startYear,
          draft.startYear,
          draft.startYear,
        ) as { count: number }
    ).count,
  );
  if (missingFirstYearDefinitions > 0) {
    requirements.push(
      readinessItem(
        "first_year_definition_coverage",
        "requirement",
        "plan_structure",
        "Complete first-year Measure definitions",
        "Give each active Measure an approved definition that applies in the first reporting year.",
        missingFirstYearDefinitions,
      ),
    );
  }
  const missingRequiredTargets = Number(
    (
      db
        .prepare(
          `SELECT COUNT(DISTINCT membership.kpi_id) AS count
           FROM goal_kpis membership
           JOIN strategic_goals goal ON goal.id = membership.goal_id
           JOIN categories priority ON priority.id = goal.priority_id
           WHERE priority.plan_id = ?
             AND membership.archived_at IS NULL
             AND membership.is_required = 1
             AND NOT EXISTS (
               SELECT 1 FROM kpi_targets target
               WHERE target.kpi_id = membership.kpi_id
                 AND target.archived_at IS NULL
                 AND target.configuration_status IN ('ready','active')
                 AND (
                   (target.target_scope = 'annual'
                    AND target.reporting_year = ?)
                   OR
                   (target.target_scope = 'full_plan'
                    AND target.target_year >= ?)
                 )
             )`,
        )
        .get(draft.id, draft.startYear, draft.startYear) as {
        count: number;
      }
    ).count,
  );
  if (missingRequiredTargets > 0) {
    requirements.push(
      readinessItem(
        "first_year_target_coverage",
        "requirement",
        "targets_board",
        "Add first-year Targets for required Measures",
        "Add an approved first-year Annual Target or a Full-Plan Target that applies from the start.",
        missingRequiredTargets,
      ),
    );
  }
  const baselineGaps = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM kpi_targets target
           JOIN kpis kpi ON kpi.id = target.kpi_id
           JOIN categories priority ON priority.id = kpi.category_id
           JOIN kpi_measurement_configs configuration
             ON configuration.kpi_id = kpi.id
            AND configuration.effective_from_year <= ?
            AND COALESCE(configuration.effective_to_year, ?) >= ?
           WHERE priority.plan_id = ?
             AND target.archived_at IS NULL
             AND target.configuration_status IN ('ready','active')
             AND configuration.measurement_type = 'year_over_year'
             AND (target.baseline_year IS NULL OR target.baseline_value IS NULL)`,
        )
        .get(
          draft.startYear,
          draft.startYear,
          draft.startYear,
          draft.id,
        ) as { count: number }
    ).count,
  );
  if (baselineGaps > 0) {
    requirements.push(
      readinessItem(
        "successor_baseline",
        "requirement",
        "targets_board",
        "Choose the required successor Baselines",
        "Select a verified baseline year and value for each Target whose progress calculation depends on it.",
        baselineGaps,
      ),
    );
  }
  const boardScope = db
    .prepare(
      `SELECT review_status FROM board_reporting_scopes WHERE plan_id = ?`,
    )
    .get(draft.id) as { review_status?: string } | undefined;
  const boardNeedsReview = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM board_reporting_priorities priority
           JOIN board_reporting_scopes scope ON scope.id = priority.scope_id
           WHERE scope.plan_id = ? AND priority.archived_at IS NULL
             AND priority.review_status = 'needs_review'`,
        )
        .get(draft.id) as { count: number }
    ).count,
  );
  if (
    !boardScope ||
    !["approved", "intentional_empty"].includes(
      String(boardScope.review_status),
    ) ||
    boardNeedsReview > 0
  ) {
    requirements.push(
      readinessItem(
        "board_view_review",
        "requirement",
        "targets_board",
        "Review the Board view",
        "Confirm each included Board Priority, or deliberately choose No Board report for this plan.",
        boardNeedsReview,
      ),
    );
  }
  const unresolvedQuestions = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM (
             SELECT 'goal' AS item_kind, goal.id AS item_id
             FROM strategic_goals goal
             JOIN categories priority ON priority.id = goal.priority_id
             WHERE priority.plan_id = ?
               AND goal.archived_at IS NULL
               AND goal.unresolved_question IS NOT NULL
             UNION ALL
             SELECT 'measurement_config', configuration.id
             FROM kpi_measurement_configs configuration
             JOIN kpis kpi ON kpi.id = configuration.kpi_id
             JOIN categories priority ON priority.id = kpi.category_id
             WHERE priority.plan_id = ?
               AND configuration.archived_at IS NULL
               AND configuration.unresolved_question IS NOT NULL
             UNION ALL
             SELECT 'component', component.id
             FROM kpi_components component
             JOIN kpis kpi ON kpi.id = component.kpi_id
             JOIN categories priority ON priority.id = kpi.category_id
             WHERE priority.plan_id = ?
               AND component.archived_at IS NULL
               AND component.unresolved_question IS NOT NULL
           ) question
           WHERE NOT EXISTS (
             SELECT 1 FROM plan_question_decisions decision
             WHERE decision.plan_id = ?
               AND decision.item_kind = question.item_kind
               AND decision.item_id = question.item_id
           )`,
        )
        .get(draft.id, draft.id, draft.id, draft.id) as { count: number }
    ).count,
  );
  if (unresolvedQuestions > 0) {
    requirements.push(
      readinessItem(
        "question_classification",
        "requirement",
        "plan_structure",
        "Classify the remaining questions",
        "For each unresolved question, decide whether it must be answered before activation or may remain as a documented follow-up.",
        unresolvedQuestions,
      ),
    );
  }
  const followUps = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM plan_question_decisions
           WHERE plan_id = ? AND classification = 'follow_up'`,
        )
        .get(draft.id) as { count: number }
    ).count,
  );
  if (followUps > 0) {
    warnings.push(
      readinessItem(
        "approved_follow_up_questions",
        "warning",
        "plan_structure",
        "Some questions will be followed up after activation",
        "Review the documented follow-up explanations in the final confirmation.",
        followUps,
      ),
    );
  }
  const missingOwners = Number(
    (
      db
        .prepare(
          `SELECT
             (SELECT COUNT(*)
              FROM strategic_goals goal
              JOIN categories priority ON priority.id = goal.priority_id
              WHERE priority.plan_id = ? AND goal.archived_at IS NULL
                AND (goal.owner IS NULL OR trim(goal.owner) = '')) +
             (SELECT COUNT(*)
              FROM kpi_measurement_configs configuration
              JOIN kpis kpi ON kpi.id = configuration.kpi_id
              JOIN categories priority ON priority.id = kpi.category_id
              WHERE priority.plan_id = ?
                AND configuration.archived_at IS NULL
                AND (configuration.owner IS NULL OR trim(configuration.owner) = ''))
             AS count`,
        )
        .get(draft.id, draft.id) as { count: number }
    ).count,
  );
  if (missingOwners > 0) {
    warnings.push(
      readinessItem(
        "unconfirmed_owners",
        "warning",
        "plan_structure",
        "Some Goal or Measure owners are not confirmed",
        "You may activate, but assign or confirm these owners as soon as practical.",
        missingOwners,
      ),
    );
  }
  if (
    predecessor &&
    draft.cloneSourceRevision !== null &&
    draft.cloneSourceRevision !== predecessor.wholePlanRevision
  ) {
    requirements.push(
      readinessItem(
        "source_changed_since_clone",
        "requirement",
        "plan_structure",
        "The Active plan changed after this Draft was copied",
        "Review the changed Active-plan source and deliberately confirm whether the Draft needs the same changes.",
      ),
    );
  }
  const predecessorIncomplete = predecessor
    ? Number(
        (
          db
            .prepare(
              `SELECT COUNT(*) AS count
               FROM kpis kpi
               JOIN categories priority ON priority.id = kpi.category_id
               WHERE priority.plan_id = ?
                 AND priority.archived_at IS NULL
                 AND kpi.archived_at IS NULL
                 AND kpi.is_active = 1
                 AND NOT EXISTS (
                   SELECT 1 FROM kpi_observations observation
                   WHERE observation.kpi_id = kpi.id
                     AND observation.year = ?
                 )`,
            )
            .get(predecessor.id, predecessor.endYear) as { count: number }
        ).count,
      )
    : 0;
  if (predecessorIncomplete > 0) {
    warnings.push(
      readinessItem(
        "predecessor_completion",
        "warning",
        "check_activate",
        "The Active plan has unfinished final-year reporting",
        "Activation will make that plan read-only immediately. Finish any remaining reporting first, or acknowledge this warning.",
        predecessorIncomplete,
      ),
    );
  }
  const overrideRows = db
    .prepare(
      `SELECT requirement_key, reason
       FROM plan_readiness_overrides
       WHERE plan_id = ? AND resolved_at IS NULL`,
    )
    .all(draft.id) as Array<{ requirement_key: string; reason: string }>;
  const overrides = new Map(
    overrideRows.map((row) => [String(row.requirement_key), String(row.reason)]),
  );
  for (const requirement of requirements) {
    const reason = overrides.get(requirement.key);
    if (reason) {
      requirement.overridden = true;
      requirement.overrideReason = reason;
    }
  }
  const unresolvedRequirements = requirements.filter(
    (item) => !item.overridden,
  );
  const outcome =
    hardRules.length > 0
      ? "cannot_activate"
      : unresolvedRequirements.length > 0
        ? "needs_decisions"
        : warnings.length > 0 ||
            requirements.some((item) => item.overridden)
          ? "ready_with_warnings"
          : "ready";
  return {
    planId: draft.id,
    wholePlanRevision: draft.wholePlanRevision,
    evaluatedAt,
    outcome,
    hardRules,
    requirements,
    warnings,
    canActivate:
      hardRules.length === 0 && unresolvedRequirements.length === 0,
  };
}

/** Loads the Draft hierarchy used by the nontechnical Plans guide. */
function loadDraftStructure(planId: number, startYear: number): DraftPrioritySummary[] {
  const rows = getDb().prepare(
    `SELECT
       priority.id AS priority_id, priority.name AS priority_name,
       priority.updated_at AS priority_updated_at,
       goal.id AS goal_id, goal.name AS goal_name, goal.owner AS goal_owner,
       goal.updated_at AS goal_updated_at,
       kpi.id AS kpi_id, kpi.name AS kpi_name, kpi.unit,
       kpi.reporting_frequency, kpi.updated_at AS kpi_updated_at,
       configuration.owner AS measure_owner,
       membership.is_required,
       CASE WHEN EXISTS (
         SELECT 1 FROM kpi_targets coverage
         WHERE coverage.kpi_id = kpi.id
           AND coverage.archived_at IS NULL
           AND coverage.configuration_status IN ('ready','active')
           AND (
             (coverage.target_scope = 'annual'
              AND coverage.reporting_year = ?)
             OR
             (coverage.target_scope = 'full_plan'
              AND coverage.target_year >= ?)
           )
       ) THEN 1 ELSE 0 END AS target_ready,
       target.id AS first_target_id,
       target.target_value AS first_target_value,
       target.source_reference AS first_target_source,
       target.configuration_status AS first_target_status,
       target.updated_at AS first_target_updated_at,
       priority_lineage.predecessor_name_snapshot AS priority_source,
       goal_lineage.predecessor_name_snapshot AS goal_source,
       kpi_lineage.predecessor_name_snapshot AS kpi_source
     FROM categories priority
     LEFT JOIN strategic_goals goal
       ON goal.priority_id = priority.id AND goal.archived_at IS NULL
     LEFT JOIN goal_kpis membership
       ON membership.goal_id = goal.id AND membership.archived_at IS NULL
     LEFT JOIN kpis kpi
       ON kpi.id = membership.kpi_id
      AND kpi.archived_at IS NULL AND kpi.is_active = 1
     LEFT JOIN kpi_measurement_configs configuration
       ON configuration.kpi_id = kpi.id
      AND configuration.archived_at IS NULL
      AND configuration.effective_from_year <= ?
      AND COALESCE(configuration.effective_to_year, ?) >= ?
     LEFT JOIN kpi_targets target
       ON target.kpi_id = kpi.id
      AND target.archived_at IS NULL
      AND target.target_scope = 'annual'
      AND target.reporting_year = ?
      AND target.target_year = ?
     LEFT JOIN successor_lineage priority_lineage
       ON priority_lineage.successor_plan_id = priority.plan_id
      AND priority_lineage.item_kind = 'priority'
      AND priority_lineage.successor_item_id = priority.id
     LEFT JOIN successor_lineage goal_lineage
       ON goal_lineage.successor_plan_id = priority.plan_id
      AND goal_lineage.item_kind = 'goal'
      AND goal_lineage.successor_item_id = goal.id
     LEFT JOIN successor_lineage kpi_lineage
       ON kpi_lineage.successor_plan_id = priority.plan_id
      AND kpi_lineage.item_kind = 'kpi'
      AND kpi_lineage.successor_item_id = kpi.id
     WHERE priority.plan_id = ? AND priority.archived_at IS NULL
     ORDER BY priority.sort_order, priority.id, goal.sort_order, goal.id,
              membership.display_order, membership.id`,
  ).all(
    startYear,
    startYear,
    startYear,
    startYear,
    startYear,
    startYear,
    startYear,
    planId,
  ) as Array<Record<string, unknown>>;
  const priorities = new Map<number, DraftPrioritySummary>();
  const goals = new Map<number, DraftPrioritySummary["goals"][number]>();
  for (const row of rows) {
    const priorityId = Number(row.priority_id);
    let priority = priorities.get(priorityId);
    if (!priority) {
      priority = {
        id: priorityId,
        name: String(row.priority_name),
        copiedFromName:
          row.priority_source === null ? null : String(row.priority_source),
        updatedAt: String(row.priority_updated_at),
        goals: [],
      };
      priorities.set(priorityId, priority);
    }
    if (row.goal_id === null) continue;
    const goalId = Number(row.goal_id);
    let goal = goals.get(goalId);
    if (!goal) {
      goal = {
        id: goalId,
        name: String(row.goal_name),
        owner: row.goal_owner === null ? null : String(row.goal_owner),
        copiedFromName: row.goal_source === null ? null : String(row.goal_source),
        updatedAt: String(row.goal_updated_at),
        measures: [],
      };
      goals.set(goalId, goal);
      priority.goals.push(goal);
    }
    if (row.kpi_id === null) continue;
    const kpiId = Number(row.kpi_id);
    if (goal.measures.some((measure) => measure.id === kpiId)) continue;
    goal.measures.push({
      id: kpiId,
      name: String(row.kpi_name),
      unit: String(row.unit),
      reportingFrequency: String(row.reporting_frequency),
      owner: row.measure_owner === null ? null : String(row.measure_owner),
      requiresTarget: Number(row.is_required) === 1,
      firstYearTargetReady: Number(row.target_ready) === 1,
      firstYearTarget:
        row.first_target_id === null
          ? null
          : {
              id: Number(row.first_target_id),
              value:
                row.first_target_value === null
                  ? null
                  : Number(row.first_target_value),
              sourceReference:
                row.first_target_source === null
                  ? null
                  : String(row.first_target_source),
              configurationStatus: String(row.first_target_status),
              updatedAt: String(row.first_target_updated_at),
            },
      predecessorTargets: [],
      copiedFromName: row.kpi_source === null ? null : String(row.kpi_source),
      updatedAt: String(row.kpi_updated_at),
    });
  }
  const targetRows = getDb().prepare(
    `SELECT lineage.successor_item_id AS kpi_id, target.id,
            target.target_scope, target.reporting_year, target.target_year,
            target.target_value, target.target_description,
            target.source_reference
     FROM successor_lineage lineage
     JOIN kpi_targets target
       ON target.kpi_id = lineage.predecessor_item_id
      AND target.archived_at IS NULL
     WHERE lineage.successor_plan_id = ? AND lineage.item_kind = 'kpi'
     ORDER BY lineage.successor_item_id,
              CASE target.target_scope WHEN 'annual' THEN 1 ELSE 2 END,
              target.target_year DESC, target.id DESC`,
  ).all(planId) as Array<Record<string, unknown>>;
  const targetOptions = new Map<
    number,
    DraftPrioritySummary["goals"][number]["measures"][number]["predecessorTargets"]
  >();
  for (const row of targetRows) {
    const kpiId = Number(row.kpi_id);
    const options = targetOptions.get(kpiId) ?? [];
    options.push({
      id: Number(row.id),
      targetScope: row.target_scope as "annual" | "full_plan",
      reportingYear:
        row.reporting_year === null ? null : Number(row.reporting_year),
      targetYear: Number(row.target_year),
      value:
        row.target_value === null ? null : Number(row.target_value),
      description:
        row.target_description === null
          ? null
          : String(row.target_description),
      sourceReference:
        row.source_reference === null
          ? null
          : String(row.source_reference),
    });
    targetOptions.set(kpiId, options);
  }
  const result = [...priorities.values()];
  for (const measure of result.flatMap((priority) =>
    priority.goals.flatMap((goal) => goal.measures),
  )) {
    measure.predecessorTargets = targetOptions.get(measure.id) ?? [];
  }
  return result;
}

/** Loads the Draft Board preparation without exposing Active Board settings. */
function loadDraftBoard(planId: number): DraftBoardSummary | null {
  const scope = getDb().prepare(
    `SELECT id, revision, review_status
     FROM board_reporting_scopes WHERE plan_id = ?`,
  ).get(planId) as {
    id: number;
    revision: number;
    review_status: DraftBoardSummary["reviewStatus"];
  } | undefined;
  if (!scope) return null;
  const rows = getDb().prepare(
    `SELECT board.id, board.priority_id, priority.name AS priority_name,
            board.display_title, board.review_status,
            statement.id AS statement_id, statement.statement_text,
            kpi.id AS kpi_id, kpi.name AS kpi_name
     FROM board_reporting_priorities board
     JOIN categories priority ON priority.id = board.priority_id
     LEFT JOIN board_reporting_statements statement
       ON statement.board_priority_id = board.id
      AND statement.archived_at IS NULL
     LEFT JOIN board_reporting_statement_kpis link
       ON link.statement_id = statement.id
     LEFT JOIN kpis kpi
       ON kpi.id = link.kpi_id
      AND kpi.archived_at IS NULL AND kpi.is_active = 1
     WHERE board.scope_id = ? AND board.archived_at IS NULL
     ORDER BY board.display_order, board.id, statement.display_order,
              statement.id, link.display_order, kpi.id`,
  ).all(scope.id) as Array<Record<string, unknown>>;
  const priorities = new Map<number, DraftBoardSummary["priorities"][number]>();
  for (const row of rows) {
    const boardPriorityId = Number(row.id);
    let priority = priorities.get(boardPriorityId);
    if (!priority) {
      priority = {
        id: boardPriorityId,
        priorityId: Number(row.priority_id),
        priorityName: String(row.priority_name),
        displayTitle: String(row.display_title),
        reviewStatus: row.review_status as "needs_review" | "approved",
        statements: [],
      };
      priorities.set(boardPriorityId, priority);
    }
    if (row.statement_id === null) continue;
    const statementId = Number(row.statement_id);
    let statement = priority.statements.find(
      (candidate) => candidate.id === statementId,
    );
    if (!statement) {
      statement = {
        id: statementId,
        text: String(row.statement_text),
        measures: [],
      };
      priority.statements.push(statement);
    }
    if (row.kpi_id !== null) {
      statement.measures.push({
        id: Number(row.kpi_id),
        name: String(row.kpi_name),
      });
    }
  }
  return {
    revision: scope.revision,
    reviewStatus: scope.review_status,
    priorities: [...priorities.values()],
  };
}

/** Loads every unresolved Draft question and its explicit Admin classification. */
function loadDraftQuestions(planId: number): DraftQuestionSummary[] {
  const rows = getDb().prepare(
    `SELECT question.item_kind, question.item_id, question.item_name,
            question.unresolved_question, question.updated_at,
            decision.classification, decision.explanation
     FROM (
       SELECT 'goal' AS item_kind, goal.id AS item_id, goal.name AS item_name,
              goal.unresolved_question, goal.updated_at
       FROM strategic_goals goal
       JOIN categories priority ON priority.id = goal.priority_id
       WHERE priority.plan_id = ? AND goal.archived_at IS NULL
         AND goal.unresolved_question IS NOT NULL
       UNION ALL
       SELECT 'measurement_config', configuration.id, kpi.name,
              configuration.unresolved_question, configuration.updated_at
       FROM kpi_measurement_configs configuration
       JOIN kpis kpi ON kpi.id = configuration.kpi_id
       JOIN categories priority ON priority.id = kpi.category_id
       WHERE priority.plan_id = ? AND configuration.archived_at IS NULL
         AND configuration.unresolved_question IS NOT NULL
       UNION ALL
       SELECT 'component', component.id, component.label,
              component.unresolved_question, component.updated_at
       FROM kpi_components component
       JOIN kpis kpi ON kpi.id = component.kpi_id
       JOIN categories priority ON priority.id = kpi.category_id
       WHERE priority.plan_id = ? AND component.archived_at IS NULL
         AND component.unresolved_question IS NOT NULL
     ) question
     LEFT JOIN plan_question_decisions decision
       ON decision.plan_id = ?
      AND decision.item_kind = question.item_kind
      AND decision.item_id = question.item_id
     ORDER BY question.item_kind, question.item_name, question.item_id`,
  ).all(planId, planId, planId, planId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    itemKind: row.item_kind as DraftQuestionSummary["itemKind"],
    itemId: Number(row.item_id),
    itemName: String(row.item_name),
    question: String(row.unresolved_question),
    updatedAt: String(row.updated_at),
    classification:
      row.classification === null
        ? null
        : row.classification as DraftQuestionSummary["classification"],
    explanation:
      row.explanation === null ? null : String(row.explanation),
  }));
}

/** Loads immediate-predecessor choices for explicit redesigned-item lineage. */
function loadLineageSources(
  predecessorPlanId: number | null,
): PlanLineageSource[] {
  if (predecessorPlanId === null) return [];
  const rows = getDb().prepare(
    `SELECT 'priority' AS item_kind, priority.id AS item_id,
            priority.name AS item_name, priority.name AS context
     FROM categories priority
     WHERE priority.plan_id = ? AND priority.archived_at IS NULL
     UNION ALL
     SELECT 'goal', goal.id, goal.name, priority.name
     FROM strategic_goals goal
     JOIN categories priority ON priority.id = goal.priority_id
     WHERE priority.plan_id = ? AND goal.archived_at IS NULL
     UNION ALL
     SELECT 'kpi', kpi.id, kpi.name, priority.name
     FROM kpis kpi
     JOIN categories priority ON priority.id = kpi.category_id
     WHERE priority.plan_id = ? AND kpi.archived_at IS NULL
     ORDER BY item_kind, context, item_name, item_id`,
  ).all(
    predecessorPlanId,
    predecessorPlanId,
    predecessorPlanId,
  ) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    itemKind: row.item_kind as PlanLineageSource["itemKind"],
    itemId: Number(row.item_id),
    itemName: String(row.item_name),
    context: String(row.context),
  }));
}

/** Loads the complete Admin Plans workspace. */
export function getPlanManagerModel(): PlanManagerModel {
  const plans = listStrategicPlans();
  const active = plans.find((plan) => plan.lifecycleState === "active");
  if (!active) {
    throw new PlanLifecycleConflictError(
      "Plan integrity needs operator attention. Setup → Plans is unavailable.",
      "invalid_state",
    );
  }
  const draft =
    plans.find(
      (plan) =>
        plan.lifecycleState === "draft" && plan.cancelledAt === null,
    ) ?? null;
  const sectionReviews = draft
    ? (getDb()
        .prepare(
          `SELECT section, review_status, predecessor_revision, reviewed_at,
                  updated_at
           FROM plan_section_reviews
           WHERE plan_id = ?
           ORDER BY CASE section
             WHEN 'plan_details' THEN 1
             WHEN 'plan_structure' THEN 2
             ELSE 3
           END`,
        )
        .all(draft.id) as Array<Record<string, unknown>>).map(
        (row): PlanSectionReview => ({
          section: row.section as PlanSectionReview["section"],
          status: row.review_status as PlanSectionReview["status"],
          predecessorRevision:
            row.predecessor_revision === null
              ? null
              : Number(row.predecessor_revision),
          reviewedAt:
            row.reviewed_at === null ? null : String(row.reviewed_at),
          updatedAt: String(row.updated_at),
        }),
      )
    : [];
  const lineage = draft
    ? (getDb()
        .prepare(
          `SELECT id, item_kind, successor_item_id, predecessor_item_id,
                  relationship_type, predecessor_name_snapshot,
                  predecessor_context_json
           FROM successor_lineage
           WHERE successor_plan_id = ?
           ORDER BY item_kind, successor_item_id, id`,
        )
        .all(draft.id) as Array<Record<string, unknown>>).map(
        (row): PlanLineageDisclosure => ({
          id: Number(row.id),
          itemKind: String(row.item_kind),
          successorItemId: Number(row.successor_item_id),
          predecessorItemId: Number(row.predecessor_item_id),
          relationshipType:
            row.relationship_type as PlanLineageDisclosure["relationshipType"],
          predecessorName: String(row.predecessor_name_snapshot),
          predecessorContext: JSON.parse(
            String(row.predecessor_context_json),
          ) as Record<string, unknown>,
        }),
      )
    : [];
  return {
    active,
    draft,
    archived: plans.filter(
      (plan) => plan.lifecycleState === "archived",
    ),
    cancelled: plans.filter(
      (plan) => plan.lifecycleState === "cancelled",
    ),
    sectionReviews,
    lineage,
    lineageSources: draft
      ? loadLineageSources(draft.predecessorPlanId)
      : [],
    draftStructure: draft ? loadDraftStructure(draft.id, draft.startYear) : [],
    draftBoard: draft ? loadDraftBoard(draft.id) : null,
    draftQuestions: draft ? loadDraftQuestions(draft.id) : [],
    readiness: draft ? evaluateDraftReadiness(draft.id) : null,
    successorPlanningEnabled:
      process.env.SUCCESSOR_PLANS_ENABLED !== "false",
  };
}

/** Returns one Archived plan for request-scoped historical reporting. */
export function getArchivedPlan(planId: number): StrategicPlanSummary {
  const plan = mapPlan(planRow(planId));
  if (plan.lifecycleState !== "archived") {
    throw new PlanLifecycleNotFoundError(
      "That Archived Strategic Plan is not available.",
    );
  }
  return plan;
}

/** Exposes completed lifecycle evidence for the Admin Activity view. */
export function listPlanLifecycleEvents(options: {
  planId?: number;
  action?: string;
  limit?: number;
  offset?: number;
} = {}): PlanLifecycleEventRecord[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.planId !== undefined) {
    where.push("event.plan_id = ?");
    params.push(options.planId);
  }
  if (options.action !== undefined) {
    where.push("event.action = ?");
    params.push(options.action);
  }
  params.push(Math.min(Math.max(options.limit ?? 100, 1), 500));
  params.push(Math.max(options.offset ?? 0, 0));
  const rows = getDb()
    .prepare(
      `SELECT event.*, plan.name AS plan_name,
              predecessor.name AS predecessor_name
       FROM strategic_plan_lifecycle_events event
       LEFT JOIN strategic_plans plan ON plan.id = event.plan_id
       LEFT JOIN strategic_plans predecessor
         ON predecessor.id = event.predecessor_plan_id
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY event.occurred_at DESC, event.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: Number(row.id),
    eventId: String(row.event_id),
    planId: Number(row.plan_id),
    planName: String(row.plan_name),
    predecessorPlanId:
      row.predecessor_plan_id === null
        ? null
        : Number(row.predecessor_plan_id),
    predecessorName:
      row.predecessor_name === null ? null : String(row.predecessor_name),
    action: row.action as PlanLifecycleEventRecord["action"],
    beforeState:
      row.before_state === null
        ? null
        : row.before_state as PlanLifecycleEventRecord["beforeState"],
    afterState: row.after_state as PlanLifecycleEventRecord["afterState"],
    checkedPlanRevision:
      row.checked_plan_revision === null
        ? null
        : Number(row.checked_plan_revision),
    checkedPredecessorRevision:
      row.checked_predecessor_revision === null
        ? null
        : Number(row.checked_predecessor_revision),
    actorEmail:
      row.actor_email_snapshot === null
        ? null
        : String(row.actor_email_snapshot),
    activationId:
      row.activation_id === null ? null : String(row.activation_id),
    result: JSON.parse(String(row.result_json)) as Record<string, unknown>,
    occurredAt: String(row.occurred_at),
  }));
}

interface VerifiedBackup {
  backupId: string;
  path: string;
  sha256: string;
  size: number;
}

/** Hashes one backup without loading the complete database into memory. */
async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

/** Creates and independently verifies the consistent pre-activation backup. */
async function createVerifiedPreActivationBackup(input: {
  activationId: string;
  predecessorPlanId: number;
  successorPlanId: number;
}): Promise<VerifiedBackup> {
  const databasePath = resolveDbPath();
  const backupDirectory =
    process.env.PLAN_ACTIVATION_BACKUP_DIR ||
    path.join(path.dirname(databasePath), "plan-activation-backups");
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const backupId = `plan-activation-${input.activationId}`;
  const backupPath = path.join(backupDirectory, `${backupId}.sqlite`);
  if (fs.existsSync(backupPath)) {
    throw new PlanActivationBackupError(
      "Activation did not begin because its backup identity already exists. The Active plan and Draft are unchanged. Ask the system operator to inspect the retained activation records.",
    );
  }
  const source = new DatabaseSync(databasePath, {
    readOnly: true,
    timeout: 5_000,
  });
  try {
    await backup(source, backupPath);
  } finally {
    source.close();
  }
  try {
    fs.chmodSync(backupPath, 0o600);
    const verification = new DatabaseSync(backupPath, {
      readOnly: true,
      timeout: 5_000,
    });
    try {
      const quickCheck = verification.prepare("PRAGMA quick_check").all();
      if (
        quickCheck.length !== 1 ||
        !Object.values(quickCheck[0] ?? {}).includes("ok")
      ) {
        throw new Error("quick_check failed");
      }
      if (verification.prepare("PRAGMA foreign_key_check").all().length > 0) {
        throw new Error("foreign_key_check failed");
      }
      const schema = verification
        .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
        .get() as { value?: unknown } | undefined;
      if (Number(schema?.value) !== schemaVersionConfig.schemaVersion) {
        throw new Error("schema version mismatch");
      }
      const states = verification
        .prepare(
          `SELECT id, lifecycle_state FROM strategic_plans
           WHERE id IN (?, ?) ORDER BY id`,
        )
        .all(input.predecessorPlanId, input.successorPlanId) as Array<{
        id: number;
        lifecycle_state: string;
      }>;
      const predecessor = states.find(
        (row) => Number(row.id) === input.predecessorPlanId,
      );
      const successor = states.find(
        (row) => Number(row.id) === input.successorPlanId,
      );
      if (
        predecessor?.lifecycle_state !== "active" ||
        successor?.lifecycle_state !== "draft"
      ) {
        throw new Error("backup lifecycle state mismatch");
      }
    } finally {
      verification.close();
    }
    const stat = fs.statSync(backupPath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error("backup file missing");
    }
    return {
      backupId,
      path: backupPath,
      sha256: await sha256File(backupPath),
      size: stat.size,
    };
  } catch (error) {
    throw new PlanActivationBackupError(undefined, { cause: error });
  }
}

/** Updates durable pause and integrity markers through the internal seam. */
function setActivationSafetyState(input: {
  pause: boolean;
  internalWrite: boolean;
  integrityBlocked: boolean;
}): void {
  const statement = getDb().prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
  );
  statement.run(
    "plan_activation_write_pause",
    input.pause ? "1" : "0",
  );
  statement.run(
    "plan_activation_internal_write",
    input.internalWrite ? "1" : "0",
  );
  statement.run(
    "active_plan_integrity_blocked",
    input.integrityBlocked ? "1" : "0",
  );
}

/** Returns a previously committed activation as the authoritative outcome. */
function existingActivationResult(
  activationId: string,
  predecessorPlanId: number,
  successorPlanId: number,
): PlanActivationResult | null {
  const operation = getDb()
    .prepare(
      `SELECT * FROM plan_activation_operations
       WHERE activation_id = ?`,
    )
    .get(activationId) as Record<string, unknown> | undefined;
  if (!operation) {
    const successor = getDb()
      .prepare(
        `SELECT id, predecessor_plan_id, activated_at
         FROM strategic_plans WHERE activation_id = ?`,
      )
      .get(activationId) as Record<string, unknown> | undefined;
    if (!successor) return null;
    if (
      Number(successor.id) !== successorPlanId ||
      Number(successor.predecessor_plan_id) !== predecessorPlanId
    ) {
      throw new PlanLifecycleConflictError(
        "That activation identity belongs to a different plan transition.",
        "activation_in_progress",
      );
    }
    return {
      activationId,
      predecessorPlanId,
      successorPlanId,
      status: "verified",
      committedAt: String(successor.activated_at),
      verifiedAt: null,
      idempotent: true,
    };
  }
  if (
    Number(operation.predecessor_plan_id) !== predecessorPlanId ||
    Number(operation.successor_plan_id) !== successorPlanId
  ) {
    throw new PlanLifecycleConflictError(
      "That activation identity belongs to a different plan transition.",
      "activation_in_progress",
    );
  }
  const phase = String(operation.phase);
  if (
    phase === "verified" ||
    phase === "committed_unverified" ||
    phase === "verification_failed"
  ) {
    return {
      activationId,
      predecessorPlanId,
      successorPlanId,
      status:
        phase === "verified"
          ? "verified"
          : "committed_verification_failed",
      committedAt: String(operation.committed_at),
      verifiedAt:
        operation.verified_at === null
          ? null
          : String(operation.verified_at),
      idempotent: true,
    };
  }
  throw new PlanLifecycleConflictError(
    "This activation is already being checked. Wait a moment, then refresh Plans.",
    "activation_in_progress",
  );
}

/** Verifies the committed lifecycle state through fresh read-only queries. */
function verifyCommittedActivation(input: {
  activationId: string;
  predecessorPlanId: number;
  successorPlanId: number;
}): void {
  const db = getDb();
  const active = db
    .prepare(
      `SELECT id FROM strategic_plans
       WHERE lifecycle_state = 'active' AND archived_at IS NULL`,
    )
    .all();
  if (
    active.length !== 1 ||
    Number(active[0].id) !== input.successorPlanId
  ) {
    throw new Error("single Active plan verification failed");
  }
  const predecessor = db
    .prepare(
      `SELECT lifecycle_state, status, archived_at
       FROM strategic_plans WHERE id = ?`,
    )
    .get(input.predecessorPlanId) as Record<string, unknown> | undefined;
  const successor = db
    .prepare(
      `SELECT lifecycle_state, status, activation_id
       FROM strategic_plans WHERE id = ?`,
    )
    .get(input.successorPlanId) as Record<string, unknown> | undefined;
  if (
    predecessor?.lifecycle_state !== "archived" ||
    predecessor.status !== "archived" ||
    predecessor.archived_at === null ||
    successor?.lifecycle_state !== "active" ||
    successor.status !== "active" ||
    successor.activation_id !== input.activationId
  ) {
    throw new Error("plan state verification failed");
  }
  const scope = db
    .prepare("SELECT id FROM board_reporting_scopes WHERE plan_id = ?")
    .get(input.successorPlanId);
  if (!scope) throw new Error("Board scope verification failed");
  const lifecycleEvents = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM strategic_plan_lifecycle_events
           WHERE activation_id = ? AND action IN ('archive','activate')`,
        )
        .get(input.activationId) as { count: number }
    ).count,
  );
  if (lifecycleEvents !== 2) {
    throw new Error("activation audit verification failed");
  }
  if (db.prepare("PRAGMA foreign_key_check").all().length > 0) {
    throw new Error("foreign-key verification failed");
  }
}

/**
 * Creates a verified backup, performs one atomic and idempotent activation,
 * verifies the committed state, and releases the write pause only on success.
 */
export async function activateDraft(
  input: ActivateDraftInput,
  actorId: number,
): Promise<PlanActivationResult> {
  const parsed = ActivateDraftSchema.parse(input);
  const initialDraft = mapPlan(planRow(parsed.planId));
  if (initialDraft.predecessorPlanId === null) {
    throw new PlanLifecycleValidationError(
      "This Draft does not have the required predecessor relationship.",
    );
  }
  const priorResult = existingActivationResult(
    parsed.activationId,
    initialDraft.predecessorPlanId,
    initialDraft.id,
  );
  if (priorResult) return priorResult;
  requireCurrentDraft(
    parsed.planId,
    parsed.expectedWholePlanRevision,
  );
  if (parsed.confirmationName !== initialDraft.name) {
    throw new PlanLifecycleConflictError(
      "Enter the successor plan name exactly as shown to confirm activation.",
      "confirmation_mismatch",
    );
  }
  const initialReadiness = evaluateDraftReadiness(initialDraft.id);
  if (!initialReadiness.canActivate) {
    throw new PlanLifecycleValidationError(
      "This Draft still needs attention before activation.",
      [...initialReadiness.hardRules, ...initialReadiness.requirements],
    );
  }
  if (
    (initialReadiness.warnings.length > 0 ||
      initialReadiness.requirements.some((item) => item.overridden)) &&
    !parsed.acknowledgeWarnings
  ) {
    throw new PlanLifecycleValidationError(
      "Review and acknowledge every visible warning and readiness override before activation.",
      initialReadiness.warnings,
    );
  }

  transaction(() => {
    const pause = getDb()
      .prepare(
        "SELECT value FROM meta WHERE key = 'plan_activation_write_pause'",
      )
      .get() as { value?: string } | undefined;
    if (pause?.value === "1") {
      throw new PlanLifecycleConflictError(
        "Another activation is already pausing saves. Wait a moment, then refresh Plans.",
        "activation_in_progress",
      );
    }
    getDb()
      .prepare(
        `INSERT INTO plan_activation_operations (
           activation_id, predecessor_plan_id, successor_plan_id,
           requested_revision, phase, warning_snapshot_json,
           override_snapshot_json, requested_by
         ) VALUES (?, ?, ?, ?, 'pausing', ?, ?, ?)`,
      )
      .run(
        parsed.activationId,
        initialDraft.predecessorPlanId,
        initialDraft.id,
        parsed.expectedWholePlanRevision,
        JSON.stringify(initialReadiness.warnings),
        JSON.stringify(
          initialReadiness.requirements.filter((item) => item.overridden),
        ),
        actorId,
      );
    setActivationSafetyState({
      pause: true,
      internalWrite: false,
      integrityBlocked: false,
    });
  });

  let verifiedBackup: VerifiedBackup;
  try {
    verifiedBackup = await createVerifiedPreActivationBackup({
      activationId: parsed.activationId,
      predecessorPlanId: initialDraft.predecessorPlanId,
      successorPlanId: initialDraft.id,
    });
    transaction(() => {
      getDb()
        .prepare(
          `UPDATE plan_activation_operations
           SET phase = 'backup_verified', backup_id = ?, backup_path = ?,
               backup_sha256 = ?, backup_size = ?,
               updated_at = datetime('now')
           WHERE activation_id = ? AND phase = 'pausing'`,
        )
        .run(
          verifiedBackup.backupId,
          verifiedBackup.path,
          verifiedBackup.sha256,
          verifiedBackup.size,
          parsed.activationId,
        );
    });
  } catch (error) {
    transaction(() => {
      setActivationSafetyState({
        pause: false,
        internalWrite: true,
        integrityBlocked: false,
      });
      getDb()
        .prepare(
          `UPDATE plan_activation_operations
           SET phase = 'failed_precommit', failure_code = 'backup_failed',
               updated_at = datetime('now')
           WHERE activation_id = ?`,
        )
        .run(parsed.activationId);
      setActivationSafetyState({
        pause: false,
        internalWrite: false,
        integrityBlocked: false,
      });
    });
    if (error instanceof PlanActivationBackupError) throw error;
    throw new PlanActivationBackupError();
  }

  let committedAt = "";
  try {
    transaction(() => {
      setActivationSafetyState({
        pause: true,
        internalWrite: true,
        integrityBlocked: false,
      });
      const user = getDb()
        .prepare(
          `SELECT role, disabled, must_change_password
           FROM users WHERE id = ?`,
        )
        .get(actorId) as Record<string, unknown> | undefined;
      if (
        !user ||
        user.role !== "admin" ||
        Number(user.disabled) !== 0 ||
        Number(user.must_change_password) !== 0
      ) {
        throw new PlanLifecycleConflictError(
          "Your Admin access changed before activation. Sign in again and review the Draft.",
          "invalid_state",
        );
      }
      const draft = requireCurrentDraft(
        parsed.planId,
        parsed.expectedWholePlanRevision,
      );
      const predecessor = mapPlan(planRow(initialDraft.predecessorPlanId!));
      if (predecessor.lifecycleState !== "active") {
        throw new PlanLifecycleConflictError(
          "The Active plan changed before activation. Refresh Plans and review the transition.",
          "stale_revision",
        );
      }
      const readiness = evaluateDraftReadiness(draft.id);
      if (!readiness.canActivate) {
        throw new PlanLifecycleValidationError(
          "The latest Draft revision is not ready for activation.",
          [...readiness.hardRules, ...readiness.requirements],
        );
      }
      if (
        (readiness.warnings.length > 0 ||
          readiness.requirements.some((item) => item.overridden)) &&
        !parsed.acknowledgeWarnings
      ) {
        throw new PlanLifecycleValidationError(
          "Review and acknowledge the latest warnings before activation.",
          readiness.warnings,
        );
      }
      committedAt = new Date().toISOString();
      const archived = getDb()
        .prepare(
          `UPDATE strategic_plans
           SET status = 'archived', lifecycle_state = 'archived',
               archived_at = ?, updated_by = ?, updated_at = datetime('now')
           WHERE id = ? AND lifecycle_state = 'active'`,
        )
        .run(committedAt, actorId, predecessor.id);
      const activated = getDb()
        .prepare(
          `UPDATE strategic_plans
           SET status = 'active', lifecycle_state = 'active',
               activated_at = ?, activation_id = ?, updated_by = ?,
               updated_at = datetime('now')
           WHERE id = ? AND lifecycle_state = 'draft'
             AND whole_plan_revision = ?`,
        )
        .run(
          committedAt,
          parsed.activationId,
          actorId,
          draft.id,
          draft.wholePlanRevision,
        );
      if (archived.changes !== 1 || activated.changes !== 1) {
        throw new PlanLifecycleConflictError(
          "The plans changed before activation could commit. Refresh and review them again.",
          "stale_revision",
        );
      }
      recordLifecycleEvent({
        planId: predecessor.id,
        predecessorPlanId: predecessor.predecessorPlanId,
        action: "archive",
        beforeState: "active",
        afterState: "archived",
        checkedPlanRevision: predecessor.wholePlanRevision,
        checkedPredecessorRevision: null,
        confirmationText: parsed.confirmationName,
        result: {
          archived_by_activation: parsed.activationId,
          successor_plan_id: draft.id,
        },
        actorId,
        activationId: parsed.activationId,
      });
      recordLifecycleEvent({
        planId: draft.id,
        predecessorPlanId: predecessor.id,
        action: "activate",
        beforeState: "draft",
        afterState: "active",
        checkedPlanRevision: draft.wholePlanRevision,
        checkedPredecessorRevision: predecessor.wholePlanRevision,
        confirmationText: parsed.confirmationName,
        result: {
          activation_id: parsed.activationId,
          predecessor_plan_id: predecessor.id,
          backup_id: verifiedBackup.backupId,
          warnings: readiness.warnings,
          overrides: readiness.requirements.filter(
            (item) => item.overridden,
          ),
        },
        actorId,
        activationId: parsed.activationId,
      });
      getDb()
        .prepare(
          `UPDATE plan_readiness_overrides
           SET activation_id = ?, activated_at = ?
           WHERE plan_id = ? AND resolved_at IS NULL`,
        )
        .run(
          parsed.activationId,
          committedAt,
          draft.id,
        );
      const activeCount = Number(
        (
          getDb()
            .prepare(
              `SELECT COUNT(*) AS count FROM strategic_plans
               WHERE organization_id = ? AND lifecycle_state = 'active'`,
            )
            .get(draft.organizationId) as { count: number }
        ).count,
      );
      if (activeCount !== 1) {
        throw new PlanLifecycleConflictError(
          "Activation stopped because exactly one Active plan could not be preserved.",
          "invalid_state",
        );
      }
      const writeWitness = getDb()
        .prepare(
          "SELECT value FROM meta WHERE key = 'authoritative_write_counter'",
        )
        .get() as { value?: string } | undefined;
      const committedWriteCounter = Number(writeWitness?.value);
      if (
        !Number.isSafeInteger(committedWriteCounter) ||
        committedWriteCounter < 0
      ) {
        throw new PlanLifecycleConflictError(
          "Activation stopped because the recovery write witness is unavailable.",
          "invalid_state",
        );
      }
      getDb()
        .prepare(
          `UPDATE plan_activation_operations
           SET phase = 'committed_unverified', committed_at = ?,
               committed_write_counter = ?,
               updated_at = datetime('now')
           WHERE activation_id = ? AND phase = 'backup_verified'`,
        )
        .run(committedAt, committedWriteCounter, parsed.activationId);
      setActivationSafetyState({
        pause: true,
        internalWrite: false,
        integrityBlocked: false,
      });
    });
  } catch (error) {
    transaction(() => {
      setActivationSafetyState({
        pause: false,
        internalWrite: true,
        integrityBlocked: false,
      });
      getDb()
        .prepare(
          `UPDATE plan_activation_operations
           SET phase = 'failed_precommit',
               failure_code = 'activation_validation_failed',
               updated_at = datetime('now')
           WHERE activation_id = ?
             AND phase IN ('pausing','backup_verified')`,
        )
        .run(parsed.activationId);
      setActivationSafetyState({
        pause: false,
        internalWrite: false,
        integrityBlocked: false,
      });
    });
    throw error;
  }

  try {
    verifyCommittedActivation({
      activationId: parsed.activationId,
      predecessorPlanId: initialDraft.predecessorPlanId,
      successorPlanId: initialDraft.id,
    });
    const verifiedAt = new Date().toISOString();
    transaction(() => {
      setActivationSafetyState({
        pause: true,
        internalWrite: true,
        integrityBlocked: false,
      });
      getDb()
        .prepare(
          `UPDATE plan_activation_operations
           SET phase = 'verified', verified_at = ?,
               updated_at = datetime('now')
           WHERE activation_id = ? AND phase = 'committed_unverified'`,
        )
        .run(verifiedAt, parsed.activationId);
      setActivationSafetyState({
        pause: false,
        internalWrite: false,
        integrityBlocked: false,
      });
    });
    return {
      activationId: parsed.activationId,
      predecessorPlanId: initialDraft.predecessorPlanId,
      successorPlanId: initialDraft.id,
      status: "verified",
      committedAt,
      verifiedAt,
      idempotent: false,
    };
  } catch {
    transaction(() => {
      setActivationSafetyState({
        pause: true,
        internalWrite: true,
        integrityBlocked: true,
      });
      getDb()
        .prepare(
          `UPDATE plan_activation_operations
           SET phase = 'verification_failed',
               failure_code = 'post_activation_verification_failed',
               updated_at = datetime('now')
           WHERE activation_id = ?`,
        )
        .run(parsed.activationId);
      setActivationSafetyState({
        pause: true,
        internalWrite: false,
        integrityBlocked: true,
      });
    });
    throw new PlanActivationCommittedVerificationError({
      activationId: parsed.activationId,
      predecessorPlanId: initialDraft.predecessorPlanId,
      successorPlanId: initialDraft.id,
      status: "committed_verification_failed",
      committedAt,
      verifiedAt: null,
      idempotent: false,
    });
  }
}

export type {
  PlanActivationResult,
  PlanManagerModel,
  PlanReadinessEvaluation,
  StrategicPlanSummary,
} from "./types";
