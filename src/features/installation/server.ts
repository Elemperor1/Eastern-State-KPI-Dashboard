import { z } from "@/lib/zod";
import { getDb, transaction } from "@/lib/db";
import { recordStrategicAuditEvent } from "@/features/strategy/server";
import type { ActiveInstallation, InstallationAuditEvent } from "./types";
import { PlanSettingsUpdateSchema } from "./validation";

export type { ActiveInstallation, InstallationAuditEvent } from "./types";

const SlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const NameSchema = z.string().trim().min(1).max(200);
const ShortNameSchema = z.string().trim().min(1).max(80);
const OptionalTextSchema = z.string().trim().min(1).max(4_000).nullable();
const YearSchema = z.number().int().min(1900).max(2100);

const BootstrapSchema = z.object({
  organization: z.object({
    slug: SlugSchema,
    name: NameSchema,
    shortName: ShortNameSchema,
  }),
  plan: z
    .object({
      slug: SlugSchema,
      name: NameSchema,
      description: OptionalTextSchema,
      startYear: YearSchema,
      endYear: YearSchema,
      sourceReference: OptionalTextSchema,
    })
    .refine((plan) => plan.startYear <= plan.endYear, {
      path: ["endYear"],
      message: "Plan end year must be on or after its start year.",
    }),
});

export class InstallationNotConfiguredError extends Error {
  constructor(message = "The active installation and strategic plan are not configured.") {
    super(message);
    this.name = "InstallationNotConfiguredError";
  }
}

export class InstallationEditConflictError extends Error {
  constructor() {
    super("The strategic plan changed after this form was loaded. Refresh and try again.");
    this.name = "InstallationEditConflictError";
  }
}

export class InstallationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallationValidationError";
  }
}

interface InstallationRow extends Record<string, unknown> {
  organization_id: number;
  organization_slug: string;
  organization_name: string;
  organization_short_name: string;
  organization_status: "active";
  organization_updated_at: string;
  plan_id: number;
  plan_organization_id: number;
  plan_slug: string;
  plan_name: string;
  plan_description: string | null;
  plan_start_year: number;
  plan_end_year: number;
  plan_status: "active";
  plan_revision: number;
  plan_source_reference: string | null;
  plan_updated_at: string;
}

function reportingYears(startYear: number, endYear: number): number[] {
  return Array.from(
    { length: endYear - startYear + 1 },
    (_, index) => startYear + index,
  );
}

function mapInstallation(row: InstallationRow): ActiveInstallation {
  return {
    organization: {
      id: Number(row.organization_id),
      slug: String(row.organization_slug),
      name: String(row.organization_name),
      shortName: String(row.organization_short_name),
      status: "active",
      updatedAt: String(row.organization_updated_at),
    },
    plan: {
      id: Number(row.plan_id),
      organizationId: Number(row.plan_organization_id),
      slug: String(row.plan_slug),
      name: String(row.plan_name),
      description:
        row.plan_description === null ? null : String(row.plan_description),
      startYear: Number(row.plan_start_year),
      endYear: Number(row.plan_end_year),
      status: "active",
      revision: Number(row.plan_revision),
      sourceReference:
        row.plan_source_reference === null
          ? null
          : String(row.plan_source_reference),
      updatedAt: String(row.plan_updated_at),
    },
    years: reportingYears(
      Number(row.plan_start_year),
      Number(row.plan_end_year),
    ),
  };
}

function activeInstallationRows(): InstallationRow[] {
  return getDb()
    .prepare(
      `SELECT
         organization.id AS organization_id,
         organization.slug AS organization_slug,
         organization.name AS organization_name,
         organization.short_name AS organization_short_name,
         organization.status AS organization_status,
         organization.updated_at AS organization_updated_at,
         plan.id AS plan_id,
         plan.organization_id AS plan_organization_id,
         plan.slug AS plan_slug,
         plan.name AS plan_name,
         plan.description AS plan_description,
         plan.start_year AS plan_start_year,
         plan.end_year AS plan_end_year,
         plan.status AS plan_status,
         plan.revision AS plan_revision,
         plan.source_reference AS plan_source_reference,
         plan.updated_at AS plan_updated_at
       FROM strategic_plans plan
       JOIN organizations organization ON organization.id = plan.organization_id
       WHERE plan.status = 'active' AND plan.archived_at IS NULL
         AND organization.status = 'active' AND organization.archived_at IS NULL
       ORDER BY organization.id, plan.id`,
    )
    .all() as InstallationRow[];
}

export function getActiveInstallation(): ActiveInstallation {
  const rows = activeInstallationRows();
  if (rows.length !== 1) {
    throw new InstallationNotConfiguredError(
      rows.length === 0
        ? undefined
        : "The single-installation product requires exactly one active strategic plan.",
    );
  }
  return mapInstallation(rows[0]);
}

function auditSnapshot(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function actorEmail(actorId: number | null): string | null {
  if (actorId === null) return null;
  const row = getDb().prepare("SELECT email FROM users WHERE id = ?").get(actorId) as
    | { email?: string }
    | undefined;
  return row?.email ? String(row.email) : null;
}

function recordInstallationAudit(input: {
  entityType: "organization" | "strategic_plan";
  entityId: number;
  eventType: "create" | "update" | "archive" | "restore";
  entityDisplayName: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  actorId: number | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO installation_audit_events (
         entity_type, entity_id, event_type, entity_display_name,
         previous_value_json, new_value_json, actor_id, actor_email_snapshot
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.entityType,
      input.entityId,
      input.eventType,
      input.entityDisplayName,
      input.previousValue === null ? null : auditSnapshot(input.previousValue),
      input.newValue === null ? null : auditSnapshot(input.newValue),
      input.actorId,
      actorEmail(input.actorId),
    );
}

export function bootstrapInstallation(
  input: z.input<typeof BootstrapSchema>,
): { created: boolean; installation: ActiveInstallation } {
  const parsed = BootstrapSchema.parse(input);
  return transaction(() => {
    const db = getDb();
    const existingCount = Number(
      (
        db
          .prepare(
            `SELECT
               (SELECT COUNT(*) FROM organizations) +
               (SELECT COUNT(*) FROM strategic_plans) AS count`,
          )
          .get() as { count: number }
      ).count,
    );
    if (existingCount > 0) {
      return { created: false, installation: getActiveInstallation() };
    }

    const organizationId = Number(
      db
        .prepare(
          `INSERT INTO organizations (slug, name, short_name, status)
           VALUES (?, ?, ?, 'active')`,
        )
        .run(
          parsed.organization.slug,
          parsed.organization.name,
          parsed.organization.shortName,
        ).lastInsertRowid,
    );
    const planId = Number(
      db
        .prepare(
          `INSERT INTO strategic_plans (
             organization_id, slug, name, description, start_year, end_year,
             status, source_reference
           ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
        )
        .run(
          organizationId,
          parsed.plan.slug,
          parsed.plan.name,
          parsed.plan.description,
          parsed.plan.startYear,
          parsed.plan.endYear,
          parsed.plan.sourceReference,
        ).lastInsertRowid,
    );
    recordInstallationAudit({
      entityType: "organization",
      entityId: organizationId,
      eventType: "create",
      entityDisplayName: parsed.organization.name,
      previousValue: null,
      newValue: {
        slug: parsed.organization.slug,
        name: parsed.organization.name,
        short_name: parsed.organization.shortName,
        status: "active",
      },
      actorId: null,
    });
    recordInstallationAudit({
      entityType: "strategic_plan",
      entityId: planId,
      eventType: "create",
      entityDisplayName: parsed.plan.name,
      previousValue: null,
      newValue: {
        organization_id: organizationId,
        slug: parsed.plan.slug,
        name: parsed.plan.name,
        description: parsed.plan.description,
        start_year: parsed.plan.startYear,
        end_year: parsed.plan.endYear,
        status: "active",
        source_reference: parsed.plan.sourceReference,
      },
      actorId: null,
    });
    return { created: true, installation: getActiveInstallation() };
  });
}

function assertPlanRangeCanChange(
  planId: number,
  startYear: number,
  endYear: number,
): void {
  const db = getDb();
  const checks: Array<{ label: string; query: string; params?: unknown[] }> = [
    {
      label: "Strategic Goal effective ranges",
      query:
        `SELECT COUNT(*) AS count
         FROM strategic_goals goal
         JOIN categories category ON category.id = goal.priority_id
         WHERE category.plan_id = ?
           AND goal.archived_at IS NULL
           AND goal.configuration_status <> 'archived'
           AND (goal.plan_start_year < ? OR goal.plan_end_year > ?)`,
      params: [planId, startYear, endYear],
    },
    {
      label: "Goal memberships",
      query:
        `SELECT COUNT(*) AS count
         FROM goal_kpis membership
         JOIN strategic_goals goal ON goal.id = membership.goal_id
         JOIN categories category ON category.id = goal.priority_id
         WHERE membership.archived_at IS NULL
           AND category.plan_id = ?
           AND goal.archived_at IS NULL
           AND goal.configuration_status <> 'archived'
           AND (membership.effective_from_year < ? OR
                COALESCE(membership.effective_to_year, ?) > ?)`,
      params: [planId, startYear, endYear, endYear],
    },
    {
      label: "Measurement configurations",
      query:
        `SELECT COUNT(*) AS count
         FROM kpi_measurement_configs configuration
         JOIN kpis kpi ON kpi.id = configuration.kpi_id
         JOIN categories category ON category.id = kpi.category_id
         WHERE category.plan_id = ?
           AND configuration.archived_at IS NULL
           AND configuration.configuration_status <> 'archived'
           AND (configuration.effective_from_year < ? OR
                COALESCE(configuration.effective_to_year, ?) > ?)`,
      params: [planId, startYear, endYear, endYear],
    },
    {
      label: "Strategic observations",
      query:
        `SELECT COUNT(*) AS count
         FROM kpi_observations observation
         JOIN kpis kpi ON kpi.id = observation.kpi_id
         JOIN categories category ON category.id = kpi.category_id
         WHERE category.plan_id = ?
           AND (observation.year < ? OR observation.year > ?)`,
      params: [planId, startYear, endYear],
    },
    {
      label: "Component entries",
      query:
        `SELECT COUNT(*) AS count
         FROM kpi_component_entries entry
         JOIN kpi_components component ON component.id = entry.component_id
         JOIN kpis kpi ON kpi.id = component.kpi_id
         JOIN categories category ON category.id = kpi.category_id
         WHERE category.plan_id = ?
           AND (entry.year < ? OR entry.year > ?)`,
      params: [planId, startYear, endYear],
    },
    {
      label: "Distribution observations",
      query:
        `SELECT COUNT(*) AS count
         FROM distribution_observations observation
         JOIN kpis kpi ON kpi.id = observation.kpi_id
         JOIN categories category ON category.id = kpi.category_id
         WHERE category.plan_id = ?
           AND (observation.year < ? OR observation.year > ?)`,
      params: [planId, startYear, endYear],
    },
    {
      label: "Distribution band effective ranges",
      query:
        `SELECT COUNT(*) AS count
         FROM distribution_bands band
         JOIN kpis kpi ON kpi.id = band.kpi_id
         JOIN categories category ON category.id = kpi.category_id
         WHERE category.plan_id = ?
           AND band.archived_at IS NULL
           AND (band.effective_from_year < ? OR
                (band.effective_to_year IS NOT NULL AND band.effective_to_year > ?))`,
      params: [planId, startYear, endYear],
    },
    {
      label: "Plan-scoped targets",
      query:
        `SELECT COUNT(*) AS count
         FROM kpi_targets target
         LEFT JOIN kpi_components component ON component.id = target.component_id
         JOIN kpis kpi ON kpi.id = COALESCE(target.kpi_id, component.kpi_id)
         JOIN categories category ON category.id = kpi.category_id
         WHERE category.plan_id = ?
           AND target.archived_at IS NULL
           AND target.configuration_status <> 'archived'
           AND target.external_target_year = 0
           AND (target.target_year < ? OR target.target_year > ? OR
                (target.reporting_year IS NOT NULL AND
                 (target.reporting_year < ? OR target.reporting_year > ?)) OR
                (target.baseline_year IS NOT NULL AND
                 (target.baseline_year < ? OR target.baseline_year > ? OR
                  target.baseline_year >= target.target_year)))`,
      params: [
        planId,
        startYear,
        endYear,
        startYear,
        endYear,
        startYear,
        endYear,
      ],
    },
  ];
  const conflicts = checks.flatMap((check) => {
    const row = db.prepare(check.query).get(...(check.params ?? [])) as {
      count: number;
    };
    return Number(row.count) > 0 ? [check.label] : [];
  });
  if (conflicts.length > 0) {
    throw new InstallationValidationError(
      `The plan range cannot exclude persisted ${conflicts.join(", ")}.`,
    );
  }
}

function extendPlanBoundaryCoverage(
  current: ActiveInstallation,
  startYear: number,
  endYear: number,
  actorId: number,
  sourceReference: string | null,
): void {
  const extendsStart = startYear < current.plan.startYear;
  const extendsEnd = endYear > current.plan.endYear;
  if (!extendsStart && !extendsEnd) return;

  const db = getDb();
  const goals = db
    .prepare(
      `SELECT goal.*, category.name AS priority_name
       FROM strategic_goals goal
       JOIN categories category ON category.id = goal.priority_id
       WHERE category.plan_id = ?
         AND goal.archived_at IS NULL
         AND goal.configuration_status <> 'archived'
       ORDER BY goal.id`,
    )
    .all(current.plan.id) as Record<string, unknown>[];
  const startExtendedGoalIds = new Set<number>();
  const endExtendedGoalIds = new Set<number>();

  for (const goal of goals) {
    const goalId = Number(goal.id);
    const previousStart = Number(goal.plan_start_year);
    const previousEnd = Number(goal.plan_end_year);
    const nextStart =
      extendsStart && previousStart === current.plan.startYear
        ? startYear
        : previousStart;
    const nextEnd =
      extendsEnd && previousEnd === current.plan.endYear
        ? endYear
        : previousEnd;
    if (nextStart === previousStart && nextEnd === previousEnd) continue;

    db.prepare(
      `UPDATE strategic_goals
       SET plan_start_year = ?, plan_end_year = ?, updated_by = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(nextStart, nextEnd, actorId, goalId);
    if (nextStart !== previousStart) startExtendedGoalIds.add(goalId);
    if (nextEnd !== previousEnd) endExtendedGoalIds.add(goalId);
    recordStrategicAuditEvent({
      entity_type: "strategic_goal",
      entity_id: goalId,
      event_type: "update",
      entity_display_name: String(goal.name),
      parent_priority_name: String(goal.priority_name),
      previous_value: {
        plan_start_year: previousStart,
        plan_end_year: previousEnd,
      },
      new_value: {
        plan_start_year: nextStart,
        plan_end_year: nextEnd,
      },
      actor_id: actorId,
      source_reference: sourceReference,
    });
  }

  if (startExtendedGoalIds.size === 0 && endExtendedGoalIds.size === 0) return;
  const memberships = db
    .prepare(
      `SELECT membership.*, goal.name AS goal_name,
              category.name AS priority_name, kpi.name AS kpi_name
       FROM goal_kpis membership
       JOIN strategic_goals goal ON goal.id = membership.goal_id
       JOIN categories category ON category.id = goal.priority_id
       JOIN kpis kpi ON kpi.id = membership.kpi_id
       WHERE category.plan_id = ?
         AND membership.archived_at IS NULL
         AND goal.archived_at IS NULL
         AND goal.configuration_status <> 'archived'
       ORDER BY membership.id`,
    )
    .all(current.plan.id) as Record<string, unknown>[];

  for (const membership of memberships) {
    const membershipId = Number(membership.id);
    const goalId = Number(membership.goal_id);
    const previousStart = Number(membership.effective_from_year);
    const previousEnd =
      membership.effective_to_year === null
        ? null
        : Number(membership.effective_to_year);
    const nextStart =
      startExtendedGoalIds.has(goalId) &&
      previousStart === current.plan.startYear
        ? startYear
        : previousStart;
    const nextEnd =
      endExtendedGoalIds.has(goalId) &&
      previousEnd === current.plan.endYear
        ? endYear
        : previousEnd;
    if (nextStart === previousStart && nextEnd === previousEnd) continue;

    db.prepare(
      `UPDATE goal_kpis
       SET effective_from_year = ?, effective_to_year = ?, updated_by = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(nextStart, nextEnd, actorId, membershipId);
    recordStrategicAuditEvent({
      entity_type: "goal_membership",
      entity_id: membershipId,
      event_type: "update",
      entity_display_name: `${String(membership.kpi_name)} membership`,
      parent_priority_name: String(membership.priority_name),
      parent_goal_name: String(membership.goal_name),
      previous_value: {
        effective_from_year: previousStart,
        effective_to_year: previousEnd,
      },
      new_value: {
        effective_from_year: nextStart,
        effective_to_year: nextEnd,
      },
      actor_id: actorId,
      source_reference: sourceReference,
    });
  }
}

function organizationSnapshot(installation: ActiveInstallation) {
  return {
    name: installation.organization.name,
    short_name: installation.organization.shortName,
  };
}

function planSnapshot(installation: ActiveInstallation) {
  return {
    name: installation.plan.name,
    description: installation.plan.description,
    start_year: installation.plan.startYear,
    end_year: installation.plan.endYear,
    source_reference: installation.plan.sourceReference,
    revision: installation.plan.revision,
  };
}

export function updateActiveInstallation(
  input: z.input<typeof PlanSettingsUpdateSchema>,
  actorId: number,
): ActiveInstallation {
  const parsed = PlanSettingsUpdateSchema.parse(input);
  return transaction(() => {
    const current = getActiveInstallation();
    if (current.plan.revision !== parsed.expectedRevision) {
      throw new InstallationEditConflictError();
    }
    const rangeChanged =
      current.plan.startYear !== parsed.startYear ||
      current.plan.endYear !== parsed.endYear;
    if (rangeChanged) {
      assertPlanRangeCanChange(
        current.plan.id,
        parsed.startYear,
        parsed.endYear,
      );
    }

    const nextOrganization = {
      name: parsed.organizationName,
      short_name: parsed.organizationShortName,
    };
    const nextPlan = {
      name: parsed.planName,
      description: parsed.planDescription,
      start_year: parsed.startYear,
      end_year: parsed.endYear,
      source_reference: parsed.sourceReference,
      revision: current.plan.revision + 1,
    };
    const organizationChanged =
      current.organization.name !== parsed.organizationName ||
      current.organization.shortName !== parsed.organizationShortName;
    const planChanged =
      current.plan.name !== parsed.planName ||
      current.plan.description !== parsed.planDescription ||
      current.plan.startYear !== parsed.startYear ||
      current.plan.endYear !== parsed.endYear ||
      current.plan.sourceReference !== parsed.sourceReference;
    if (!organizationChanged && !planChanged) return current;

    if (rangeChanged) {
      extendPlanBoundaryCoverage(
        current,
        parsed.startYear,
        parsed.endYear,
        actorId,
        parsed.sourceReference,
      );
    }

    if (organizationChanged) {
      getDb()
        .prepare(
          `UPDATE organizations
           SET name = ?, short_name = ?, updated_by = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(
          parsed.organizationName,
          parsed.organizationShortName,
          actorId,
          current.organization.id,
        );
      recordInstallationAudit({
        entityType: "organization",
        entityId: current.organization.id,
        eventType: "update",
        entityDisplayName: parsed.organizationName,
        previousValue: organizationSnapshot(current),
        newValue: nextOrganization,
        actorId,
      });
    }

    const result = getDb()
      .prepare(
        `UPDATE strategic_plans
         SET name = ?, description = ?, start_year = ?, end_year = ?,
             source_reference = ?, revision = revision + 1,
             updated_by = ?, updated_at = datetime('now')
         WHERE id = ? AND revision = ?`,
      )
      .run(
        parsed.planName,
        parsed.planDescription,
        parsed.startYear,
        parsed.endYear,
        parsed.sourceReference,
        actorId,
        current.plan.id,
        parsed.expectedRevision,
      );
    if (result.changes !== 1) throw new InstallationEditConflictError();
    recordInstallationAudit({
      entityType: "strategic_plan",
      entityId: current.plan.id,
      eventType: "update",
      entityDisplayName: parsed.planName,
      previousValue: planSnapshot(current),
      newValue: nextPlan,
      actorId,
    });
    return getActiveInstallation();
  });
}

function parseSnapshot(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "string") return null;
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

export function listInstallationAuditEvents(
  options: { limit?: number; offset?: number } = {},
): InstallationAuditEvent[] {
  const limit =
    options.limit === undefined
      ? null
      : Math.min(Math.max(options.limit, 1), 1_000);
  const offset = Math.max(options.offset ?? 0, 0);
  const rows = getDb()
    .prepare(
      `SELECT * FROM installation_audit_events
       ORDER BY occurred_at DESC, id DESC
       ${limit === null ? "" : `LIMIT ${limit} OFFSET ${offset}`}`,
    )
    .all();
  return rows.map((row) => ({
    id: Number(row.id),
    entityType: String(row.entity_type) as InstallationAuditEvent["entityType"],
    entityId: Number(row.entity_id),
    eventType: String(row.event_type) as InstallationAuditEvent["eventType"],
    entityDisplayName: String(row.entity_display_name),
    previousValue: parseSnapshot(row.previous_value_json),
    newValue: parseSnapshot(row.new_value_json),
    actorId: row.actor_id === null ? null : Number(row.actor_id),
    actorEmailSnapshot:
      row.actor_email_snapshot === null
        ? null
        : String(row.actor_email_snapshot),
    occurredAt: String(row.occurred_at),
  }));
}
