"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import {
  activeBandsForDraft,
  buildStrategicDataEntryRequests,
  buildStrategicDataEntryMutation,
  displayStrategyLabel,
  initialStrategicDataEntryDrafts,
  PRIMARY_DATA_ENTRY_DRAFT,
  selectedEntryComponent,
  selectedEntryMeasurementType,
  selectedEntryUnit,
  type StrategicDataEntryDraft,
  type StrategicDataEntryDrafts,
  type StrategicDataEntryErrors,
  type StrategicDataEntryPageData,
} from "@/components/strategic-data-entry-model";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  FilterToolbar,
  FormField,
  Input,
  PageHeader,
  Select,
  StatusBanner,
  Textarea,
} from "@/components/ui";
import type { AverageInputMethod } from "@/features/strategy";
import { apiFetch } from "@/lib/api-client";
import { runEventHandler } from "@/lib/async-event";
import { useUnsavedChanges } from "@/components/UnsavedChangesContext";

type Feedback = {
  variant: "success" | "error";
  message: string;
  retry?: boolean;
  kind?: "offline";
} | null;

type PendingSelection = {
  year: number;
  period: string;
  kpiId: number | null;
  showSaved?: boolean;
};

/** Implements the issue message operation. */
function issueMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = issueMessage(item);
      if (nested) return nested;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    const message = issueMessage(nested);
    if (message) return message;
  }
  return null;
}

/** Renders the error hint interface. */
function ErrorHint({ error, fallback }: { error?: string; fallback?: string }) {
  return error ? (
    <span className="font-medium text-(--color-danger-text)">{error}</span>
  ) : (
    fallback ?? null
  );
}

/** Implements the status variant operation. */
function statusVariant(status: string | null | undefined) {
  if (status === "active" || status === "ready") return "success" as const;
  if (status === "needs_definition") return "warning" as const;
  if (status === "needs_target" || status === "draft") return "incomplete" as const;
  return "default" as const;
}

/** Renders the strategic data entry client interface. */
export function StrategicDataEntryClient({
  data,
  saved = false,
}: {
  data: StrategicDataEntryPageData;
  saved?: boolean;
}) {
  const router = useRouter();
  const { setState: setUnsavedState } = useUnsavedChanges();
  const [isNavigating, startNavigation] = useTransition();
  const initialDrafts = useMemo<StrategicDataEntryDrafts>(
    () => data.selectedKpi
      ? initialStrategicDataEntryDrafts(
          data.selectedKpi,
          data.reportingYear,
          data.reportingPeriod,
          data.records,
        )
      : {},
    [data.records, data.reportingPeriod, data.reportingYear, data.selectedKpi],
  );
  const [drafts, setDrafts] = useState<StrategicDataEntryDrafts>(initialDrafts);
  const [baselineDrafts, setBaselineDrafts] = useState<StrategicDataEntryDrafts>(initialDrafts);
  const [errors, setErrors] = useState<Record<string, StrategicDataEntryErrors>>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const returnFocusKpiId = useRef<number | null>(null);
  const isDirty = useMemo(
    () => JSON.stringify(drafts) !== JSON.stringify(baselineDrafts),
    [baselineDrafts, drafts],
  );

  useEffect(() => {
    setUnsavedState({ dirty: isDirty, busy });
    return () => setUnsavedState({ dirty: false, busy: false });
  }, [busy, isDirty, setUnsavedState]);

  useEffect(() => {
    setDrafts(initialDrafts);
    setBaselineDrafts(initialDrafts);
    setErrors({});
  }, [initialDrafts]);

  useEffect(() => {
    if (saved) {
      setFeedback({ variant: "success", message: "Saved." });
    }
  }, [saved]);

  useEffect(() => {
    /** Updates connection state. */
    function updateConnectionState() {
      setIsOnline(window.navigator.onLine);
    }
    updateConnectionState();
    window.addEventListener("online", updateConnectionState);
    window.addEventListener("offline", updateConnectionState);
    return () => {
      window.removeEventListener("online", updateConnectionState);
      window.removeEventListener("offline", updateConnectionState);
    };
  }, []);

  useEffect(() => {
    if (isOnline && feedback?.kind === "offline") setFeedback(null);
  }, [feedback?.kind, isOnline]);

  useEffect(() => {
    if (data.showSelectedKpi || returnFocusKpiId.current === null) return;
    const kpiId = returnFocusKpiId.current;
    returnFocusKpiId.current = null;
    requestAnimationFrame(() => {
      document.getElementById(`data-entry-checklist-${kpiId}`)?.focus();
    });
  }, [data.showSelectedKpi]);

  /** Implements the request selection operation. */
  function requestSelection(selection: PendingSelection) {
    if (isDirty) {
      setPendingSelection(selection);
      return;
    }
    replaceSelection(selection, true);
  }

  /** Implements the replace selection operation. */
  function replaceSelection(
    selection: PendingSelection,
    clearFeedback: boolean,
  ) {
    const params = new URLSearchParams({
      year: String(selection.year),
      period: selection.period,
    });
    if (selection.kpiId !== null) params.set("kpi", String(selection.kpiId));
    if (selection.showSaved) params.set("saved", "1");
    if (clearFeedback) setFeedback(null);
    startNavigation(() => router.replace(`/data-entry?${params.toString()}`));
  }

  /** Updates draft. */
  function updateDraft<K extends keyof StrategicDataEntryDraft>(
    draftKey: string,
    key: K,
    value: StrategicDataEntryDraft[K],
  ) {
    setFeedback(null);
    setDrafts((current) => ({
      ...current,
      [draftKey]: { ...current[draftKey], [key]: value },
    }));
    setErrors((current) => {
      const next = { ...current, [draftKey]: { ...(current[draftKey] ?? {}) } };
      delete next[draftKey][String(key)];
      return next;
    });
  }

  /** Runs the submit workflow. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data.selectedKpi) return;
    if (!window.navigator.onLine) {
      setFeedback({
        variant: "error",
        kind: "offline",
        message: "You're offline. Your unsaved changes are still here. Reconnect before trying again.",
      });
      return;
    }
    setFeedback(null);
    const built = Object.entries(drafts).map(([draftKey, draft]) => ({
      draftKey,
      result: buildStrategicDataEntryMutation(
        data.selectedKpi!,
        data.reportingYear,
        draft,
      ),
    }));
    const invalid = built.filter((entry) => !entry.result.ok);
    if (invalid.length > 0) {
      setErrors(Object.fromEntries(
        invalid.map((entry) => [entry.draftKey, entry.result.errors]),
      ));
      const firstError = invalid.flatMap((entry) =>
        Object.values(entry.result.errors),
      )[0];
      setFeedback({
        variant: "error",
        message: firstError ?? "Review the highlighted fields.",
        retry: true,
      });
      window.requestAnimationFrame(() => {
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus();
      });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const requests = buildStrategicDataEntryRequests(
        built.flatMap((entry) =>
          entry.result.ok ? [entry.result.mutation] : [],
        ),
      );
      for (const request of requests) {
        const response = await apiFetch(request.endpoint, {
          method: "POST",
          body: request.body,
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          issues?: unknown;
        };
        if (response.ok) continue;
        const detail = issueMessage(body.issues);
        setFeedback({
          variant: "error",
          message: detail
            ? `${body.error ?? "Invalid value"}: ${detail}`
            : body.error ?? "Couldn't save. Your entries are still here.",
          retry: true,
        });
        return;
      }
      setBaselineDrafts(drafts);
      setFeedback({ variant: "success", message: "Saved." });
      const selectedIndex = data.kpis.findIndex((kpi) => kpi.id === data.selectedKpiId);
      const next = [...data.kpis.slice(selectedIndex + 1), ...data.kpis.slice(0, selectedIndex)]
        .find((kpi) => kpi.checklistStatus !== "complete" && kpi.id !== data.selectedKpiId);
      if (next) {
        replaceSelection({
          year: data.reportingYear,
          period: data.reportingPeriod.value,
          kpiId: next.id,
          showSaved: true,
        }, false);
      }
      else router.refresh();
    } catch {
      const offline = !window.navigator.onLine;
      setFeedback({
        variant: "error",
        kind: offline ? "offline" : undefined,
        message: offline
          ? "You're offline. Your unsaved changes are still here. Reconnect before trying again."
          : "Couldn't save. Check the connection and try again. Your entries are still here.",
        retry: !offline,
      });
    } finally {
      setBusy(false);
    }
  }

  const selectedOption = data.kpis.find((kpi) => kpi.id === data.selectedKpiId);
  const selectedData =
    data.selectedKpi === null
      ? null
      : { ...data, selectedKpi: data.selectedKpi };

  return (
    <div className="page-content page-content-wide page-enter">
      <PageHeader
        title="Data Entry"
        actions={
          data.selectedKpi && data.showSelectedKpi ? (
            <Badge variant={statusVariant(data.selectedKpi.configurationStatus)} label="Setup status">
              {data.selectedKpi.configurationStatus === "active" ||
              data.selectedKpi.configurationStatus === "ready"
                ? "Ready"
                : "Needs attention"}
            </Badge>
          ) : null
        }
      />

      {!isOnline ? (
        <StatusBanner variant="error">
          You&apos;re offline. Keep editing if needed; saving is available after you reconnect.
        </StatusBanner>
      ) : feedback ? (
        <StatusBanner
          variant={feedback.variant}
          onDismiss={() => setFeedback(null)}
        >
          <span className="inline-flex flex-wrap items-center gap-3">
            <span>{feedback.message}</span>
            {feedback.retry && isOnline ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => formRef.current?.requestSubmit()}
              >
                Try again
              </Button>
            ) : null}
          </span>
        </StatusBanner>
      ) : null}
      {!feedback && busy ? (
        <StatusBanner variant="neutral">Saving…</StatusBanner>
      ) : !feedback && isDirty ? (
        <StatusBanner variant="neutral">Unsaved changes</StatusBanner>
      ) : null}
      {data.loadError ? (
        <StatusBanner variant="error">{data.loadError}</StatusBanner>
      ) : null}

      <section className="mb-6 border-b border-ink-200 pb-6" aria-labelledby="strategy-value-selection-title">
        <h2 id="strategy-value-selection-title" className="sr-only">
          Select reporting year and period
        </h2>
        <FilterToolbar className="bg-transparent p-0 shadow-none">
          <FormField
            label="Reporting year"
            htmlFor="strategy-data-year"
            className="w-full sm:w-44"
          >
            <Select
              id="strategy-data-year"
              value={data.reportingYear}
              disabled={isNavigating}
              onChange={(event) =>
                requestSelection({
                  year: Number(event.target.value),
                  period: data.reportingPeriod.value,
                  kpiId: null,
                })
              }
            >
              {data.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Reporting period"
            htmlFor="strategy-data-period"
            className="w-full sm:w-64"
          >
            <Select
              id="strategy-data-period"
              value={data.reportingPeriod.value}
              disabled={isNavigating}
              onChange={(event) =>
                requestSelection({
                  year: data.reportingYear,
                  period: event.target.value,
                  kpiId: null,
                })
              }
            >
              {data.reportingPeriods.map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </Select>
          </FormField>
        </FilterToolbar>
      </section>

      {selectedData && Object.keys(drafts).length > 0 ? (
          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[22rem_minmax(0,1fr)]">
            <div className={data.showSelectedKpi ? "hidden md:block" : "block"}>
              <Checklist
                data={data}
                onSelect={(kpiId) => requestSelection({
                  year: data.reportingYear,
                  period: data.reportingPeriod.value,
                  kpiId,
                })}
              />
            </div>
            <div className={data.showSelectedKpi ? "block" : "hidden md:block"}>
              <Button
                type="button"
                variant="ghost"
                icon={ArrowLeft}
                className="mb-4 md:hidden"
                onClick={() => {
                  returnFocusKpiId.current = data.selectedKpiId;
                  requestSelection({
                    year: data.reportingYear,
                    period: data.reportingPeriod.value,
                    kpiId: null,
                  });
                }}
              >
                Back to list
              </Button>
              <KpiContext data={selectedData} />
              <div className="scroll-mt-6">
              <EntryForm
                data={selectedData}
                drafts={drafts}
                errors={errors}
                busy={busy}
                offline={!isOnline}
                updateDraft={updateDraft}
                submit={submit}
                formRef={formRef}
              />
              </div>
            </div>
          </div>
      ) : (
        <Card className="min-h-72 p-6">
          <EmptyState
            title="Value entry is unavailable"
            description={
              selectedOption
                ? `Finish setup for ${selectedOption.name} before entering results.`
                : "No measures are ready for this reporting period."
            }
          />
        </Card>
      )}

      <ConfirmDialog
        open={pendingSelection !== null}
        title="Leave without saving?"
        description="Your changes have not been saved. Stay here to keep working, or leave and discard them."
        confirmLabel="Leave form"
        cancelLabel="Keep editing"
        onConfirm={() => {
          const selection = pendingSelection;
          setPendingSelection(null);
          if (selection) replaceSelection(selection, true);
        }}
        onClose={() => setPendingSelection(null)}
      />
    </div>
  );
}

/** Renders the checklist interface. */
function Checklist({
  data,
  onSelect,
}: {
  data: StrategicDataEntryPageData;
  onSelect: (kpiId: number) => void;
}) {
  const counts = {
    complete: data.kpis.filter((kpi) => kpi.checklistStatus === "complete").length,
    needsAttention: data.kpis.filter((kpi) => kpi.checklistStatus === "needs_attention").length,
  };
  return (
    <Card as="section" className="overflow-hidden" aria-labelledby="reporting-checklist-title">
      <div className="border-b border-ink-200 p-4">
        <h2 id="reporting-checklist-title" className="font-semibold text-ink-950">Reporting checklist</h2>
        <p className="mt-1 text-sm text-ink-600">
          {counts.complete} of {data.kpis.length} complete
          {counts.needsAttention > 0 ? ` · ${counts.needsAttention} need attention` : ""}
        </p>
      </div>
      <ol className="max-h-168 divide-y divide-ink-100 overflow-y-auto">
        {data.kpis.map((kpi) => (
          <li key={kpi.id}>
            <Button
              id={`data-entry-checklist-${kpi.id}`}
              type="button"
              variant="ghost"
              className={`h-auto min-h-14 w-full flex-col items-start justify-start gap-2 rounded-none px-4 py-3 text-left font-medium normal-case tracking-normal active:scale-100 ${
                data.selectedKpiId === kpi.id
                  ? "bg-brand-50 font-semibold text-ink-950 ring-1 ring-inset ring-brand-200"
                  : ""
              }`}
              onClick={() => onSelect(kpi.id)}
              aria-current={data.selectedKpiId === kpi.id ? "step" : undefined}
            >
              <span className="w-full min-w-0 whitespace-normal wrap-break-word text-left leading-5">
                {kpi.name}
              </span>
              <Badge
                className="shrink-0"
                variant={
                  kpi.checklistStatus === "complete"
                    ? "success"
                    : kpi.checklistStatus === "needs_attention"
                      ? "warning"
                      : "default"
                }
              >
                {kpi.checklistStatus === "complete"
                  ? "Complete"
                  : kpi.checklistStatus === "needs_attention"
                    ? "Needs attention"
                    : "Not started"}
              </Badge>
            </Button>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Renders the kpi context interface. */
function KpiContext({
  data,
}: {
  data: StrategicDataEntryPageData & {
    selectedKpi: NonNullable<StrategicDataEntryPageData["selectedKpi"]>;
  };
}) {
  return (
    <header className="mb-5 border-b border-ink-200 pb-5">
      <p className="text-sm font-medium text-brand-700">{data.selectedKpi.priorityName}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink-950">
        {data.selectedKpi.name}
      </h2>
      <p className="mt-2 text-sm text-ink-600">
        {data.selectedKpi.goalName} · {data.reportingPeriod.label} {data.reportingYear}
      </p>
    </header>
  );
}

/** Renders the entry form interface. */
function EntryForm({
  data,
  drafts,
  errors,
  busy,
  offline,
  updateDraft,
  submit,
  formRef,
}: {
  data: StrategicDataEntryPageData & {
    selectedKpi: NonNullable<StrategicDataEntryPageData["selectedKpi"]>;
  };
  drafts: StrategicDataEntryDrafts;
  errors: Record<string, StrategicDataEntryErrors>;
  busy: boolean;
  offline: boolean;
  updateDraft: <K extends keyof StrategicDataEntryDraft>(
    draftKey: string,
    key: K,
    value: StrategicDataEntryDraft[K],
  ) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  formRef: React.RefObject<HTMLFormElement | null>;
}) {
  const kpi = data.selectedKpi;
  const entries = kpi.measurementType === "multi_component"
    ? kpi.components.map((component) => ({
        key: String(component.id),
        label: component.label,
        draft: drafts[String(component.id)],
      }))
    : [{
        key: PRIMARY_DATA_ENTRY_DRAFT,
        label: kpi.name,
        draft: drafts[PRIMARY_DATA_ENTRY_DRAFT],
      }];

  return (
    <Card as="section" className="p-5 lg:p-6" aria-labelledby="strategy-entry-form-title">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="strategy-entry-form-title" className="text-xl font-semibold text-ink-900">
            Enter results
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-500">
            {data.reportingPeriod.label} · save every input with one action.
          </p>
        </div>
        <span className="text-sm font-medium tabular-nums text-ink-600">
          {entries.length === 1 ? "1 input" : `${entries.length} inputs`}
        </span>
      </div>

      <form
        ref={formRef}
        onSubmit={(event) => runEventHandler(submit, event)}
        className="space-y-6"
      >
        <fieldset disabled={busy} className="divide-y divide-ink-200">
          {entries.map((entry, index) => {
            if (!entry.draft) return null;
            const measurementType = selectedEntryMeasurementType(kpi, entry.draft);
            const bands = activeBandsForDraft(kpi, entry.draft);
            const fieldErrors = errors[entry.key] ?? {};
            const prefix = `strategy-entry-${entry.key}`;
            return (
              <section
                key={entry.key}
                className={index === 0 ? "pb-6" : "py-6"}
                aria-labelledby={`${prefix}-title`}
              >
                <div className="mb-5">
                  {entries.length > 1 ? (
                    <h3 id={`${prefix}-title`} className="font-semibold text-ink-950">
                      {entry.label}
                    </h3>
                  ) : (
                    <h3 id={`${prefix}-title`} className="sr-only">{entry.label}</h3>
                  )}
                  <p className="mt-1 text-sm text-ink-500">
                    {displayStrategyLabel(measurementType)}
                    {selectedEntryUnit(kpi, entry.draft)
                      ? ` · ${selectedEntryUnit(kpi, entry.draft)}`
                      : ""}
                  </p>
                </div>

                <MeasurementFields
                  data={data}
                  draft={entry.draft}
                  errors={fieldErrors}
                  measurementType={measurementType}
                  bands={bands}
                  idPrefix={prefix}
                  updateDraft={(key, value) => updateDraft(entry.key, key, value)}
                />

                <div className="mt-5 grid grid-cols-1 gap-4">
                  <FormField label="Notes" htmlFor={`${prefix}-notes`} hint="Optional">
                    <Textarea
                      id={`${prefix}-notes`}
                      value={entry.draft.notes}
                      maxLength={4000}
                      onChange={(event) => updateDraft(entry.key, "notes", event.target.value)}
                    />
                  </FormField>
                  <FormField label="Source" htmlFor={`${prefix}-source`} hint="Survey, workbook, or system name">
                    <Input
                      id={`${prefix}-source`}
                      value={entry.draft.sourceReference}
                      maxLength={2000}
                      onChange={(event) => updateDraft(entry.key, "sourceReference", event.target.value)}
                    />
                  </FormField>
                </div>
              </section>
            );
          })}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-5">
          <Button
            type="submit"
            variant="primary"
            icon={Save}
            isLoading={busy}
            disabled={offline}
          >
            {offline ? "Save unavailable offline" : "Save and continue"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Renders the measurement fields interface. */
function MeasurementFields({
  data,
  draft,
  errors,
  measurementType,
  bands,
  idPrefix,
  updateDraft,
}: {
  data: StrategicDataEntryPageData & {
    selectedKpi: NonNullable<StrategicDataEntryPageData["selectedKpi"]>;
  };
  draft: StrategicDataEntryDraft;
  errors: StrategicDataEntryErrors;
  measurementType: ReturnType<typeof selectedEntryMeasurementType>;
  bands: ReturnType<typeof activeBandsForDraft>;
  idPrefix: string;
  updateDraft: <K extends keyof StrategicDataEntryDraft>(
    key: K,
    value: StrategicDataEntryDraft[K],
  ) => void;
}) {
  const unit = selectedEntryUnit(data.selectedKpi, draft);
  const component = selectedEntryComponent(data.selectedKpi, draft);
  const fixedDenominator = component?.fixedDenominator ?? data.selectedKpi.fixedDenominator;
  const numeratorLabel = component?.numeratorLabel ??
    data.selectedKpi.numeratorLabel ??
    "Amount measured";
  const denominatorLabel = component?.denominatorLabel ??
    data.selectedKpi.denominatorLabel ??
    "Total amount";

  if (
    measurementType === "count" ||
    measurementType === "currency" ||
    measurementType === "cumulative" ||
    measurementType === "year_over_year"
  ) {
    return (
      <FormField
        label={measurementType === "currency" ? "Amount" : "Value"}
        htmlFor={`${idPrefix}-value`}
        hint={<ErrorHint error={errors.value} fallback={unit ? `Reported in ${unit}.` : undefined} />}
      >
        <Input
          id={`${idPrefix}-value`}
          type="number"
          step="any"
          value={draft.value}
          aria-invalid={Boolean(errors.value)}
          onChange={(event) => updateDraft("value", event.target.value)}
        />
      </FormField>
    );
  }

  if (measurementType === "binary") {
    return (
      <FormField
        label="Completion state"
        htmlFor={`${idPrefix}-binary`}
        hint={<ErrorHint error={errors.binaryValue} fallback="Both complete and not complete are explicit saved values." />}
      >
        <Select
          id={`${idPrefix}-binary`}
          value={draft.binaryValue}
          aria-invalid={Boolean(errors.binaryValue)}
          onChange={(event) =>
            updateDraft("binaryValue", event.target.value as "" | "0" | "1")
          }
        >
          <option value="">Choose a state</option>
          <option value="0">Not complete</option>
          <option value="1">Complete</option>
        </Select>
      </FormField>
    );
  }

  if (measurementType === "milestone") {
    return (
      <FormField
        label="Milestone progress"
        htmlFor={`${idPrefix}-milestone`}
        hint={<ErrorHint error={errors.value} fallback="Enter a value from 0 through 100 percent." />}
      >
        <Input
          id={`${idPrefix}-milestone`}
          type="number"
          min={0}
          max={100}
          step="any"
          value={draft.value}
          aria-invalid={Boolean(errors.value)}
          onChange={(event) => updateDraft("value", event.target.value)}
        />
      </FormField>
    );
  }

  if (measurementType === "percentage" || measurementType === "ratio") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label={numeratorLabel}
          htmlFor={`${idPrefix}-numerator`}
          hint={<ErrorHint error={errors.numerator} fallback="Enter the measured amount, not a calculated percent." />}
        >
          <Input
            id={`${idPrefix}-numerator`}
            type="number"
            min={0}
            step="any"
            value={draft.numerator}
            aria-invalid={Boolean(errors.numerator)}
            onChange={(event) => updateDraft("numerator", event.target.value)}
          />
        </FormField>
        <FormField
          label={denominatorLabel}
          htmlFor={`${idPrefix}-denominator`}
          hint={
            <ErrorHint
              error={errors.denominator}
              fallback={
                fixedDenominator === null
                  ? "Enter the total used for this calculation."
                  : `Uses the set total of ${fixedDenominator}.`
              }
            />
          }
        >
          <Input
            id={`${idPrefix}-denominator`}
            type="number"
            min={0}
            step="any"
            value={fixedDenominator === null ? draft.denominator : String(fixedDenominator)}
            disabled={fixedDenominator !== null}
            aria-invalid={Boolean(errors.denominator)}
            onChange={(event) => updateDraft("denominator", event.target.value)}
          />
        </FormField>
      </div>
    );
  }

  if (measurementType === "average") {
    return (
      <AverageFields
        draft={draft}
        errors={errors}
        idPrefix={idPrefix}
        updateDraft={updateDraft}
      />
    );
  }

  if (measurementType === "distribution") {
    return (
      <DistributionFields
        draft={draft}
        errors={errors}
        bands={bands}
        idPrefix={idPrefix}
        updateDraft={updateDraft}
      />
    );
  }

  return (
    <StatusBanner variant="error">
      Finish setting up this input before entering a value.
    </StatusBanner>
  );
}

/** Renders the average fields interface. */
function AverageFields({
  draft,
  errors,
  idPrefix,
  updateDraft,
}: {
  draft: StrategicDataEntryDraft;
  errors: StrategicDataEntryErrors;
  idPrefix: string;
  updateDraft: <K extends keyof StrategicDataEntryDraft>(
    key: K,
    value: StrategicDataEntryDraft[K],
  ) => void;
}) {
  return (
    <div className="space-y-4">
      <FormField label="How was the average calculated?" htmlFor={`${idPrefix}-average-method`}>
        <Select
          id={`${idPrefix}-average-method`}
          value={draft.averageMethod}
          onChange={(event) =>
            updateDraft("averageMethod", event.target.value as AverageInputMethod)
          }
        >
          <option value="total_score">Total score ÷ possible score</option>
          <option value="average_score">Average score ÷ scale maximum</option>
          <option value="percent_positive">Positive responses ÷ total responses</option>
        </Select>
      </FormField>

      {draft.averageMethod === "percent_positive" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Positive responses" htmlFor={`${idPrefix}-positive`} hint={<ErrorHint error={errors.positiveResponseCount} />}>
            <Input
              id={`${idPrefix}-positive`}
              type="number"
              min={0}
              step={1}
              value={draft.positiveResponseCount}
              aria-invalid={Boolean(errors.positiveResponseCount)}
              onChange={(event) => updateDraft("positiveResponseCount", event.target.value)}
            />
          </FormField>
          <FormField label="Total responses" htmlFor={`${idPrefix}-total-responses`} hint={<ErrorHint error={errors.totalResponseCount} />}>
            <Input
              id={`${idPrefix}-total-responses`}
              type="number"
              min={0}
              step={1}
              value={draft.totalResponseCount}
              aria-invalid={Boolean(errors.totalResponseCount)}
              onChange={(event) => updateDraft("totalResponseCount", event.target.value)}
            />
          </FormField>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Number of responses" htmlFor={`${idPrefix}-respondents`} hint={<ErrorHint error={errors.respondentCount} />}>
            <Input
              id={`${idPrefix}-respondents`}
              type="number"
              min={1}
              step={1}
              value={draft.respondentCount}
              aria-invalid={Boolean(errors.respondentCount)}
              onChange={(event) => updateDraft("respondentCount", event.target.value)}
            />
          </FormField>
          {draft.averageMethod === "average_score" ? (
            <>
              <FormField label="Average score" htmlFor={`${idPrefix}-average-score`} hint={<ErrorHint error={errors.averageScore} />}>
                <Input
                  id={`${idPrefix}-average-score`}
                  type="number"
                  min={0}
                  step="any"
                  value={draft.averageScore}
                  aria-invalid={Boolean(errors.averageScore)}
                  onChange={(event) => updateDraft("averageScore", event.target.value)}
                />
              </FormField>
              <FormField label="Highest possible score" htmlFor={`${idPrefix}-scale-max`} hint={<ErrorHint error={errors.maxScorePerRespondent} />}>
                <Input
                  id={`${idPrefix}-scale-max`}
                  type="number"
                  min={0}
                  step="any"
                  value={draft.maxScorePerRespondent}
                  aria-invalid={Boolean(errors.maxScorePerRespondent)}
                  onChange={(event) => updateDraft("maxScorePerRespondent", event.target.value)}
                />
              </FormField>
            </>
          ) : (
            <>
              <FormField label="Total score" htmlFor={`${idPrefix}-total-score`} hint={<ErrorHint error={errors.totalScore} />}>
                <Input
                  id={`${idPrefix}-total-score`}
                  type="number"
                  min={0}
                  step="any"
                  value={draft.totalScore}
                  aria-invalid={Boolean(errors.totalScore)}
                  onChange={(event) => updateDraft("totalScore", event.target.value)}
                />
              </FormField>
              <FormField label="Total possible score" htmlFor={`${idPrefix}-total-possible`} hint={<ErrorHint error={errors.totalPossibleScore} fallback="Use this or the highest possible score per response." />}>
                <Input
                  id={`${idPrefix}-total-possible`}
                  type="number"
                  min={0}
                  step="any"
                  value={draft.totalPossibleScore}
                  aria-invalid={Boolean(errors.totalPossibleScore)}
                  onChange={(event) => updateDraft("totalPossibleScore", event.target.value)}
                />
              </FormField>
              <FormField label="Highest score per response" htmlFor={`${idPrefix}-max-per-respondent`} hint={<ErrorHint error={errors.maxScorePerRespondent} fallback="Optional when total possible score is entered." />}>
                <Input
                  id={`${idPrefix}-max-per-respondent`}
                  type="number"
                  min={0}
                  step="any"
                  value={draft.maxScorePerRespondent}
                  aria-invalid={Boolean(errors.maxScorePerRespondent)}
                  onChange={(event) => updateDraft("maxScorePerRespondent", event.target.value)}
                />
              </FormField>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Renders the distribution fields interface. */
function DistributionFields({
  draft,
  errors,
  bands,
  idPrefix,
  updateDraft,
}: {
  draft: StrategicDataEntryDraft;
  errors: StrategicDataEntryErrors;
  bands: ReturnType<typeof activeBandsForDraft>;
  idPrefix: string;
  updateDraft: <K extends keyof StrategicDataEntryDraft>(
    key: K,
    value: StrategicDataEntryDraft[K],
  ) => void;
}) {
  return (
    <div className="space-y-5">
      <FormField label="Total responses" htmlFor={`${idPrefix}-distribution-total`} hint={<ErrorHint error={errors.respondentCount} fallback="The total represented by these groups." />}>
        <Input
          id={`${idPrefix}-distribution-total`}
          type="number"
          min={0}
          step={1}
          value={draft.respondentCount}
          aria-invalid={Boolean(errors.respondentCount)}
          onChange={(event) => updateDraft("respondentCount", event.target.value)}
        />
      </FormField>
      <Checkbox
        id={`${idPrefix}-exclusive`}
        label="Each response belongs to one group"
        description="Select this when every response should be counted exactly once, including unknown or declined groups."
        checked={draft.mutuallyExclusive}
        onChange={(event) => updateDraft("mutuallyExclusive", event.target.checked)}
      />
      {errors.bands ? (
        <StatusBanner variant="error" className="mb-0">
          {errors.bands}
        </StatusBanner>
      ) : null}
      {bands.length === 0 ? (
        <StatusBanner variant="error" className="mb-0">
          No reporting groups have been set up for this measure.
        </StatusBanner>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {bands.map((band) => (
            <FormField
              key={band.id}
              label={band.label}
              htmlFor={`${idPrefix}-band-${band.id}`}
              hint={
                <ErrorHint
                  error={errors[`band.${band.id}`]}
                  fallback={
                    band.isUnknown
                      ? "Unknown response band"
                      : band.isDeclined
                        ? "Declined response band"
                        : undefined
                  }
                />
              }
            >
              <Input
                id={`${idPrefix}-band-${band.id}`}
                type="number"
                min={0}
                step={1}
                value={draft.bandCounts[String(band.id)] ?? ""}
                aria-invalid={Boolean(errors[`band.${band.id}`])}
                onChange={(event) =>
                  updateDraft("bandCounts", {
                    ...draft.bandCounts,
                    [String(band.id)]: event.target.value,
                  })
                }
              />
            </FormField>
          ))}
        </div>
      )}
    </div>
  );
}
