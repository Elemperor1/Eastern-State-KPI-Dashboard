"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  FormField,
  Input,
  Select,
  StatusBanner,
  Textarea,
} from "@/components/ui";
import type { PlanManagerModel, PlanReadinessItem } from "@/features/plans/types";
import { apiFetch, readJsonObject } from "@/lib/api-client";
import { runEventHandler } from "@/lib/async-event";
import {
  clearPlanActivationIdentity,
  clearResolvedPlanActivationIdentity,
  getOrCreatePlanActivationIdentity,
} from "@/lib/plan-activation-identity";
import { DraftBoardEditorClient } from "./DraftBoardEditorClient";

type Feedback = { variant: "success" | "error"; message: string };

/** Presents a lifecycle state in plain language. */
function stateLabel(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

/** Renders one corrective readiness list. */
function ReadinessList({ title, items }: { title: string; items: PlanReadinessItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold text-ink-950">{title}</h4>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.key} className="rounded-lg border border-ink-200 p-3">
            <p className="text-sm font-semibold text-ink-900">
              {item.title}
              {item.affectedCount ? ` (${item.affectedCount})` : ""}
            </p>
            <p className="mt-1 text-sm leading-6 text-ink-600">{item.guidance}</p>
            {item.overridden ? (
              <p className="mt-1 text-xs font-medium text-brand-800">
                Admin decision recorded: {item.overrideReason}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Renders the guided successor Strategic Plan workspace. */
export function PlansManagerClient({ initialModel }: { initialModel: PlanManagerModel }) {
  const router = useRouter();
  const [model, setModel] = useState(initialModel);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [priorityToRemove, setPriorityToRemove] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [cancelConfirmationName, setCancelConfirmationName] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const draft = model.draft;

  useEffect(() => {
    clearResolvedPlanActivationIdentity(
      window.sessionStorage,
      draft?.id ?? null,
    );
  }, [draft?.id]);

  /** Applies a Draft action and replaces the model with the saved response. */
  async function mutate(
    action: string,
    input: Record<string, unknown>,
    success: string,
  ): Promise<boolean> {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await apiFetch("/api/strategy/plans", {
        method: "POST",
        body: { action, input },
      });
      const body = await readJsonObject(response);
      if (!response.ok) {
        setFeedback({
          variant: "error",
          message: typeof body.error === "string" ? body.error : "The plan change could not be saved.",
        });
        return false;
      }
      if (body.plans) setModel(body.plans as unknown as PlanManagerModel);
      setFeedback({ variant: "success", message: success });
      router.refresh();
      return true;
    } catch {
      setFeedback({
        variant: "error",
        message: "The request could not be completed. Check the connection and try again.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Creates the only allowed successor Draft. */
  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate("create", {
      creationMethod: data.get("creationMethod"),
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? "").trim() || null,
      endYear: Number(data.get("endYear")),
      approvalSource: String(data.get("approvalSource") ?? "").trim() || null,
    }, "The successor Draft is ready to prepare.");
  }

  /** Saves the current Draft details against its Whole-Plan Revision. */
  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const data = new FormData(event.currentTarget);
    await mutate("update_details", {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      expectedPlanRevision: draft.revision,
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? "").trim() || null,
      endYear: Number(data.get("endYear")),
      approvalSource: String(data.get("approvalSource") ?? "").trim() || null,
    }, "Plan details saved. Review the section when it is complete.");
  }

  /** Adds one complete structure bundle to a blank or copied Draft. */
  async function addBundle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await mutate("add_measure_bundle", {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      priorityName: String(data.get("priorityName") ?? "").trim(),
      goalName: String(data.get("goalName") ?? "").trim(),
      goalOwner: String(data.get("goalOwner") ?? "").trim() || null,
      measureName: String(data.get("measureName") ?? "").trim(),
      measureOwner: String(data.get("measureOwner") ?? "").trim() || null,
      unit: String(data.get("unit") ?? "").trim(),
      unitType: data.get("unitType"),
      numeratorLabel:
        String(data.get("numeratorLabel") ?? "").trim() || null,
      denominatorLabel:
        String(data.get("denominatorLabel") ?? "").trim() || null,
      reportingFrequency: data.get("reportingFrequency"),
      direction: data.get("direction"),
    }, "Priority, Goal, and Measure added.");
    if (saved) form.reset();
  }

  /** Saves one copied or newly created Draft label and owner. */
  async function saveItem(
    event: FormEvent<HTMLFormElement>,
    itemKind: "priority" | "goal" | "measure",
    itemId: number,
    expectedRecordUpdatedAt: string,
  ) {
    event.preventDefault();
    if (!draft) return;
    const data = new FormData(event.currentTarget);
    await mutate("update_item", {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      expectedRecordUpdatedAt,
      itemKind,
      itemId,
      name: String(data.get("name") ?? "").trim(),
      owner: itemKind === "priority"
        ? null
        : String(data.get("owner") ?? "").trim() || null,
    }, `${stateLabel(itemKind)} saved for the Draft.`);
  }

  /** Removes a complete Priority branch from reporting without deleting it. */
  async function removePriority() {
    if (!draft || !priorityToRemove) return;
    await mutate("archive_priority", {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      priorityId: priorityToRemove.id,
      expectedRecordUpdatedAt:
        model.draftStructure.find(
          (priority) => priority.id === priorityToRemove.id,
        )?.updatedAt ?? "",
    }, "Priority removed from the Draft and retained in lifecycle history.");
    setPriorityToRemove(null);
  }

  /** Adds a first-year target for one Draft Measure. */
  async function addTarget(
    event: FormEvent<HTMLFormElement>,
    kpiId: number,
    expectedKpiUpdatedAt: string,
  ) {
    event.preventDefault();
    if (!draft) return;
    const data = new FormData(event.currentTarget);
    await mutate("add_target", {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      kpiId,
      expectedKpiUpdatedAt,
      expectedTargetUpdatedAt:
        model.draftStructure
          .flatMap((priority) => priority.goals)
          .flatMap((goal) => goal.measures)
          .find((measure) => measure.id === kpiId)
          ?.firstYearTarget?.updatedAt ?? null,
      targetValue: Number(data.get("targetValue")),
      sourceReference: String(data.get("sourceReference") ?? "").trim(),
    }, "First-year Target added.");
  }

  /** Copies one predecessor Target as an explicitly unapproved Draft Target. */
  async function copyTarget(
    kpiId: number,
    expectedKpiUpdatedAt: string,
    predecessorTargetId: number,
  ) {
    if (!draft) return;
    await mutate("copy_target", {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      kpiId,
      expectedKpiUpdatedAt,
      predecessorTargetId,
    }, "Target copied as Draft. Review its value and approval source before activation.");
  }

  /** Records whether an open Draft question is answered now or followed up later. */
  async function classifyQuestion(
    event: FormEvent<HTMLFormElement>,
    itemKind: "goal" | "measurement_config" | "component",
    itemId: number,
    expectedRecordUpdatedAt: string,
  ) {
    event.preventDefault();
    if (!draft) return;
    const data = new FormData(event.currentTarget);
    await mutate("classify_question", {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      expectedRecordUpdatedAt,
      itemKind,
      itemId,
      decision: data.get("decision"),
      explanation: String(data.get("explanation") ?? "").trim(),
    }, "The question decision and explanation were recorded.");
  }

  /** Records immutable predecessor provenance for one redesigned Draft item. */
  async function saveLineage(
    event: FormEvent<HTMLFormElement>,
    itemKind: "priority" | "goal" | "kpi",
    successorItemId: number,
  ) {
    event.preventDefault();
    if (!draft) return;
    const data = new FormData(event.currentTarget);
    await mutate("record_lineage", {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      itemKind,
      successorItemId,
      relationshipType: data.get("relationshipType"),
      predecessorItemIds: data
        .getAll("predecessorItemIds")
        .map((value) => Number(value)),
    }, "Immutable predecessor lineage recorded.");
  }

  /** Renders existing lineage or the deliberate redesigned-item lineage form. */
  function lineageControls(
    itemKind: "priority" | "goal" | "kpi",
    successorItemId: number,
  ) {
    const recorded = model.lineage.filter(
      (lineage) =>
        lineage.itemKind === itemKind &&
        lineage.successorItemId === successorItemId,
    );
    if (recorded.length > 0) {
      return (
        <p className="mt-2 text-xs leading-5 text-ink-500">
          {recorded
            .map(
              (lineage) =>
                `${lineage.relationshipType.replaceAll("_", " ")} ${lineage.predecessorName}`,
            )
            .join("; ")}
        </p>
      );
    }
    const sources = model.lineageSources.filter(
      (source) => source.itemKind === itemKind,
    );
    if (sources.length === 0) return null;
    return (
      <form
        onSubmit={(event) =>
          runEventHandler(
            (submitted) =>
              saveLineage(submitted, itemKind, successorItemId),
            event,
          )
        }
        className="mt-3 grid gap-3 rounded-lg border border-ink-200 bg-white p-3 md:grid-cols-2"
      >
        <FormField
          label="How this continues the former plan"
          htmlFor={`lineage-type-${itemKind}-${successorItemId}`}
        >
          <Select
            id={`lineage-type-${itemKind}-${successorItemId}`}
            name="relationshipType"
            defaultValue="copied_from"
          >
            <option value="copied_from">Copied from one item</option>
            <option value="merged_from">Merged from several items</option>
            <option value="split_from">Split from one item</option>
          </Select>
        </FormField>
        <FormField
          label="Former-plan source"
          hint="Choose one source for Copied or Split. Choose every source for Merged."
          htmlFor={`lineage-source-${itemKind}-${successorItemId}`}
        >
          <Select
            id={`lineage-source-${itemKind}-${successorItemId}`}
            name="predecessorItemIds"
            multiple
            size={Math.min(Math.max(sources.length, 2), 5)}
            required
          >
            {sources.map((source) => (
              <option key={source.itemId} value={source.itemId}>
                {source.itemName}
                {source.context !== source.itemName
                  ? ` — ${source.context}`
                  : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <Button
          type="submit"
          size="sm"
          className="md:col-span-2 md:justify-self-start"
          disabled={busy}
        >
          Record lineage
        </Button>
      </form>
    );
  }

  /** Marks one guided section as reviewed. */
  async function reviewSection(section: "plan_details" | "plan_structure" | "targets_board") {
    if (!draft) return;
    const sectionReview = model.sectionReviews.find(
      (candidate) => candidate.section === section,
    );
    if (!sectionReview) return;
    await mutate("review_section", {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      expectedSectionUpdatedAt: sectionReview.updatedAt,
      section,
    }, "Section review recorded.");
  }

  /** Stores one individually explained readiness exception. */
  async function overrideRequirement(event: FormEvent<HTMLFormElement>, requirementKey: string) {
    event.preventDefault();
    if (!draft) return;
    const data = new FormData(event.currentTarget);
    await mutate("save_override", {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      requirementKey,
      reason: String(data.get("reason") ?? "").trim(),
    }, "Admin decision and explanation recorded.");
  }

  /** Cancels without deleting the exact named Draft. */
  function requestCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const data = new FormData(event.currentTarget);
    const confirmationName = String(data.get("confirmationName") ?? "");
    if (confirmationName !== draft.name) {
      setFeedback({
        variant: "error",
        message: "Enter the Draft plan name exactly as shown before continuing.",
      });
      return;
    }
    setCancelConfirmationName(confirmationName);
    setCancelDialogOpen(true);
  }

  /** Confirms cancellation of the exact named Draft from the modal boundary. */
  async function cancel() {
    if (!draft) return;
    const cancelled = await mutate("cancel", {
      planId: draft.id,
      expectedWholePlanRevision: draft.wholePlanRevision,
      confirmationName: cancelConfirmationName,
    }, "The Draft was cancelled and retained as read-only history.");
    setCancelDialogOpen(false);
    if (cancelled) {
      setCancelConfirmationName("");
    }
  }

  /** Runs the separately protected activation boundary. */
  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback(null);
    try {
      const activationId = getOrCreatePlanActivationIdentity(
        window.sessionStorage,
        draft.id,
        () => crypto.randomUUID(),
      );
      const response = await apiFetch("/api/strategy/plans/activate", {
        method: "POST",
        body: {
          activationId,
          planId: draft.id,
          expectedWholePlanRevision: draft.wholePlanRevision,
          confirmationName: String(data.get("confirmationName") ?? ""),
          acknowledgeWarnings: data.get("acknowledgeWarnings") === "on",
        },
      });
      const body = await readJsonObject(response);
      const confirmedResolution =
        response.ok ||
        (typeof body.error === "string" &&
          body.code !== "activation_in_progress");
      if (confirmedResolution) {
        clearPlanActivationIdentity(
          window.sessionStorage,
          draft.id,
          activationId,
        );
      }
      if (!response.ok) {
        setFeedback({
          variant: "error",
          message: typeof body.error === "string" ? body.error : "Activation did not complete.",
        });
        return;
      }
      setFeedback({ variant: "success", message: "The successor plan is Active and the former plan is preserved for reporting." });
      router.refresh();
    } catch {
      setFeedback({ variant: "error", message: "Activation could not be confirmed. Do not retry until the page is refreshed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-ink-950">Strategic Plans</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">
          Prepare the next Strategic Plan without changing current reporting.
          Only one Draft may be prepared at a time. Activation is a separate,
          verified step that preserves the former plan for historical reports.
        </p>
      </div>
      {feedback ? <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner> : null}

      <Card as="section" className="p-5" aria-labelledby="active-plan-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="active-plan-heading" className="text-lg font-semibold text-ink-950">
              Current Active plan
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              {model.active.name} · {model.active.startYear}–{model.active.endYear}
            </p>
          </div>
          <Badge>{stateLabel(model.active.lifecycleState)}</Badge>
        </div>
      </Card>

      {!model.successorPlanningEnabled ? (
        <Alert>Successor planning is not enabled for this release. Existing plans remain unchanged.</Alert>
      ) : null}

      {!draft && model.successorPlanningEnabled ? (
        <Card as="section" className="p-5" aria-labelledby="start-draft-heading">
          <h3 id="start-draft-heading" className="text-lg font-semibold text-ink-950">Start the next plan</h3>
          <p className="mt-1 text-sm leading-6 text-ink-600">
            A blank Draft starts empty. A structural copy creates new plan-owned
            Priorities, Goals, Measures, definitions, and Board preparation from
            the current end-of-plan structure. It never copies results, history,
            Targets, Baselines, or audit records.
          </p>
          <form onSubmit={(event) => runEventHandler(createDraft, event)} className="mt-5 grid gap-4 md:grid-cols-2">
            <FormField label="Starting point" htmlFor="creation-method">
              <Select id="creation-method" name="creationMethod" defaultValue="structural_clone">
                <option value="structural_clone">Copy the current structure</option>
                <option value="blank">Start blank</option>
              </Select>
            </FormField>
            <FormField label="Plan name" htmlFor="new-plan-name">
              <Input id="new-plan-name" name="name" required />
            </FormField>
            <FormField label="Final year" htmlFor="new-plan-end">
              <Input id="new-plan-end" name="endYear" type="number" min={model.active.endYear + 1} defaultValue={model.active.endYear + 5} required />
            </FormField>
            <FormField label="Approved by or source" htmlFor="new-plan-source">
              <Input id="new-plan-source" name="approvalSource" required />
            </FormField>
            <FormField label="Plain-language description" htmlFor="new-plan-description" className="md:col-span-2">
              <Textarea id="new-plan-description" name="description" rows={3} required />
            </FormField>
            <Button type="submit" variant="primary" isLoading={busy}>Create successor plan</Button>
          </form>
        </Card>
      ) : null}

      {draft ? (
        <>
          <Alert>
            You are preparing <strong>{draft.name}</strong> ({draft.startYear}–{draft.endYear}).
            Current reporting still uses {model.active.name}. Saved version: {draft.wholePlanRevision}.
          </Alert>

          <Card as="section" className="p-5" aria-labelledby="plan-details-heading">
            <h3 id="plan-details-heading" className="text-lg font-semibold text-ink-950">1. Plan details</h3>
            <p className="mt-1 text-sm text-ink-600">Confirm the public name, purpose, final year, and leadership approval.</p>
            <form onSubmit={(event) => runEventHandler(saveDetails, event)} className="mt-5 grid gap-4 md:grid-cols-2">
              <FormField label="Plan name" htmlFor="draft-plan-name">
                <Input id="draft-plan-name" name="name" defaultValue={draft.name} required />
              </FormField>
              <FormField label="Final year" htmlFor="draft-plan-end">
                <Input id="draft-plan-end" name="endYear" type="number" min={draft.startYear} defaultValue={draft.endYear} required />
              </FormField>
              <FormField label="Approved by or source" htmlFor="draft-plan-source">
                <Input id="draft-plan-source" name="approvalSource" defaultValue={draft.approvalSource ?? ""} required />
              </FormField>
              <FormField label="Plain-language description" htmlFor="draft-plan-description" className="md:col-span-2">
                <Textarea id="draft-plan-description" name="description" rows={3} defaultValue={draft.description ?? ""} required />
              </FormField>
              <div className="flex flex-wrap gap-3 md:col-span-2">
                <Button type="submit" variant="primary" isLoading={busy}>Save details</Button>
                <Button onClick={() => reviewSection("plan_details")} disabled={busy}>Mark details reviewed</Button>
              </div>
            </form>
          </Card>

          <Card as="section" className="p-5" aria-labelledby="plan-structure-heading">
            <h3 id="plan-structure-heading" className="text-lg font-semibold text-ink-950">2. Plan structure</h3>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              Copied items are new records linked to their source for disclosure.
              Review every name and owner for the successor plan.
            </p>
            <div className="mt-5 space-y-4">
              {model.draftStructure.map((priority) => (
                <div key={priority.id} className="rounded-lg border border-ink-200 p-4">
                  <form onSubmit={(event) => runEventHandler((submitted) => saveItem(submitted, "priority", priority.id, priority.updatedAt), event)} className="flex flex-wrap items-end gap-3">
                    <FormField label="Priority name" htmlFor={`priority-${priority.id}`} className="min-w-64 flex-1">
                      <Input id={`priority-${priority.id}`} name="name" defaultValue={priority.name} required />
                    </FormField>
                    <Button type="submit" disabled={busy}>Save Priority</Button>
                    <Button
                      variant="danger"
                      onClick={() =>
                        setPriorityToRemove({
                          id: priority.id,
                          name: priority.name,
                        })
                      }
                      disabled={busy}
                    >
                      Remove from Draft
                    </Button>
                  </form>
                  {lineageControls("priority", priority.id)}
                  <ul className="mt-4 space-y-4">
                    {priority.goals.map((goal) => (
                      <li key={goal.id} className="rounded-lg bg-ink-50 p-3">
                        <form onSubmit={(event) => runEventHandler((submitted) => saveItem(submitted, "goal", goal.id, goal.updatedAt), event)} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                          <FormField label="Goal name" htmlFor={`goal-${goal.id}`}>
                            <Input id={`goal-${goal.id}`} name="name" defaultValue={goal.name} required />
                          </FormField>
                          <FormField label="Goal owner" htmlFor={`goal-owner-${goal.id}`}>
                            <Input id={`goal-owner-${goal.id}`} name="owner" defaultValue={goal.owner ?? ""} />
                          </FormField>
                          <Button type="submit" className="self-end" disabled={busy}>Save Goal</Button>
                        </form>
                        {lineageControls("goal", goal.id)}
                        <ul className="mt-3 space-y-3">
                          {goal.measures.map((measure) => (
                            <li key={measure.id} className="border-t border-ink-200 pt-3">
                              <form onSubmit={(event) => runEventHandler((submitted) => saveItem(submitted, "measure", measure.id, measure.updatedAt), event)} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                <FormField label="Measure name" htmlFor={`measure-${measure.id}`}>
                                  <Input id={`measure-${measure.id}`} name="name" defaultValue={measure.name} required />
                                </FormField>
                                <FormField label="Measure owner" htmlFor={`measure-owner-${measure.id}`} hint={`${measure.reportingFrequency}; ${measure.unit}`}>
                                  <Input id={`measure-owner-${measure.id}`} name="owner" defaultValue={measure.owner ?? ""} />
                                </FormField>
                                <Button type="submit" className="self-end" disabled={busy}>Save Measure</Button>
                              </form>
                              {lineageControls("kpi", measure.id)}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {model.draftStructure.length === 0 ? <p className="text-sm text-ink-600">No structure has been added yet.</p> : null}
            </div>
            {model.draftQuestions.length > 0 ? (
              <section
                className="mt-6 border-t border-ink-200 pt-5"
                aria-labelledby="draft-questions-heading"
              >
                <h4
                  id="draft-questions-heading"
                  className="text-base font-semibold text-ink-950"
                >
                  Open planning questions
                </h4>
                <p className="mt-1 text-sm leading-6 text-ink-600">
                  Answer each question before activation, or deliberately keep
                  it as a documented follow-up warning.
                </p>
                <div className="mt-4 space-y-4">
                  {model.draftQuestions.map((question) => (
                    <form
                      key={`${question.itemKind}-${question.itemId}`}
                      onSubmit={(event) =>
                        runEventHandler(
                          (submitted) =>
                            classifyQuestion(
                              submitted,
                              question.itemKind,
                              question.itemId,
                              question.updatedAt,
                            ),
                          event,
                        )
                      }
                      className="grid gap-3 rounded-lg border border-ink-200 p-4 md:grid-cols-2"
                    >
                      <div className="md:col-span-2">
                        <p className="text-sm font-semibold text-ink-950">
                          {question.itemName}
                        </p>
                        <p className="mt-1 text-sm text-ink-700">
                          {question.question}
                        </p>
                      </div>
                      <FormField
                        label="Decision"
                        htmlFor={`question-decision-${question.itemKind}-${question.itemId}`}
                      >
                        <Select
                          id={`question-decision-${question.itemKind}-${question.itemId}`}
                          name="decision"
                          defaultValue={
                            question.classification === "follow_up"
                              ? "follow_up"
                              : "resolve_now"
                          }
                        >
                          <option value="resolve_now">Answer now</option>
                          <option value="follow_up">
                            Follow up after activation
                          </option>
                        </Select>
                      </FormField>
                      <FormField
                        label="Answer or follow-up explanation"
                        htmlFor={`question-explanation-${question.itemKind}-${question.itemId}`}
                      >
                        <Textarea
                          id={`question-explanation-${question.itemKind}-${question.itemId}`}
                          name="explanation"
                          rows={2}
                          defaultValue={question.explanation ?? ""}
                          required
                        />
                      </FormField>
                      <Button
                        type="submit"
                        className="md:col-span-2 md:justify-self-start"
                        disabled={busy}
                      >
                        Save question decision
                      </Button>
                    </form>
                  ))}
                </div>
              </section>
            ) : null}
            <form onSubmit={(event) => runEventHandler(addBundle, event)} className="mt-6 grid gap-4 border-t border-ink-200 pt-5 md:grid-cols-2">
              <h4 className="text-base font-semibold text-ink-950 md:col-span-2">Add a Priority, Goal, and Measure</h4>
              <FormField label="Priority name" htmlFor="bundle-priority"><Input id="bundle-priority" name="priorityName" required /></FormField>
              <FormField label="Goal name" htmlFor="bundle-goal"><Input id="bundle-goal" name="goalName" required /></FormField>
              <FormField label="Goal owner" htmlFor="bundle-goal-owner"><Input id="bundle-goal-owner" name="goalOwner" /></FormField>
              <FormField label="Measure name" htmlFor="bundle-measure"><Input id="bundle-measure" name="measureName" required /></FormField>
              <FormField label="Measure owner" htmlFor="bundle-measure-owner"><Input id="bundle-measure-owner" name="measureOwner" /></FormField>
              <FormField label="Unit" htmlFor="bundle-unit"><Input id="bundle-unit" name="unit" placeholder="visitors, dollars, percent" required /></FormField>
              <FormField label="Value type" htmlFor="bundle-type"><Select id="bundle-type" name="unitType"><option value="count">Count</option><option value="percent">Percent</option><option value="currency">Currency</option><option value="attendance">Attendance</option></Select></FormField>
              <FormField
                label="Percent top number"
                hint="Required only for Percent. Example: Members who renewed."
                htmlFor="bundle-numerator-label"
              >
                <Input
                  id="bundle-numerator-label"
                  name="numeratorLabel"
                  placeholder="Members who renewed"
                />
              </FormField>
              <FormField
                label="Percent comparison total"
                hint="Required only for Percent. Example: Members eligible to renew."
                htmlFor="bundle-denominator-label"
              >
                <Input
                  id="bundle-denominator-label"
                  name="denominatorLabel"
                  placeholder="Members eligible to renew"
                />
              </FormField>
              <FormField label="Reporting schedule" htmlFor="bundle-frequency"><Select id="bundle-frequency" name="reportingFrequency"><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="flexible">As needed</option></Select></FormField>
              <FormField label="Desired direction" htmlFor="bundle-direction"><Select id="bundle-direction" name="direction"><option value="higher">Higher is better</option><option value="lower">Lower is better</option><option value="neutral">Informational</option></Select></FormField>
              <div className="flex flex-wrap gap-3 md:col-span-2">
                <Button type="submit" variant="primary" isLoading={busy}>Add to Draft</Button>
                <Button onClick={() => reviewSection("plan_structure")} disabled={busy}>Mark structure reviewed</Button>
              </div>
            </form>
          </Card>

          <Card as="section" className="p-5" aria-labelledby="targets-board-heading">
            <h3 id="targets-board-heading" className="text-lg font-semibold text-ink-950">3. Targets and Board view</h3>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              Targets and Baselines are never copied automatically. Add a first-year
              Target for each required Measure, then confirm what the Board may see.
            </p>
            <div className="mt-5 space-y-4">
              {model.draftStructure.flatMap((priority) => priority.goals).flatMap((goal) => goal.measures).filter((measure) => measure.requiresTarget && !measure.firstYearTargetReady).map((measure) => (
                <form key={measure.id} onSubmit={(event) => runEventHandler((submitted) => addTarget(submitted, measure.id, measure.updatedAt), event)} className="grid gap-3 rounded-lg border border-ink-200 p-4 md:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <p className="text-sm font-semibold text-ink-950">{measure.name}</p>
                    <p className="text-xs text-ink-500">First year: {draft.startYear}</p>
                    {measure.firstYearTarget &&
                    !measure.firstYearTargetReady ? (
                      <Badge>Copied Target needs review</Badge>
                    ) : null}
                  </div>
                  <FormField label={`Target (${measure.unit})`} htmlFor={`target-${measure.id}`}>
                    <Input
                      id={`target-${measure.id}`}
                      name="targetValue"
                      type="number"
                      step="any"
                      defaultValue={
                        measure.firstYearTarget?.value ?? undefined
                      }
                      required
                    />
                  </FormField>
                  <FormField label="Approval source" htmlFor={`target-source-${measure.id}`}>
                    <Input
                      id={`target-source-${measure.id}`}
                      name="sourceReference"
                      defaultValue={
                        measure.firstYearTarget?.sourceReference ?? ""
                      }
                      required
                    />
                  </FormField>
                  <Button type="submit" isLoading={busy}>
                    {measure.firstYearTarget
                      ? "Review and approve Target"
                      : "Add Target"}
                  </Button>
                  {!measure.firstYearTarget &&
                  measure.predecessorTargets.length > 0 ? (
                    <div className="flex flex-wrap gap-2 md:col-span-3">
                      <span className="w-full text-xs font-medium text-ink-600">
                        Optional former-plan starting point
                      </span>
                      {measure.predecessorTargets.map((target) => (
                        <Button
                          key={target.id}
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            copyTarget(
                              measure.id,
                              measure.updatedAt,
                              target.id,
                            )
                          }
                        >
                          Copy as Draft:{" "}
                          {target.value === null
                            ? target.description ?? "descriptive Target"
                            : `${target.value} (${target.targetYear})`}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </form>
              ))}
            </div>
            {model.draftBoard ? (
              <DraftBoardEditorClient
                key={`${draft.id}-${draft.wholePlanRevision}-${model.draftBoard.revision}`}
                draft={draft}
                structure={model.draftStructure}
                board={model.draftBoard}
                busy={busy}
                onSaved={(plans, message) => {
                  setModel(plans);
                  setFeedback({ variant: "success", message });
                  router.refresh();
                }}
              />
            ) : (
              <Alert>
                Board preparation is unavailable because its Draft record is
                missing. Ask the system operator for help.
              </Alert>
            )}
            <div className="mt-5">
              <Button
                onClick={() => reviewSection("targets_board")}
                disabled={busy}
              >
                Mark Targets reviewed
              </Button>
            </div>
          </Card>

          <Card as="section" className="p-5" aria-labelledby="activate-heading">
            <h3 id="activate-heading" className="text-lg font-semibold text-ink-950">4. Check and activate</h3>
            <p className="mt-1 text-sm text-ink-600">
              Readiness is recalculated from the latest saved version. Activation
              pauses saving, verifies a private backup, changes both plans in one
              transaction, and verifies the result before saving resumes.
            </p>
            {model.readiness ? (
              <div className="mt-5 space-y-5">
                <StatusBanner variant={model.readiness.canActivate ? "success" : "error"}>
                  {stateLabel(model.readiness.outcome.replaceAll("_", " "))}
                </StatusBanner>
                <ReadinessList title="Must be corrected" items={model.readiness.hardRules} />
                <ReadinessList title="Decisions required" items={model.readiness.requirements} />
                <ReadinessList title="Warnings to review" items={model.readiness.warnings} />
                {model.readiness.requirements.filter((item) => !item.overridden).map((item) => (
                  <form key={item.key} onSubmit={(event) => runEventHandler((submitted) => overrideRequirement(submitted, item.key), event)} className="rounded-lg border border-ink-200 p-4">
                    <p className="text-sm font-semibold text-ink-950">Record an Admin exception: {item.title}</p>
                    <FormField label="Why this exception is acceptable" htmlFor={`override-${item.key}`} className="mt-3">
                      <Textarea id={`override-${item.key}`} name="reason" rows={2} required />
                    </FormField>
                    <Button type="submit" className="mt-3" disabled={busy}>Record decision</Button>
                  </form>
                ))}
                <form onSubmit={(event) => runEventHandler(activate, event)} className="space-y-4 border-t border-ink-200 pt-5">
                  <Alert>
                    <strong>{model.active.name}</strong> ({model.active.startYear}–
                    {model.active.endYear}) becomes read-only immediately, and{" "}
                    <strong>{draft.name}</strong> ({draft.startYear}–
                    {draft.endYear}) becomes the one Active plan. Saves submitted
                    after that cutoff belong only to the successor plan.
                  </Alert>
                  <FormField label={`Enter “${draft.name}” exactly`} htmlFor="activate-name">
                    <Input id="activate-name" name="confirmationName" autoComplete="off" required />
                  </FormField>
                  <Checkbox id="activation-warnings" name="acknowledgeWarnings" label="I reviewed the warnings and understand the current plan becomes read-only immediately." />
                  <Button type="submit" variant="primary" isLoading={busy} disabled={!model.readiness.canActivate}>
                    Activate successor plan
                  </Button>
                </form>
              </div>
            ) : null}
          </Card>

          <Card as="section" className="p-5" aria-labelledby="cancel-heading">
            <h3 id="cancel-heading" className="text-lg font-semibold text-ink-950">Cancel this Draft</h3>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              Cancellation does not delete the Draft. It becomes read-only
              lifecycle history and has no effect on current reporting.
            </p>
            <form onSubmit={requestCancellation} className="mt-4 flex flex-wrap items-end gap-3">
              <FormField label={`Enter “${draft.name}” exactly`} htmlFor="cancel-name">
                <Input id="cancel-name" name="confirmationName" autoComplete="off" required />
              </FormField>
              <Button type="submit" variant="danger" disabled={busy}>Review cancellation</Button>
            </form>
          </Card>
        </>
      ) : null}

      <Card as="section" variant="quiet" className="p-5" aria-labelledby="history-heading">
        <h3 id="history-heading" className="text-lg font-semibold text-ink-950">Plan history</h3>
        <ul className="mt-3 space-y-2 text-sm text-ink-700">
          {[...model.archived, ...model.cancelled].map((plan) => (
            <li key={plan.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{plan.name} · {plan.startYear}–{plan.endYear}</span>
              <Badge>{stateLabel(plan.lifecycleState)}</Badge>
            </li>
          ))}
          {model.archived.length + model.cancelled.length === 0 ? <li>No prior plans yet.</li> : null}
        </ul>
      </Card>

      <ConfirmDialog
        open={priorityToRemove !== null}
        title="Remove this Priority from the Draft?"
        description={
          priorityToRemove
            ? `${priorityToRemove.name} and its Goals, Measures, Targets, and Board preparation will become read-only in this Draft. Existing Active and historical reporting will not change.`
            : ""
        }
        confirmLabel="Remove Priority"
        onConfirm={removePriority}
        onClose={() => setPriorityToRemove(null)}
      />
      <ConfirmDialog
        open={cancelDialogOpen}
        title="Cancel this Draft?"
        description={
          draft
            ? `${draft.name} and all of its saved work will become permanently read-only. The Active plan and historical reporting will not change.`
            : ""
        }
        confirmLabel="Cancel Draft"
        onConfirm={cancel}
        onClose={() => setCancelDialogOpen(false)}
      />
    </div>
  );
}
