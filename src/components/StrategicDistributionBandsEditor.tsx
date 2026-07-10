"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Plus, RotateCcw, Save } from "lucide-react";
import type { DistributionDerivedGroup, MeasurementType } from "@/features/strategy";
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

function ErrorHint({ error, fallback }: { error?: string; fallback?: string }) {
  return error ? (
    <span className="font-medium text-[var(--color-danger-text)]">{error}</span>
  ) : (
    fallback ?? null
  );
}

export function StrategicDistributionBandsEditor({
  kpiId,
  componentId = null,
  reportingYear,
  measurementType,
  bands: initialBands,
  runMutation,
  ownerLabel,
}: {
  kpiId: number;
  componentId?: number | null;
  reportingYear: number;
  measurementType: MeasurementType | null;
  bands: StrategicDistributionBandEditorRecord[];
  runMutation: StrategyEditorMutationRunner;
  ownerLabel?: string;
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
          Distribution-band controls become available after the KPI measurement type is set to Distribution and saved.
        </StatusBanner>
      </Card>
    );
  }

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
                ? "Distribution band archived. Historical labels remain intact."
                : "Distribution band restored.",
          }
        : {
            variant: "error",
            message: result.error ?? `Could not ${action} distribution band.`,
          },
    );
  }

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
        message: result.error ?? "Could not reorder distribution bands.",
      });
      return;
    }
    setFeedback({ variant: "success", message: "Distribution-band order saved." });
  }

  return (
    <div className="space-y-6">
      <StatusBanner variant="neutral">
        These are reusable band definitions for {ownerLabel ?? "this measurement"}, not respondent counts. Observation values are entered separately and historical label snapshots are preserved.
      </StatusBanner>
      {feedback ? <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner> : null}

      <DistributionBandFormCard
        key={`${ownerKey}-new-band-${active.length}`}
        title="Add demographic band"
        description="Create a stable band key and label for distribution observations."
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
              Effective demographic bands
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              Reporting year {reportingYear}; move controls save the complete active order.
            </p>
          </div>
          <Badge variant="info">{active.length} active</Badge>
        </div>

        {active.length === 0 ? (
          <Card className="p-6">
            <StatusBanner variant="neutral">
              No effective demographic bands are configured for this reporting year.
            </StatusBanner>
          </Card>
        ) : (
          active.map((band, index) => (
            <DistributionBandFormCard
              key={`${band.id}-${band.displayOrder}`}
              title={band.label}
              description={`Band #${band.id} · ${band.slug}`}
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
              Archived demographic bands
            </h3>
            <Badge variant="default">{archived.length} archived</Badge>
          </div>
          {archived.map((band) => (
            <Card key={band.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="break-words font-semibold text-ink-900">{band.label}</p>
                <p className="mt-1 text-xs text-ink-500">
                  {band.slug} · Effective {band.effectiveFromYear}
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
                Restore band
              </Button>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}

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

  function update<K extends keyof DistributionBandFormDraft>(
    key: K,
    value: DistributionBandFormDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const built = buildDistributionBandPayload(draft, kpiId, componentId);
    if (!built.ok) {
      setErrors(built.errors);
      setFeedback({
        variant: "error",
        message: firstFormError(built.errors) ?? "Review the demographic-band fields.",
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
            message: isCreate ? "Distribution band created." : "Distribution band saved.",
          }
        : {
            variant: "error",
            message: result.error ?? "Could not save distribution band.",
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
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={busy} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FormField label="Stable slug" htmlFor={`${prefix}-slug`} hint={<ErrorHint error={errors.slug} fallback="Lowercase kebab-case. Historical observation labels remain snapshotted." />}>
            <Input
              id={`${prefix}-slug`}
              value={draft.slug}
              aria-invalid={Boolean(errors.slug)}
              onChange={(event) => update("slug", event.target.value)}
            />
          </FormField>
          <FormField label="Display label" htmlFor={`${prefix}-label`} hint={<ErrorHint error={errors.label} />}>
            <Input
              id={`${prefix}-label`}
              value={draft.label}
              aria-invalid={Boolean(errors.label)}
              onChange={(event) => update("label", event.target.value)}
            />
          </FormField>
          <FormField label="Derived group" htmlFor={`${prefix}-group`} hint="Optional white/non-white rollup; leave blank when the band should not contribute.">
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
              <option value="">No derived group</option>
              <option value="white">White</option>
              <option value="non_white">Non-white</option>
            </Select>
          </FormField>
          <FormField label="Effective start year" htmlFor={`${prefix}-start`} hint={<ErrorHint error={errors.effective_from_year} />}>
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
          <FormField label="Effective end year" htmlFor={`${prefix}-end`} hint={<ErrorHint error={errors.effective_to_year} fallback="Leave blank for no end year." />}>
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
          <FormField label="Display order" htmlFor={`${prefix}-order`} hint={<ErrorHint error={errors.display_order} fallback={isCreate ? "New bands append at this position." : "Use the arrow controls to reorder."} />}>
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
              label="Unknown category"
              description="Marks this band as an unknown response."
            />
            <Checkbox
              id={`${prefix}-declined`}
              checked={draft.isDeclined}
              aria-invalid={Boolean(errors.isDeclined)}
              onChange={(event) => update("isDeclined", event.target.checked)}
              label="Declined category"
              description={errors.isDeclined ?? "Marks this band as declined to answer."}
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
            {isCreate ? "Create band" : "Save band"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
