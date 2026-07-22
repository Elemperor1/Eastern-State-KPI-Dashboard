"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BoardReportingAdminModel,
  BoardReportingScope,
} from "@/features/board-reporting";
import { BoardReportingScopeUpdateSchema } from "@/features/board-reporting/validation";
import { useUnsavedChanges } from "@/components/UnsavedChangesContext";
import {
  Button,
  Checkbox,
  FormField,
  Input,
  Select,
  StatusBanner,
  Textarea,
} from "@/components/ui";
import { apiFetch } from "@/lib/api-client";

interface DraftStatement {
  key: string;
  text: string;
  kpiIds: number[];
}

interface DraftPriority {
  priorityId: number;
  enabled: boolean;
  displayTitle: string;
  statements: DraftStatement[];
}

let localStatementSequence = 0;

/** Builds a stable client-only key for a newly added statement. */
function nextStatementKey(priorityId: number): string {
  localStatementSequence += 1;
  return `${priorityId}-new-${localStatementSequence}`;
}

/** Builds the editable draft from the persisted scope and active catalog. */
function draftFromModel(model: BoardReportingAdminModel): DraftPriority[] {
  return model.availablePriorities.map((option) => {
    const saved = model.scope.priorities.find(
      (priority) => priority.priorityId === option.id,
    );
    return {
      priorityId: option.id,
      enabled: Boolean(saved),
      displayTitle: saved?.displayTitle ?? option.name,
      statements: saved?.statements.map((statement) => ({
        key: `${option.id}-saved-${statement.id}`,
        text: statement.text,
        kpiIds: statement.measures.map((measure) => measure.id),
      })) ?? [],
    };
  });
}

/** Builds the atomic API payload from the current editor draft. */
function payloadFromDraft(draft: DraftPriority[], revision: number) {
  return {
    expectedRevision: revision,
    priorities: draft
      .filter((priority) => priority.enabled)
      .map((priority) => ({
        priorityId: priority.priorityId,
        displayTitle: priority.displayTitle.trim(),
        statements: priority.statements.map((statement) => ({
          text: statement.text.trim(),
          kpiIds: statement.kpiIds,
        })),
      })),
  };
}

/** Renders the database-authoritative Board visibility editor and preview. */
export function BoardReportingEditorClient({
  initialModel,
}: {
  initialModel: BoardReportingAdminModel;
}) {
  const { setSourceState, clearSourceState } = useUnsavedChanges();
  const initialDraft = useMemo(() => draftFromModel(initialModel), [initialModel]);
  const [draft, setDraft] = useState(initialDraft);
  const [baseline, setBaseline] = useState(initialDraft);
  const [revision, setRevision] = useState(initialModel.scope.revision);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [baseline, draft],
  );

  useEffect(() => {
    setSourceState("board-reporting", { dirty: isDirty, busy });
    return () => clearSourceState("board-reporting");
  }, [busy, clearSourceState, isDirty, setSourceState]);

  /** Updates one priority draft. */
  function updatePriority(
    priorityId: number,
    updater: (priority: DraftPriority) => DraftPriority,
  ) {
    setDraft((current) => current.map((priority) =>
      priority.priorityId === priorityId ? updater(priority) : priority));
    setFeedback(null);
  }

  /** Adds an empty focus statement to a priority. */
  function addStatement(priorityId: number) {
    updatePriority(priorityId, (priority) => ({
      ...priority,
      statements: [
        ...priority.statements,
        { key: nextStatementKey(priorityId), text: "", kpiIds: [] },
      ],
    }));
  }

  /** Updates one focus statement. */
  function updateStatement(
    priorityId: number,
    statementKey: string,
    updater: (statement: DraftStatement) => DraftStatement,
  ) {
    updatePriority(priorityId, (priority) => ({
      ...priority,
      statements: priority.statements.map((statement) =>
        statement.key === statementKey ? updater(statement) : statement),
    }));
  }

  /** Removes one focus statement. */
  function removeStatement(priorityId: number, statementKey: string) {
    updatePriority(priorityId, (priority) => ({
      ...priority,
      statements: priority.statements.filter(
        (statement) => statement.key !== statementKey,
      ),
    }));
  }

  /** Saves the complete visibility contract atomically. */
  async function save() {
    const parsed = BoardReportingScopeUpdateSchema.safeParse(
      payloadFromDraft(draft, revision),
    );
    if (!parsed.success) {
      setFeedback({
        variant: "error",
        message: "Every visible priority needs a title, and every focus statement needs text.",
      });
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch("/api/strategy/board-reporting", {
        method: "PATCH",
        body: parsed.data,
      });
      const body = await response.json().catch(() => ({})) as {
        error?: string;
        scope?: BoardReportingScope;
      };
      if (!response.ok || !body.scope) {
        setFeedback({
          variant: "error",
          message: body.error ?? "The Board visibility settings could not be saved.",
        });
        return;
      }
      const nextModel = { ...initialModel, scope: body.scope };
      const savedDraft = draftFromModel(nextModel);
      setDraft(savedDraft);
      setBaseline(savedDraft);
      setRevision(body.scope.revision);
      setFeedback({ variant: "success", message: "Board visibility settings saved." });
    } catch {
      setFeedback({
        variant: "error",
        message: "The request could not be completed. Check the connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-10 border-b border-ink-200 pb-10" aria-labelledby="board-visibility-heading">
      <div className="mb-5 max-w-3xl">
        <h2 id="board-visibility-heading" className="text-xl font-semibold text-ink-950">
          Board visibility
        </h2>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          Choose the priorities, focus statements, and measures Board accounts can see. Saving replaces the complete Board view and is recorded in Activity.
        </p>
      </div>
      {feedback ? <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner> : null}

      <div className="divide-y divide-ink-200 border-y border-ink-200">
        {draft.map((priority) => {
          const option = initialModel.availablePriorities.find(
            (candidate) => candidate.id === priority.priorityId,
          );
          if (!option) return null;
          return (
            <section key={priority.priorityId} className="py-6">
              <Checkbox
                id={`board-priority-${priority.priorityId}`}
                checked={priority.enabled}
                disabled={busy}
                onChange={(event) => updatePriority(priority.priorityId, (current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))}
                label={option.name}
                description={priority.enabled ? "Visible to Board accounts" : "Hidden from Board accounts"}
              />
              {priority.enabled ? (
                <div className="mt-4 space-y-5 pl-0 sm:pl-8">
                  <FormField label="Board title" htmlFor={`board-title-${priority.priorityId}`}>
                    <Input
                      id={`board-title-${priority.priorityId}`}
                      value={priority.displayTitle}
                      disabled={busy}
                      maxLength={240}
                      onChange={(event) => updatePriority(priority.priorityId, (current) => ({
                        ...current,
                        displayTitle: event.target.value,
                      }))}
                    />
                  </FormField>

                  {priority.statements.map((statement, statementIndex) => {
                    const unlinked = option.measures.filter(
                      (measure) => !statement.kpiIds.includes(measure.id),
                    );
                    return (
                      <div key={statement.key} className="border-t border-ink-100 pt-5">
                        <FormField
                          label={`Focus statement ${statementIndex + 1}`}
                          htmlFor={`board-statement-${statement.key}`}
                        >
                          <Textarea
                            id={`board-statement-${statement.key}`}
                            value={statement.text}
                            rows={2}
                            maxLength={1_000}
                            disabled={busy}
                            onChange={(event) => updateStatement(
                              priority.priorityId,
                              statement.key,
                              (current) => ({ ...current, text: event.target.value }),
                            )}
                          />
                        </FormField>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {statement.kpiIds.map((kpiId) => {
                            const measure = option.measures.find((item) => item.id === kpiId);
                            if (!measure) return null;
                            return (
                              <Button
                                key={kpiId}
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                aria-label={`Unlink ${measure.name}`}
                                onClick={() => updateStatement(
                                  priority.priorityId,
                                  statement.key,
                                  (current) => ({
                                    ...current,
                                    kpiIds: current.kpiIds.filter((id) => id !== kpiId),
                                  }),
                                )}
                              >
                                {measure.name} ×
                              </Button>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                          <FormField
                            label="Link a measure"
                            htmlFor={`board-measure-${statement.key}`}
                            className="w-full sm:max-w-xl"
                          >
                            <Select
                              id={`board-measure-${statement.key}`}
                              value=""
                              disabled={busy || unlinked.length === 0}
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
                              <option value="">{unlinked.length === 0 ? "All measures linked" : "Choose a measure"}</option>
                              {unlinked.map((measure) => (
                                <option key={measure.id} value={measure.id}>{measure.name}</option>
                              ))}
                            </Select>
                          </FormField>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => removeStatement(priority.priorityId, statement.key)}
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
                    disabled={busy}
                    onClick={() => addStatement(priority.priorityId)}
                  >
                    Add focus statement
                  </Button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <section className="mt-8" aria-labelledby="board-preview-heading">
        <h3 id="board-preview-heading" className="text-lg font-semibold text-ink-950">Board preview</h3>
        <p className="mt-1 text-sm text-ink-600">This is the focus list Board accounts will see after saving.</p>
        <div className="mt-4 divide-y divide-ink-200 border-y border-ink-200">
          {draft.filter((priority) => priority.enabled).map((priority) => {
            const option = initialModel.availablePriorities.find((item) => item.id === priority.priorityId);
            return (
              <div key={priority.priorityId} className="py-4">
                <p className="font-semibold text-ink-950">{priority.displayTitle || option?.name}</p>
                {priority.statements.length > 0 ? (
                  <ul className="mt-2 space-y-2 text-sm text-ink-700">
                    {priority.statements.map((statement) => (
                      <li key={statement.key}>
                        {statement.text || "Untitled focus statement"}
                        <span className="ml-2 text-ink-500">
                          {statement.kpiIds.length === 0
                            ? "No linked measure yet."
                            : `${statement.kpiIds.length} linked measure${statement.kpiIds.length === 1 ? "" : "s"}.`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-ink-500">No focus statements.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-6">
        <Button type="button" variant="primary" isLoading={busy} disabled={!isDirty} onClick={save}>
          Save Board visibility
        </Button>
      </div>
    </section>
  );
}
