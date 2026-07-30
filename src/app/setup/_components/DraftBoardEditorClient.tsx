"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  FormField,
  Input,
  Select,
  StatusBanner,
  Textarea,
} from "@/components/ui";
import type {
  DraftBoardSummary,
  DraftPrioritySummary,
  PlanManagerModel,
  StrategicPlanSummary,
} from "@/features/plans/types";
import { apiFetch, readJsonObject } from "@/lib/api-client";

interface EditorStatement {
  id: number | null;
  key: string;
  text: string;
  kpiIds: number[];
}

interface EditorPriority {
  id: number | null;
  priorityId: number;
  enabled: boolean;
  displayTitle: string;
  statements: EditorStatement[];
}

let statementSequence = 0;

/** Returns a stable client key for a new Draft Board focus statement. */
function nextStatementKey(priorityId: number): string {
  statementSequence += 1;
  return `${priorityId}-new-${statementSequence}`;
}

/** Converts persisted Draft Board preparation into an editable complete scope. */
function editorFromModel(
  board: DraftBoardSummary,
  structure: DraftPrioritySummary[],
): EditorPriority[] {
  return structure.map((priority) => {
    const saved = board.priorities.find(
      (candidate) => candidate.priorityId === priority.id,
    );
    return {
      id: saved?.id ?? null,
      priorityId: priority.id,
      enabled: Boolean(saved) && board.reviewStatus !== "intentional_empty",
      displayTitle: saved?.displayTitle ?? priority.name,
      statements:
        saved?.statements.map((statement) => ({
          id: statement.id,
          key: `${priority.id}-saved-${statement.id}`,
          text: statement.text,
          kpiIds: statement.measures.map((measure) => measure.id),
        })) ?? [],
    };
  });
}

/** Renders the Admin-only successor Board editor and successor-only preview. */
export function DraftBoardEditorClient({
  draft,
  structure,
  board,
  busy: parentBusy,
  onSaved,
}: {
  draft: StrategicPlanSummary;
  structure: DraftPrioritySummary[];
  board: DraftBoardSummary;
  busy: boolean;
  onSaved: (model: PlanManagerModel, message: string) => void;
}) {
  const initialEditor = useMemo(
    () => editorFromModel(board, structure),
    [board, structure],
  );
  const [editor, setEditor] = useState(initialEditor);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const unavailable = busy || parentBusy;

  /** Updates one complete Board Priority draft. */
  function updatePriority(
    priorityId: number,
    updater: (priority: EditorPriority) => EditorPriority,
  ) {
    setEditor((current) =>
      current.map((priority) =>
        priority.priorityId === priorityId ? updater(priority) : priority,
      ),
    );
    setFeedback(null);
  }

  /** Adds one successor-only focus statement. */
  function addStatement(priorityId: number) {
    updatePriority(priorityId, (priority) => ({
      ...priority,
      statements: [
        ...priority.statements,
        {
          id: null,
          key: nextStatementKey(priorityId),
          text: "",
          kpiIds: [],
        },
      ],
    }));
  }

  /** Updates one successor Board focus statement. */
  function updateStatement(
    priorityId: number,
    key: string,
    updater: (statement: EditorStatement) => EditorStatement,
  ) {
    updatePriority(priorityId, (priority) => ({
      ...priority,
      statements: priority.statements.map((statement) =>
        statement.key === key ? updater(statement) : statement,
      ),
    }));
  }

  /** Removes a statement from the prepared scope while retaining its audit rows. */
  function removeStatement(priorityId: number, key: string) {
    updatePriority(priorityId, (priority) => ({
      ...priority,
      statements: priority.statements.filter(
        (statement) => statement.key !== key,
      ),
    }));
  }

  /** Saves the whole Draft Board contract using scope and plan concurrency tokens. */
  async function save(
    intentionalEmpty: boolean,
    reviewedPriorityIds: number[] = [],
  ) {
    const priorities = editor
      .filter((priority) => priority.enabled)
      .map((priority) => ({
        id: priority.id,
        priorityId: priority.priorityId,
        displayTitle: priority.displayTitle.trim(),
        statements: priority.statements.map((statement) => ({
          id: statement.id,
          text: statement.text.trim(),
          kpiIds: statement.kpiIds,
        })),
      }));
    if (
      !intentionalEmpty &&
      (priorities.length === 0 ||
        priorities.some(
          (priority) =>
            !priority.displayTitle ||
            priority.statements.length === 0 ||
            priority.statements.some(
              (statement) =>
                !statement.text || statement.kpiIds.length === 0,
            ),
        ))
    ) {
      setFeedback(
        "Each visible Board Priority needs a title and at least one focus statement linked to a Measure.",
      );
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const response = await apiFetch("/api/strategy/plans", {
        method: "POST",
        body: {
          action: "save_board_scope",
          input: {
            planId: draft.id,
            expectedWholePlanRevision: draft.wholePlanRevision,
            expectedBoardRevision: board.revision,
            intentionalEmpty,
            confirmationName: intentionalEmpty ? draft.name : null,
            reviewedPriorityIds: intentionalEmpty
              ? []
              : reviewedPriorityIds,
            priorities: intentionalEmpty ? [] : priorities,
          },
        },
      });
      const body = await readJsonObject(response);
      if (!response.ok || !body.plans) {
        setFeedback(
          typeof body.error === "string"
            ? body.error
            : "The Draft Board preparation could not be saved.",
        );
        return;
      }
      onSaved(
        body.plans as unknown as PlanManagerModel,
        intentionalEmpty
          ? "No Board report recorded as a deliberate decision."
          : "Draft Board preparation reviewed and saved.",
      );
    } catch {
      setFeedback(
        "The request could not be completed. Check the connection and try again.",
      );
    } finally {
      setBusy(false);
      setConfirmEmpty(false);
    }
  }

  return (
    <div className="mt-6 border-t border-ink-200 pt-5">
      <div>
        <h4 className="text-base font-semibold text-ink-950">
          Prepare the Board view
        </h4>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          Only Admins can see this Draft preview. It uses successor wording and
          successor Measures only; results remain “Not reported” until staff
          records them after activation.
        </p>
      </div>
      {feedback ? (
        <div className="mt-4">
          <StatusBanner variant="error">{feedback}</StatusBanner>
        </div>
      ) : null}

      <div className="mt-5 divide-y divide-ink-200 border-y border-ink-200">
        {editor.map((priority) => {
          const structurePriority = structure.find(
            (candidate) => candidate.id === priority.priorityId,
          );
          const measures =
            structurePriority?.goals.flatMap((goal) => goal.measures) ?? [];
          return (
            <section key={priority.priorityId} className="py-5">
              <Checkbox
                id={`draft-board-priority-${priority.priorityId}`}
                checked={priority.enabled}
                disabled={unavailable}
                label={structurePriority?.name ?? "Draft Priority"}
                description={
                  priority.enabled
                    ? "Included in the Board view"
                    : "Not included in the Board view"
                }
                onChange={(event) =>
                  updatePriority(priority.priorityId, (current) => ({
                    ...current,
                    enabled: event.target.checked,
                    statements:
                      event.target.checked && current.statements.length === 0
                        ? [{
                            id: null,
                            key: nextStatementKey(current.priorityId),
                            text: "",
                            kpiIds: [],
                          }]
                        : current.statements,
                  }))
                }
              />
              {priority.enabled ? (
                <div className="mt-4 space-y-5 sm:pl-8">
                  <FormField
                    label="Board title"
                    htmlFor={`draft-board-title-${priority.priorityId}`}
                  >
                    <Input
                      id={`draft-board-title-${priority.priorityId}`}
                      value={priority.displayTitle}
                      maxLength={240}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePriority(priority.priorityId, (current) => ({
                          ...current,
                          displayTitle: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                  {priority.statements.map((statement, statementIndex) => {
                    const unlinked = measures.filter(
                      (measure) => !statement.kpiIds.includes(measure.id),
                    );
                    return (
                      <div
                        key={statement.key}
                        className="border-t border-ink-100 pt-5"
                      >
                        <FormField
                          label={`Focus statement ${statementIndex + 1}`}
                          htmlFor={`draft-board-statement-${statement.key}`}
                        >
                          <Textarea
                            id={`draft-board-statement-${statement.key}`}
                            value={statement.text}
                            rows={2}
                            maxLength={1_000}
                            disabled={unavailable}
                            onChange={(event) =>
                              updateStatement(
                                priority.priorityId,
                                statement.key,
                                (current) => ({
                                  ...current,
                                  text: event.target.value,
                                }),
                              )
                            }
                          />
                        </FormField>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {statement.kpiIds.map((kpiId) => {
                            const measure = measures.find(
                              (candidate) => candidate.id === kpiId,
                            );
                            if (!measure) return null;
                            return (
                              <Button
                                key={kpiId}
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={unavailable}
                                aria-label={`Unlink ${measure.name}`}
                                onClick={() =>
                                  updateStatement(
                                    priority.priorityId,
                                    statement.key,
                                    (current) => ({
                                      ...current,
                                      kpiIds: current.kpiIds.filter(
                                        (id) => id !== kpiId,
                                      ),
                                    }),
                                  )
                                }
                              >
                                {measure.name} ×
                              </Button>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                          <FormField
                            label="Link a successor Measure"
                            htmlFor={`draft-board-measure-${statement.key}`}
                            className="w-full sm:max-w-xl"
                          >
                            <Select
                              id={`draft-board-measure-${statement.key}`}
                              value=""
                              disabled={unavailable || unlinked.length === 0}
                              onChange={(event) => {
                                const kpiId = Number(event.target.value);
                                if (!Number.isInteger(kpiId)) return;
                                updateStatement(
                                  priority.priorityId,
                                  statement.key,
                                  (current) => ({
                                    ...current,
                                    kpiIds: [...current.kpiIds, kpiId],
                                  }),
                                );
                              }}
                            >
                              <option value="">
                                {unlinked.length === 0
                                  ? "All Measures linked"
                                  : "Choose a Measure"}
                              </option>
                              {unlinked.map((measure) => (
                                <option key={measure.id} value={measure.id}>
                                  {measure.name}
                                </option>
                              ))}
                            </Select>
                          </FormField>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={unavailable}
                            onClick={() =>
                              removeStatement(
                                priority.priorityId,
                                statement.key,
                              )
                            }
                          >
                            Remove statement
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={unavailable}
                    onClick={() => addStatement(priority.priorityId)}
                  >
                    Add focus statement
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    disabled={unavailable}
                    onClick={() => save(false, [priority.priorityId])}
                  >
                    Save and review this Board Priority
                  </Button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <section className="mt-6" aria-labelledby="draft-board-preview-heading">
        <h5
          id="draft-board-preview-heading"
          className="text-sm font-semibold text-ink-950"
        >
          Board preview
        </h5>
        <div className="mt-3 divide-y divide-ink-200 rounded-lg border border-ink-200 px-4">
          {editor.filter((priority) => priority.enabled).map((priority) => (
            <div key={priority.priorityId} className="py-4">
              <p className="font-semibold text-ink-950">
                {priority.displayTitle || "Untitled Board Priority"}
              </p>
              <ul className="mt-2 space-y-2 text-sm text-ink-700">
                {priority.statements.map((statement) => (
                  <li key={statement.key}>
                    <span>{statement.text || "Untitled focus statement"}</span>
                    <ul className="mt-1 space-y-1 pl-4 text-ink-500">
                      {statement.kpiIds.map((kpiId) => {
                        const structurePriority = structure.find(
                          (candidate) =>
                            candidate.id === priority.priorityId,
                        );
                        const measure = structurePriority?.goals
                          .flatMap((goal) => goal.measures)
                          .find((candidate) => candidate.id === kpiId);
                        return (
                          <li key={kpiId}>
                            {measure?.name ?? "Successor Measure"} · Not reported
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {editor.every((priority) => !priority.enabled) ? (
            <p className="py-5 text-sm text-ink-600">
              No Board report is currently prepared.
            </p>
          ) : null}
        </div>
      </section>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="primary"
          isLoading={busy}
          disabled={parentBusy || editor.every((priority) => !priority.enabled)}
          onClick={() => save(false)}
        >
          Save Board preparation
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={unavailable}
          onClick={() => setConfirmEmpty(true)}
        >
          Choose no Board report
        </Button>
      </div>

      <ConfirmDialog
        open={confirmEmpty}
        title="Use no Board report for this plan?"
        description="This deliberately removes every prepared Board Priority from the successor view. The Draft work and audit history remain retained, and you can prepare a Board view again before activation."
        confirmLabel="Use no Board report"
        onClose={() => setConfirmEmpty(false)}
        onConfirm={() => save(true)}
      />
    </div>
  );
}
