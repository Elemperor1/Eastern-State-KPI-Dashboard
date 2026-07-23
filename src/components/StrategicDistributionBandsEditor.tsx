"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, ArrowDown, ArrowUp, Plus, RotateCcw, Save } from "lucide-react";
import type { DistributionDerivedGroup, MeasurementType } from "@/features/strategy";
import { runEventHandler } from "@/lib/async-event";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  FormField,
  IconButton,
  Input,
  Select,
  StatusBanner,
} from "@/components/ui";
import {
  buildDistributionBandLifecycleMutation,
  buildDistributionBandMutation,
  buildDistributionBandPayload,
  buildDistributionBandReorderMutation,
  distributionBandDraftFromData,
  firstFormError,
  moveId,
  type DistributionBandFormDraft,
  type StrategicDistributionBandEditorRecord,
  type StrategyEditorFormErrors,
  type StrategyEditorMutationRunner,
} from "./strategic-kpi-editor-model";

type Feedback = { variant: "success" | "error"; message: string } | null;

/** Renders the error hint interface. */
function ErrorHint({ error, fallback }: { error?: string; fallback?: string }) {
  return error ? (
    <span className="font-medium text-(--color-danger-text)">{error}</span>
  ) : (
    fallback ?? null
  );
}

/** Renders the strategic distribution bands editor interface. */
export function StrategicDistributionBandsEditor({
  kpiId,
  componentId = null,
  reportingYear,
  measurementType,
  bands: initialBands,
  runMutation,
}: {
  kpiId: number;
  componentId?: number | null;
  reportingYear: number;
  measurementType: MeasurementType | null;
  bands: StrategicDistributionBandEditorRecord[];
  runMutation: StrategyEditorMutationRunner;
}) {
  const ownerBands = useMemo(
    () => initialBands.filter((band) => band.componentId === componentId),
    [componentId, initialBands],
  );
  const [bands, setBands] = useState(ownerBands);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => setBands(ownerBands), [ownerBands]);

  const ownerKey = componentId === null ? `kpi-${kpiId}` : `component-${componentId}`;

  const active = useMemo(
    () =>
      bands
        .filter((band) => band.archivedAt === null)
        .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id),
    [bands],
  );
  const archived = useMemo(
    () => bands.filter((band) => band.archivedAt !== null),
    [bands],
  );

  if (measurementType !== "distribution") {
    return (
      <Card className="p-6">
        <StatusBanner variant="neutral">
          Choose “Reporting groups” above before adding groups here.
        </StatusBanner>
      </Card>
    );
  }

  /** Implements the lifecycle operation. */
  async function lifecycle(id: number, action: "archive" | "restore") {
    setBusyId(id);
    setFeedback(null);
    const result = await runMutation(
      buildDistributionBandLifecycleMutation(id, action),
    );
    setBusyId(null);
    setFeedback(
      result.ok
        ? {
            variant: "success",
            message:
              action === "archive"
                ? "Group archived."
                : "Group restored.",
          }
        : {
            variant: "error",
            message: result.error ?? `Could not ${action} this group.`,
          },
    );
  }

  /** Implements the reorder operation. */
  async function reorder(id: number, direction: "up" | "down") {
    const next = moveId(active, id, direction);
    if (next === active) return;
    const ordered = next.map((band, displayOrder) => ({
      ...band,
      displayOrder,
    }));
    const before = bands;
    setBands([...ordered, ...archived]);
    setBusyId(id);
    setFeedback(null);
    const result = await runMutation(
      buildDistributionBandReorderMutation(
        kpiId,
        reportingYear,
        ordered.map((band) => band.id),
        componentId,
      ),
    );
    setBusyId(null);
    if (!result.ok) {
      setBands(before);
      setFeedback({
        variant: "error",
        message: result.error ?? "Could not reorder groups.",
      });
      return;
    }
    setFeedback({ variant: "success", message: "Group order saved." });
  }

  return (
    <div className="space-y-6">
      {feedback ? <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner> : null}

      <DistributionBandFormCard
        key={`${ownerKey}-new-band-${active.length}`}
        title="Add group"
        description=""
        initialDraft={distributionBandDraftFromData(
          null,
          reportingYear,
          active.length,
        )}
        kpiId={kpiId}
        componentId={componentId}
        idPrefix={`${ownerKey}-new-band`}
        runMutation={runMutation}
        isCreate
      />

      <section aria-labelledby={`${ownerKey}-active-distribution-bands-title`} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id={`${ownerKey}-active-distribution-bands-title`} className="text-xl font-semibold text-ink-900">
              Reporting groups
            </h3>
          </div>
          <Badge variant="info">{active.length} active</Badge>
        </div>

        {active.length === 0 ? (
          <Card className="p-6">
            <StatusBanner variant="neutral">
              No groups have been added for {reportingYear}.
            </StatusBanner>
          </Card>
        ) : (
          active.map((band, index) => (
            <DistributionBandFormCard
              key={`${band.id}-${band.displayOrder}`}
              title={band.label}
              description=""
              initialDraft={distributionBandDraftFromData(
                band,
                reportingYear,
                index,
              )}
              kpiId={kpiId}
              componentId={componentId}
              idPrefix={`${ownerKey}-band-${band.id}`}
              runMutation={runMutation}
              actions={
                <div className="flex gap-1">
                  <IconButton
                    icon={ArrowUp}
                    label={`Move ${band.label} up`}
                    size="sm"
                    variant="ghost"
                    disabled={index === 0 || busyId !== null}
                    onClick={() => reorder(band.id, "up")}
                  />
                  <IconButton
                    icon={ArrowDown}
                    label={`Move ${band.label} down`}
                    size="sm"
                    variant="ghost"
                    disabled={index === active.length - 1 || busyId !== null}
                    onClick={() => reorder(band.id, "down")}
                  />
                  <IconButton
                    icon={Archive}
                    label={`Archive ${band.label}`}
                    size="sm"
                    variant="danger"
                    disabled={busyId !== null}
                    onClick={() => lifecycle(band.id, "archive")}
                  />
                </div>
              }
            />
          ))
        )}
      </section>

      {archived.length > 0 ? (
        <section aria-labelledby={`${ownerKey}-archived-distribution-bands-title`} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id={`${ownerKey}-archived-distribution-bands-title`} className="text-xl font-semibold text-ink-900">
              Archived groups
            </h3>
            <Badge variant="default">{archived.length} archived</Badge>
          </div>
          {archived.map((band) => (
            <Card key={band.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="wrap-break-word font-semibold text-ink-900">{band.label}</p>
                <p className="mt-1 text-xs text-ink-500">
                  Used from {band.effectiveFromYear}
                  {band.effectiveToYear ? `–${band.effectiveToYear}` : " onward"}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={RotateCcw}
                isLoading={busyId === band.id}
                disabled={busyId !== null && busyId !== band.id}
                onClick={() => lifecycle(band.id, "restore")}
              >
                Restore group
              </Button>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}

/** Renders the distribution band form card interface. */
function DistributionBandFormCard({
  title,
  description,
  initialDraft,
  kpiId,
  componentId,
  idPrefix,
  runMutation,
  isCreate = false,
  actions,
}: {
  title: string;
  description: string;
  initialDraft: DistributionBandFormDraft;
  kpiId: number;
  componentId: number | null;
  idPrefix: string;
  runMutation: StrategyEditorMutationRunner;
  isCreate?: boolean;
  actions?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<StrategyEditorFormErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const prefix = idPrefix;

  /** Updates the current state. */
  function update<K extends keyof DistributionBandFormDraft>(
    key: K,
    value: DistributionBandFormDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors({});
  }

  /** Runs the submit workflow. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const built = buildDistributionBandPayload(draft, kpiId, componentId);
    if (!built.ok) {
      setErrors(built.errors);
      setFeedback({
        variant: "error",
        message: firstFormError(built.errors) ?? "Review the highlighted fields.",
      });
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await runMutation(
      buildDistributionBandMutation(built.payload, isCreate),
    );
    setBusy(false);
    setFeedback(
      result.ok
        ? {
            variant: "success",
            message: isCreate ? "Group created." : "Group saved.",
          }
        : {
            variant: "error",
            message: result.error ?? "Could not save this group.",
          },
    );
    if (result.ok && isCreate) {
      setDraft(
        distributionBandDraftFromData(
          null,
          Number(draft.effectiveFromYear),
          Number(draft.displayOrder) + 1,
        ),
      );
    }
  }

  return (
    <Card as="section" className="p-5 lg:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-500">{description}</p>
        </div>
        {actions}
      </div>
      {feedback ? <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner> : null}
      <form
        onSubmit={(event) => runEventHandler(submit, event)}
        className="space-y-5"
      >
        <fieldset disabled={busy} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FormField label="Group name" htmlFor={`${prefix}-label`} hint={<ErrorHint error={errors.label ?? errors.slug} />}>
            <Input
              id={`${prefix}-label`}
              value={draft.label}
              aria-invalid={Boolean(errors.label ?? errors.slug)}
              onChange={(event) => update("label", event.target.value)}
            />
          </FormField>
          <FormField label="Include in summary" htmlFor={`${prefix}-group`}>
            <Select
              id={`${prefix}-group`}
              value={draft.derivedGroup}
              onChange={(event) =>
                update(
                  "derivedGroup",
                  event.target.value as DistributionDerivedGroup | "",
                )
              }
            >
              <option value="">Do not include</option>
              <option value="white">White</option>
              <option value="non_white">Non-white</option>
            </Select>
          </FormField>
          <FormField label="First reporting year" htmlFor={`${prefix}-start`} hint={<ErrorHint error={errors.effective_from_year} />}>
            <Input
              id={`${prefix}-start`}
              type="number"
              min={1900}
              max={2100}
              value={draft.effectiveFromYear}
              aria-invalid={Boolean(errors.effective_from_year)}
              onChange={(event) => update("effectiveFromYear", event.target.value)}
            />
          </FormField>
          <FormField label="Last reporting year" htmlFor={`${prefix}-end`} hint={<ErrorHint error={errors.effective_to_year} fallback="Leave blank to keep using it." />}>
            <Input
              id={`${prefix}-end`}
              type="number"
              min={1900}
              max={2100}
              value={draft.effectiveToYear}
              aria-invalid={Boolean(errors.effective_to_year)}
              onChange={(event) => update("effectiveToYear", event.target.value)}
            />
          </FormField>
          <FormField label="List order" htmlFor={`${prefix}-order`} hint={<ErrorHint error={errors.display_order} />}>
            <Input
              id={`${prefix}-order`}
              type="number"
              min={0}
              step={1}
              value={draft.displayOrder}
              disabled={!isCreate}
              aria-invalid={Boolean(errors.display_order)}
              onChange={(event) => update("displayOrder", event.target.value)}
            />
          </FormField>
          <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Checkbox
              id={`${prefix}-unknown`}
              checked={draft.isUnknown}
              onChange={(event) => update("isUnknown", event.target.checked)}
              label="Unknown"
            />
            <Checkbox
              id={`${prefix}-declined`}
              checked={draft.isDeclined}
              aria-invalid={Boolean(errors.isDeclined)}
              onChange={(event) => update("isDeclined", event.target.checked)}
              label="Declined to answer"
              description={errors.isDeclined}
            />
          </div>
        </fieldset>
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            icon={isCreate ? Plus : Save}
            isLoading={busy}
          >
            {isCreate ? "Create group" : "Save group"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
