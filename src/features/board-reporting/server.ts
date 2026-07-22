import { getDb, transaction } from "@/lib/db";
import { getActiveInstallation } from "@/features/installation/server";
import { DEFAULT_BOARD_REPORTING_SCOPE } from "./defaults";
import {
  BoardReportingScopeUpdateSchema,
  type BoardReportingScopeUpdate,
} from "./validation";
import type {
  BoardReportingAdminModel,
  BoardReportingPriority,
  BoardReportingScope,
} from "./types";

export class BoardReportingEditConflictError extends Error {
  /** Creates a new instance with the supplied state. */
  constructor() {
    super("The Board visibility settings changed after this form was loaded. Refresh and try again.");
    this.name = "BoardReportingEditConflictError";
  }
}

export class BoardReportingValidationError extends Error {
  /** Creates a new instance with the supplied state. */
  constructor(message: string) {
    super(message);
    this.name = "BoardReportingValidationError";
  }
}

/** Retrieves the initialization marker. */
function initializationPending(): boolean {
  const row = getDb()
    .prepare("SELECT value FROM meta WHERE key = 'board_reporting_scope_initialized'")
    .get() as { value?: string } | undefined;
  return row?.value !== "1";
}

/** Records a complete immutable Board-scope snapshot. */
function recordBoardReportingAudit(input: {
  scopeId: number;
  eventType: "create" | "update";
  previousValue: BoardReportingScope | null;
  newValue: BoardReportingScope;
  actorId: number | null;
}): void {
  const db = getDb();
  const actor = input.actorId === null
    ? null
    : db.prepare("SELECT email FROM users WHERE id = ?").get(input.actorId) as
      | { email?: string }
      | undefined;
  db.prepare(
    `INSERT INTO board_reporting_audit_events (
       scope_id, event_type, previous_value_json, new_value_json,
       actor_id, actor_email_snapshot
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.scopeId,
    input.eventType,
    input.previousValue === null ? null : JSON.stringify(input.previousValue),
    JSON.stringify(input.newValue),
    input.actorId,
    actor?.email ?? null,
  );
}

/** Creates an empty scope for the active plan when needed. */
function ensureScopeRow(planId: number): number {
  const db = getDb();
  const existing = db.prepare(
    "SELECT id FROM board_reporting_scopes WHERE plan_id = ?",
  ).get(planId) as { id?: number } | undefined;
  if (existing?.id !== undefined) return Number(existing.id);
  return Number(
    db.prepare(
      "INSERT INTO board_reporting_scopes (plan_id) VALUES (?)",
    ).run(planId).lastInsertRowid,
  );
}

/** Inserts one priority and all of its statements and measure links. */
function insertPriority(input: {
  scopeId: number;
  priorityId: number;
  displayTitle: string;
  displayOrder: number;
  statements: Array<{ text: string; kpiIds: number[] }>;
  actorId: number | null;
}): void {
  const db = getDb();
  const boardPriorityId = Number(
    db.prepare(
      `INSERT INTO board_reporting_priorities (
         scope_id, priority_id, display_title, display_order,
         created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.scopeId,
      input.priorityId,
      input.displayTitle,
      input.displayOrder,
      input.actorId,
      input.actorId,
    ).lastInsertRowid,
  );
  input.statements.forEach((statement, statementIndex) => {
    const statementId = Number(
      db.prepare(
        `INSERT INTO board_reporting_statements (
           board_priority_id, statement_text, display_order,
           created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?)`,
      ).run(
        boardPriorityId,
        statement.text,
        (statementIndex + 1) * 10,
        input.actorId,
        input.actorId,
      ).lastInsertRowid,
    );
    statement.kpiIds.forEach((kpiId, kpiIndex) => {
      db.prepare(
        `INSERT INTO board_reporting_statement_kpis (
           statement_id, kpi_id, display_order, created_by
         ) VALUES (?, ?, ?, ?)`,
      ).run(statementId, kpiId, (kpiIndex + 1) * 10, input.actorId);
    });
  });
}

/** Initializes the original Board scope once and never reconciles it again. */
function initializeDefaultScope(): void {
  if (!initializationPending()) return;
  const installation = getActiveInstallation();
  transaction(() => {
    if (!initializationPending()) return;
    const db = getDb();
    const scopeId = ensureScopeRow(installation.plan.id);
    const count = Number(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM board_reporting_priorities WHERE scope_id = ?",
      ).get(scopeId) as { count: number }).count,
    );
    if (count === 0) {
      DEFAULT_BOARD_REPORTING_SCOPE.forEach((priority, priorityIndex) => {
        const priorityRow = db.prepare(
          `SELECT id FROM categories
           WHERE plan_id = ? AND slug = ? AND archived_at IS NULL`,
        ).get(installation.plan.id, priority.prioritySlug) as
          | { id?: number }
          | undefined;
        if (priorityRow?.id === undefined) return;
        const statements = priority.statements.map((statement) => ({
          text: statement.text,
          kpiIds: statement.kpiSlugs.flatMap((slug) => {
            const row = db.prepare(
              `SELECT id FROM kpis
               WHERE category_id = ? AND slug = ?
                 AND archived_at IS NULL AND is_active = 1`,
            ).get(Number(priorityRow.id), slug) as { id?: number } | undefined;
            return row?.id === undefined ? [] : [Number(row.id)];
          }),
        }));
        insertPriority({
          scopeId,
          priorityId: Number(priorityRow.id),
          displayTitle: priority.displayTitle,
          displayOrder: (priorityIndex + 1) * 10,
          statements,
          actorId: null,
        });
      });
      recordBoardReportingAudit({
        scopeId,
        eventType: "create",
        previousValue: null,
        newValue: readScope(installation.plan.id),
        actorId: null,
      });
    }
    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('board_reporting_scope_initialized', '1')",
    ).run();
  });
}

/** Reads the persisted Board reporting scope without initializing content. */
function readScope(planId: number): BoardReportingScope {
  const db = getDb();
  const scopeRow = db.prepare(
    "SELECT id, plan_id, revision FROM board_reporting_scopes WHERE plan_id = ?",
  ).get(planId) as
    | { id: number; plan_id: number; revision: number }
    | undefined;
  if (!scopeRow) {
    return { id: 0, planId, revision: 0, priorities: [] };
  }
  const rows = db.prepare(
    `SELECT
       board_priority.id AS board_priority_id,
       board_priority.priority_id,
       board_priority.display_title,
       board_priority.display_order AS priority_display_order,
       priority.slug AS priority_slug,
       priority.name AS priority_name,
       statement.id AS statement_id,
       statement.statement_text,
       statement.display_order AS statement_display_order,
       kpi.id AS kpi_id,
       kpi.slug AS kpi_slug,
       kpi.name AS kpi_name,
       link.display_order AS kpi_display_order
     FROM board_reporting_priorities board_priority
     JOIN categories priority ON priority.id = board_priority.priority_id
     LEFT JOIN board_reporting_statements statement
       ON statement.board_priority_id = board_priority.id
     LEFT JOIN board_reporting_statement_kpis link
       ON link.statement_id = statement.id
     LEFT JOIN kpis kpi
       ON kpi.id = link.kpi_id
      AND kpi.is_active = 1 AND kpi.archived_at IS NULL
      AND kpi.category_id = board_priority.priority_id
     WHERE board_priority.scope_id = ?
       AND priority.archived_at IS NULL
     ORDER BY board_priority.display_order, board_priority.id,
              statement.display_order, statement.id,
              link.display_order, kpi.id`,
  ).all(Number(scopeRow.id)) as Record<string, unknown>[];
  const priorities = new Map<number, BoardReportingPriority>();
  const statementIds = new Map<number, Set<number>>();
  for (const row of rows) {
    const boardPriorityId = Number(row.board_priority_id);
    let priority = priorities.get(boardPriorityId);
    if (!priority) {
      priority = {
        id: boardPriorityId,
        priorityId: Number(row.priority_id),
        prioritySlug: String(row.priority_slug),
        priorityName: String(row.priority_name),
        displayTitle: String(row.display_title),
        displayOrder: Number(row.priority_display_order),
        statements: [],
      };
      priorities.set(boardPriorityId, priority);
      statementIds.set(boardPriorityId, new Set());
    }
    if (row.statement_id == null) continue;
    const statementId = Number(row.statement_id);
    let statement = priority.statements.find((item) => item.id === statementId);
    if (!statementIds.get(boardPriorityId)?.has(statementId)) {
      statement = {
        id: statementId,
        text: String(row.statement_text),
        displayOrder: Number(row.statement_display_order),
        measures: [],
      };
      priority.statements.push(statement);
      statementIds.get(boardPriorityId)?.add(statementId);
    }
    if (row.kpi_id != null && statement) {
      statement.measures.push({
        id: Number(row.kpi_id),
        slug: String(row.kpi_slug),
        name: String(row.kpi_name),
      });
    }
  }
  return {
    id: Number(scopeRow.id),
    planId: Number(scopeRow.plan_id),
    revision: Number(scopeRow.revision),
    priorities: Array.from(priorities.values()),
  };
}

/** Retrieves the database-authoritative Board reporting scope. */
export function getBoardReportingScope(): BoardReportingScope {
  initializeDefaultScope();
  return readScope(getActiveInstallation().plan.id);
}

/** Retrieves the Admin editor model and every linkable active measure. */
export function getBoardReportingAdminModel(): BoardReportingAdminModel {
  const scope = getBoardReportingScope();
  const rows = getDb().prepare(
    `SELECT
       priority.id AS priority_id,
       priority.slug AS priority_slug,
       priority.name AS priority_name,
       priority.sort_order AS priority_sort_order,
       kpi.id AS kpi_id,
       kpi.slug AS kpi_slug,
       kpi.name AS kpi_name,
       kpi.sort_order AS kpi_sort_order
     FROM categories priority
     LEFT JOIN kpis kpi
       ON kpi.category_id = priority.id
      AND kpi.is_active = 1 AND kpi.archived_at IS NULL
     WHERE priority.plan_id = ? AND priority.archived_at IS NULL
     ORDER BY priority.sort_order, priority.id, kpi.sort_order, kpi.id`,
  ).all(scope.planId) as Record<string, unknown>[];
  const priorities = new Map<number, BoardReportingAdminModel["availablePriorities"][number]>();
  for (const row of rows) {
    const priorityId = Number(row.priority_id);
    let priority = priorities.get(priorityId);
    if (!priority) {
      priority = {
        id: priorityId,
        slug: String(row.priority_slug),
        name: String(row.priority_name),
        measures: [],
      };
      priorities.set(priorityId, priority);
    }
    if (row.kpi_id != null) {
      priority.measures.push({
        id: Number(row.kpi_id),
        slug: String(row.kpi_slug),
        name: String(row.kpi_name),
      });
    }
  }
  return { scope, availablePriorities: Array.from(priorities.values()) };
}

/** Validates that every selected measure belongs to its selected priority. */
function validateReferences(update: BoardReportingScopeUpdate, planId: number): void {
  const db = getDb();
  for (const priority of update.priorities) {
    const priorityRow = db.prepare(
      `SELECT id FROM categories
       WHERE id = ? AND plan_id = ? AND archived_at IS NULL`,
    ).get(priority.priorityId, planId);
    if (!priorityRow) {
      throw new BoardReportingValidationError("A selected Board priority is not active in this strategic plan.");
    }
    for (const statement of priority.statements) {
      for (const kpiId of statement.kpiIds) {
        const kpi = db.prepare(
          `SELECT id FROM kpis
           WHERE id = ? AND category_id = ?
             AND is_active = 1 AND archived_at IS NULL`,
        ).get(kpiId, priority.priorityId);
        if (!kpi) {
          throw new BoardReportingValidationError("Every linked measure must be active and belong to its selected priority.");
        }
      }
    }
  }
}

/** Atomically replaces the persisted Board reporting visibility configuration. */
export function updateBoardReportingScope(
  input: BoardReportingScopeUpdate,
  actorId: number,
): BoardReportingScope {
  const parsed = BoardReportingScopeUpdateSchema.parse(input);
  const installation = getActiveInstallation();
  initializeDefaultScope();
  return transaction(() => {
    const db = getDb();
    const current = readScope(installation.plan.id);
    if (current.revision !== parsed.expectedRevision) {
      throw new BoardReportingEditConflictError();
    }
    validateReferences(parsed, installation.plan.id);
    db.prepare(
      "DELETE FROM board_reporting_priorities WHERE scope_id = ?",
    ).run(current.id);
    parsed.priorities.forEach((priority, priorityIndex) => {
      insertPriority({
        scopeId: current.id,
        priorityId: priority.priorityId,
        displayTitle: priority.displayTitle,
        displayOrder: (priorityIndex + 1) * 10,
        statements: priority.statements,
        actorId,
      });
    });
    const result = db.prepare(
      `UPDATE board_reporting_scopes
       SET revision = revision + 1, updated_by = ?, updated_at = datetime('now')
       WHERE id = ? AND revision = ?`,
    ).run(actorId, current.id, parsed.expectedRevision);
    if (result.changes !== 1) throw new BoardReportingEditConflictError();
    const updated = readScope(installation.plan.id);
    recordBoardReportingAudit({
      scopeId: current.id,
      eventType: "update",
      previousValue: current,
      newValue: updated,
      actorId,
    });
    return updated;
  });
}
