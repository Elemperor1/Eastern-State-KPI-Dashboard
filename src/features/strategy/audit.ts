import { getDb } from "@/lib/db";
import type {
  ConfigurationStatus,
  StrategyAuditAction,
  StrategyAuditEntityType,
  StrategyJsonValue,
} from "./types";
import { asStrategicAuditEvent, type StrategicAuditEvent } from "./records";

export type StrategicAuditEventType = StrategyAuditAction;

export interface StrategicAuditWriteInput {
  entity_type: StrategyAuditEntityType;
  entity_id: number;
  event_type: StrategicAuditEventType;
  entity_display_name: string;
  parent_priority_name?: string | null;
  parent_goal_name?: string | null;
  previous_value?: StrategyJsonValue | null;
  new_value?: StrategyJsonValue | null;
  actor_id?: number | null;
  actor_email_snapshot?: string | null;
  source_reference?: string | null;
}

function resolveActorEmail(
  actorId: number | null,
  explicit: string | null | undefined,
): string | null {
  if (explicit !== undefined) return explicit;
  if (actorId === null) return null;
  const row = getDb()
    .prepare("SELECT email FROM users WHERE id = ?")
    .get(actorId) as { email?: string } | undefined;
  return row?.email == null ? null : String(row.email);
}

function encode(value: StrategyJsonValue | null | undefined): string | null {
  return value == null ? null : JSON.stringify(value);
}

function assertCompleteAuditInput(input: StrategicAuditWriteInput): void {
  if (!Number.isInteger(input.entity_id) || input.entity_id < 1) {
    throw new Error("Strategic audit events require a positive entity id.");
  }
  if (!input.entity_display_name.trim()) {
    throw new Error("Strategic audit events require an entity display name snapshot.");
  }
  const requiresPrevious =
    input.event_type === "update" ||
    input.event_type === "archive" ||
    input.event_type === "restore" ||
    input.event_type === "delete" ||
    input.event_type === "status_change";
  const requiresNew =
    input.event_type === "create" ||
    input.event_type === "update" ||
    input.event_type === "archive" ||
    input.event_type === "restore" ||
    input.event_type === "status_change";
  if (requiresPrevious && input.previous_value == null) {
    throw new Error(`${input.event_type} audit events require a previous snapshot.`);
  }
  if (requiresNew && input.new_value == null) {
    throw new Error(`${input.event_type} audit events require a new snapshot.`);
  }
}

/**
 * Append an immutable strategic audit event. Callers invoke this inside the
 * same transaction as the owning mutation, so state and history cannot tear.
 */
export function recordStrategicAuditEvent(
  input: StrategicAuditWriteInput,
): StrategicAuditEvent {
  assertCompleteAuditInput(input);
  const db = getDb();
  const actorId = input.actor_id ?? null;
  const actorEmail = resolveActorEmail(actorId, input.actor_email_snapshot);
  const result = db
    .prepare(
      `INSERT INTO strategic_audit_events (
         entity_type, entity_id, event_type, entity_display_name,
         parent_priority_name, parent_goal_name,
         previous_value_json, new_value_json,
         actor_id, actor_email_snapshot, source_reference
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.entity_type,
      input.entity_id,
      input.event_type,
      input.entity_display_name,
      input.parent_priority_name ?? null,
      input.parent_goal_name ?? null,
      encode(input.previous_value),
      encode(input.new_value),
      actorId,
      actorEmail,
      input.source_reference ?? null,
    );
  const row = db
    .prepare("SELECT * FROM strategic_audit_events WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error("Strategic audit event was not readable after insert.");
  }
  return asStrategicAuditEvent(row);
}

export interface StrategicAuditFilter {
  entity_type?: StrategyAuditEntityType;
  entity_id?: number;
  actor_id?: number;
  event_type?: StrategicAuditEventType;
  limit?: number;
}

export function listStrategicAuditEvents(
  filter: StrategicAuditFilter = {},
): StrategicAuditEvent[] {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (filter.entity_type !== undefined) {
    where.push("entity_type = ?");
    params.push(filter.entity_type);
  }
  if (filter.entity_id !== undefined) {
    where.push("entity_id = ?");
    params.push(filter.entity_id);
  }
  if (filter.actor_id !== undefined) {
    where.push("actor_id = ?");
    params.push(filter.actor_id);
  }
  if (filter.event_type !== undefined) {
    where.push("event_type = ?");
    params.push(filter.event_type);
  }
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1_000);
  const rows = getDb()
    .prepare(
      `SELECT * FROM strategic_audit_events
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY occurred_at DESC, id DESC
       LIMIT ${limit}`,
    )
    .all(...params) as Record<string, unknown>[];
  return rows.map(asStrategicAuditEvent);
}

/** Recover the configuration status captured immediately before an archive. */
export function configurationStatusBeforeArchive(
  entityType: StrategicAuditWriteInput["entity_type"],
  entityId: number,
): ConfigurationStatus | null {
  const row = getDb()
    .prepare(
      `SELECT previous_value_json
       FROM strategic_audit_events
       WHERE entity_type = ? AND entity_id = ? AND event_type = 'archive'
       ORDER BY occurred_at DESC, id DESC
       LIMIT 1`,
    )
    .get(entityType, entityId) as
    | { previous_value_json?: string | null }
    | undefined;
  if (!row?.previous_value_json) return null;
  try {
    const parsed = JSON.parse(row.previous_value_json) as {
      configuration_status?: unknown;
    };
    const status = parsed.configuration_status;
    return status === "draft" ||
      status === "needs_definition" ||
      status === "needs_target" ||
      status === "ready" ||
      status === "active"
      ? status
      : null;
  } catch {
    return null;
  }
}
