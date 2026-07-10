"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Trash2 } from "lucide-react";
import {
  activeBandsForDraft,
  buildStrategicDataEntryMutation,
  deleteEndpointForRecord,
  displayStrategyLabel,
  draftFromStrategicDataEntryRecord,
  emptyStrategicDataEntryDraft,
  entryPeriodOptions,
  selectedEntryComponent,
  selectedEntryMeasurementType,
  selectedEntryUnit,
  strategicDataEntryPeriodLabel,
  strategicDataEntryRawValueLabel,
  type StrategicDataEntryDraft,
  type StrategicDataEntryErrors,
  type StrategicDataEntryPageData,
  type StrategicDataEntryRecord,
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
  IconButton,
  Input,
  PageHeader,
  Select,
  StatusBanner,
  Table,
  Textarea,
} from "@/components/ui";
import type { AverageInputMethod } from "@/features/strategy";
import { apiFetch } from "@/lib/api-client";

type Feedback = { variant: "success" | "error"; message: string } | null;

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

function ErrorHint({ error, fallback }: { error?: string; fallback?: string }) {
  return error ? (
    <span className="font-medium text-[var(--color-danger-text)]">{error}</span>
  ) : (
    fallback ?? null
  );
}

function statusVariant(status: string | null | undefined) {
  if (status === "active" || status === "ready") return "success" as const;
  if (status === "needs_definition") return "error" as const;
  if (status === "needs_target" || status === "draft") return "warning" as const;
  return "default" as const;
}

export function StrategicDataEntryClient({
  data,
}: {
  data: StrategicDataEntryPageData;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [draft, setDraft] = useState<StrategicDataEntryDraft | null>(() =>
    data.selectedKpi
      ? emptyStrategicDataEntryDraft(data.selectedKpi, data.reportingYear)
      : null,
  );
  const [errors, setErrors] = useState<StrategicDataEntryErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<StrategicDataEntryRecord | null>(
    null,
  );
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(
      data.selectedKpi
        ? emptyStrategicDataEntryDraft(data.selectedKpi, data.reportingYear)
        : null,
    );
    setErrors({});
    setEditingRecordId(null);
  }, [data.reportingYear, data.selectedKpi]);

  function navigateSelection(year: number, kpiId: number | null) {
    const params = new URLSearchParams({ year: String(year) });
    if (kpiId !== null) params.set("kpi", String(kpiId));
    setFeedback(null);
    startNavigation(() => router.replace(`/admin/strategy-data?${params.toString()}`));
  }

  function updateDraft<K extends keyof StrategicDataEntryDraft>(
    key: K,
    value: StrategicDataEntryDraft[K],
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => {
      const next = { ...current };
      delete next[String(key)];
      return next;
    });
  }

  function resetForm() {
    if (!data.selectedKpi) return;
    setDraft(emptyStrategicDataEntryDraft(data.selectedKpi, data.reportingYear));
    setErrors({});
    setEditingRecordId(null);
  }

  function editSavedRecord(record: StrategicDataEntryRecord) {
    if (!data.selectedKpi) return;
    setDraft(draftFromStrategicDataEntryRecord(data.selectedKpi, record));
    setEditingRecordId(record.id);
    setErrors({});
    setFeedback({
      variant: "success",
      message: `Loaded ${strategicDataEntryPeriodLabel(record)}. Saving will update this period without creating a duplicate.`,
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data.selectedKpi || !draft) return;
    setFeedback(null);
    const built = buildStrategicDataEntryMutation(
      data.selectedKpi,
      data.reportingYear,
      draft,
    );
    if (!built.ok) {
      setErrors(built.errors);
      setFeedback({
        variant: "error",
        message:
          Object.values(built.errors)[0] ?? "Review the highlighted value fields.",
      });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const response = await apiFetch(built.mutation.endpoint, {
        method: "POST",
        body: built.mutation.body,
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        issues?: unknown;
      };
      if (!response.ok) {
        const detail = issueMessage(body.issues);
        setFeedback({
          variant: "error",
          message: detail
            ? `${body.error ?? "Invalid value"}: ${detail}`
            : body.error ?? "The value could not be saved.",
        });
        return;
      }
      setFeedback({
        variant: "success",
        message:
          editingRecordId === null
            ? "Strategic KPI value saved."
            : "Saved value updated.",
      });
      setEditingRecordId(null);
      setDraft(emptyStrategicDataEntryDraft(data.selectedKpi, data.reportingYear));
      router.refresh();
    } catch {
      setFeedback({
        variant: "error",
        message: "The request could not be completed. Check the connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteRecord) return;
    const record = deleteRecord;
    setDeleteRecord(null);
    setBusy(true);
    setFeedback(null);
    try {
      const response = await apiFetch(deleteEndpointForRecord(record), {
        method: "DELETE",
        body: { id: record.id },
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setFeedback({
          variant: "error",
          message: body.error ?? "The saved value could not be deleted.",
        });
        return;
      }
      if (editingRecordId === record.id) resetForm();
      setFeedback({ variant: "success", message: "Saved value deleted." });
      router.refresh();
    } catch {
      setFeedback({
        variant: "error",
        message: "The delete request could not be completed.",
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
        eyebrow="Admin · Strategy"
        title="Strategic data entry"
        subtitle="Enter the raw values behind annual progress, component results, and demographic distributions. Calculated percentages remain derived from these source inputs."
        actions={
          data.selectedKpi ? (
            <Badge variant={statusVariant(data.selectedKpi.configurationStatus)}>
              {displayStrategyLabel(data.selectedKpi.configurationStatus)}
            </Badge>
          ) : null
        }
      />

      {feedback ? (
        <StatusBanner
          variant={feedback.variant}
          onDismiss={() => setFeedback(null)}
        >
          {feedback.message}
        </StatusBanner>
      ) : null}
      {data.loadError ? (
        <StatusBanner variant="error">{data.loadError}</StatusBanner>
      ) : null}

      <Card as="section" className="mb-5 p-5" aria-labelledby="strategy-value-selection-title">
        <h2 id="strategy-value-selection-title" className="sr-only">
          Select strategic KPI and reporting year
        </h2>
        <FilterToolbar className="bg-transparent p-0 shadow-none">
          <FormField
            label="Strategic KPI"
            htmlFor="strategy-data-kpi"
            className="w-full min-w-0 flex-1 lg:min-w-96"
          >
            <Select
              id="strategy-data-kpi"
              value={data.selectedKpiId ?? ""}
              disabled={isNavigating || data.kpis.length === 0}
              onChange={(event) =>
                navigateSelection(data.reportingYear, Number(event.target.value))
              }
            >
              {data.kpis.length === 0 ? (
                <option value="">No strategic KPIs available</option>
              ) : null}
              {data.kpis.map((kpi) => (
                <option key={kpi.id} value={kpi.id}>
                  {kpi.name} — {kpi.priorityName}
                </option>
              ))}
            </Select>
          </FormField>
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
                navigateSelection(Number(event.target.value), data.selectedKpiId)
              }
            >
              {data.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </FormField>
        </FilterToolbar>
      </Card>

      {selectedData && draft ? (
        <>
          <KpiContext data={selectedData} draft={draft} />
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.45fr)]">
            <div ref={formRef} className="scroll-mt-6">
              <EntryForm
                data={selectedData}
                draft={draft}
                errors={errors}
                editingRecordId={editingRecordId}
                busy={busy}
                updateDraft={updateDraft}
                resetForm={resetForm}
                submit={submit}
              />
            </div>
            <SavedValues
              data={selectedData}
              busy={busy}
              onEdit={editSavedRecord}
              onDelete={setDeleteRecord}
            />
          </div>
        </>
      ) : (
        <Card className="min-h-72 p-6">
          <EmptyState
            title="Value entry is unavailable"
            description={
              selectedOption
                ? `Configure ${selectedOption.name} with a measurement type and reporting frequency before entering values.`
                : "Choose a strategic KPI with an effective measurement configuration."
            }
          />
        </Card>
      )}

      <ConfirmDialog
        open={deleteRecord !== null}
        title="Delete this saved value?"
        description={
          deleteRecord
            ? `${strategicDataEntryPeriodLabel(deleteRecord)} will be removed. Its immutable audit snapshot will remain available in history.`
            : "The saved value will be removed."
        }
        confirmLabel="Delete value"
        onConfirm={confirmDelete}
        onClose={() => setDeleteRecord(null)}
      />
    </div>
  );
}

function KpiContext({
  data,
  draft,
}: {
  data: StrategicDataEntryPageData & {
    selectedKpi: NonNullable<StrategicDataEntryPageData["selectedKpi"]>;
  };
  draft: StrategicDataEntryDraft;
}) {
  const component = selectedEntryComponent(data.selectedKpi, draft);
  const measurementType = selectedEntryMeasurementType(data.selectedKpi, draft);
  const unit = selectedEntryUnit(data.selectedKpi, draft);
  return (
    <Card variant="quiet" className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4 p-5 lg:grid-cols-4">
      {[
        ["Measurement type", displayStrategyLabel(measurementType)],
        ["Reporting frequency", displayStrategyLabel(data.selectedKpi.reportingFrequency)],
        ["Unit", unit || "No unit"],
        ["Plan context", component?.label ?? data.selectedKpi.goalName],
      ].map(([label, value]) => (
        <div key={label} className="min-w-0 border-l-2 border-brand-200 pl-3">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
            {label}
          </p>
          <p className="mt-1 break-words text-sm font-medium text-ink-900">{value}</p>
        </div>
      ))}
    </Card>
  );
}

function EntryForm({
  data,
  draft,
  errors,
  editingRecordId,
  busy,
  updateDraft,
  resetForm,
  submit,
}: {
  data: StrategicDataEntryPageData & {
    selectedKpi: NonNullable<StrategicDataEntryPageData["selectedKpi"]>;
  };
  draft: StrategicDataEntryDraft;
  errors: StrategicDataEntryErrors;
  editingRecordId: number | null;
  busy: boolean;
  updateDraft: <K extends keyof StrategicDataEntryDraft>(
    key: K,
    value: StrategicDataEntryDraft[K],
  ) => void;
  resetForm: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const kpi = data.selectedKpi;
  const measurementType = selectedEntryMeasurementType(kpi, draft);
  const periodOptions = entryPeriodOptions(kpi, draft, data.reportingYear);
  const bands = activeBandsForDraft(kpi, draft);

  return (
    <Card as="section" className="p-5 lg:p-6" aria-labelledby="strategy-entry-form-title">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="strategy-entry-form-title" className="text-xl font-semibold text-ink-900">
            {editingRecordId === null ? "Enter value" : "Update saved value"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-500">
            Save raw source values. The calculation layer derives all percentages and averages.
          </p>
        </div>
        <Badge variant="info">{displayStrategyLabel(measurementType)}</Badge>
      </div>

      {editingRecordId !== null ? (
        <StatusBanner variant="neutral" className="mb-5">
          Editing saved record #{editingRecordId}. The existing period will be updated in place.
        </StatusBanner>
      ) : null}

      <form onSubmit={submit} className="space-y-6">
        <fieldset disabled={busy} className="space-y-6">
          {kpi.measurementType === "multi_component" ? (
            <FormField
              label="KPI component"
              htmlFor="strategy-entry-component"
              hint={<ErrorHint error={errors.componentId} />}
            >
              <Select
                id="strategy-entry-component"
                value={draft.componentId}
                aria-invalid={Boolean(errors.componentId)}
                onChange={(event) => {
                  const next = emptyStrategicDataEntryDraft(kpi, data.reportingYear);
                  updateDraft("componentId", event.target.value);
                  updateDraft("bandCounts", next.bandCounts);
                  updateDraft("value", "");
                  updateDraft("binaryValue", "");
                  updateDraft("numerator", "");
                  updateDraft("denominator", "");
                }}
              >
                <option value="">Choose a component</option>
                {kpi.components.map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.label} — {displayStrategyLabel(component.measurementType)}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}

          <PeriodFields
            data={data}
            draft={draft}
            errors={errors}
            options={periodOptions}
            updateDraft={updateDraft}
          />

          <MeasurementFields
            data={data}
            draft={draft}
            errors={errors}
            measurementType={measurementType}
            bands={bands}
            updateDraft={updateDraft}
          />

          <div className="grid grid-cols-1 gap-4">
            <FormField label="Notes" htmlFor="strategy-entry-notes" hint="Optional context for this reporting period.">
              <Textarea
                id="strategy-entry-notes"
                value={draft.notes}
                maxLength={4000}
                onChange={(event) => updateDraft("notes", event.target.value)}
              />
            </FormField>
            <FormField label="Source reference" htmlFor="strategy-entry-source" hint="Name the survey, workbook, system extract, or other source.">
              <Input
                id="strategy-entry-source"
                value={draft.sourceReference}
                maxLength={2000}
                onChange={(event) => updateDraft("sourceReference", event.target.value)}
              />
            </FormField>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-5">
          <Button type="submit" variant="primary" icon={Save} isLoading={busy}>
            {editingRecordId === null ? "Save value" : "Update value"}
          </Button>
          {editingRecordId !== null ? (
            <Button type="button" variant="ghost" onClick={resetForm} disabled={busy}>
              Cancel edit
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function PeriodFields({
  data,
  draft,
  errors,
  options,
  updateDraft,
}: {
  data: StrategicDataEntryPageData & {
    selectedKpi: NonNullable<StrategicDataEntryPageData["selectedKpi"]>;
  };
  draft: StrategicDataEntryDraft;
  errors: StrategicDataEntryErrors;
  options: ReturnType<typeof entryPeriodOptions>;
  updateDraft: <K extends keyof StrategicDataEntryDraft>(
    key: K,
    value: StrategicDataEntryDraft[K],
  ) => void;
}) {
  const frequency = data.selectedKpi.reportingFrequency;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {frequency === "flexible" ? (
        <FormField label="Reporting mode" htmlFor="strategy-entry-mode">
          <Select
            id="strategy-entry-mode"
            value={draft.flexibleMode}
            onChange={(event) => {
              const mode = event.target.value as "monthly" | "annual";
              updateDraft("flexibleMode", mode);
              updateDraft("periodIndex", mode === "monthly" ? "1" : "0");
            }}
          >
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </Select>
        </FormField>
      ) : null}
      {options.length > 1 ? (
        <FormField
          label={frequency === "quarterly" ? "Quarter" : "Month"}
          htmlFor="strategy-entry-period"
          hint={<ErrorHint error={errors.periodIndex} />}
        >
          <Select
            id="strategy-entry-period"
            value={draft.periodIndex}
            aria-invalid={Boolean(errors.periodIndex)}
            onChange={(event) => updateDraft("periodIndex", event.target.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>
      ) : (
        <div className="rounded-lg bg-ink-50 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(31,22,51,0.08)] sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
            Reporting period
          </p>
          <p className="mt-1 text-sm font-medium text-ink-900">
            {options[0]?.label ?? `Reporting year ${data.reportingYear}`}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            No month selector is required for this frequency.
          </p>
        </div>
      )}
    </div>
  );
}

function MeasurementFields({
  data,
  draft,
  errors,
  measurementType,
  bands,
  updateDraft,
}: {
  data: StrategicDataEntryPageData & {
    selectedKpi: NonNullable<StrategicDataEntryPageData["selectedKpi"]>;
  };
  draft: StrategicDataEntryDraft;
  errors: StrategicDataEntryErrors;
  measurementType: ReturnType<typeof selectedEntryMeasurementType>;
  bands: ReturnType<typeof activeBandsForDraft>;
  updateDraft: <K extends keyof StrategicDataEntryDraft>(
    key: K,
    value: StrategicDataEntryDraft[K],
  ) => void;
}) {
  const unit = selectedEntryUnit(data.selectedKpi, draft);
  const component = selectedEntryComponent(data.selectedKpi, draft);
  const fixedDenominator = component?.fixedDenominator ?? data.selectedKpi.fixedDenominator;

  if (
    measurementType === "count" ||
    measurementType === "currency" ||
    measurementType === "cumulative" ||
    measurementType === "year_over_year"
  ) {
    return (
      <FormField
        label={measurementType === "currency" ? "Amount" : "Value"}
        htmlFor="strategy-entry-value"
        hint={<ErrorHint error={errors.value} fallback={unit ? `Reported in ${unit}.` : undefined} />}
      >
        <Input
          id="strategy-entry-value"
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
        htmlFor="strategy-entry-binary"
        hint={<ErrorHint error={errors.binaryValue} fallback="Both complete and not complete are explicit saved values." />}
      >
        <Select
          id="strategy-entry-binary"
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
        htmlFor="strategy-entry-milestone"
        hint={<ErrorHint error={errors.value} fallback="Enter a value from 0 through 100 percent." />}
      >
        <Input
          id="strategy-entry-milestone"
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
          label="Numerator"
          htmlFor="strategy-entry-numerator"
          hint={<ErrorHint error={errors.numerator} fallback="Enter the raw numerator, not a calculated percent." />}
        >
          <Input
            id="strategy-entry-numerator"
            type="number"
            min={0}
            step="any"
            value={draft.numerator}
            aria-invalid={Boolean(errors.numerator)}
            onChange={(event) => updateDraft("numerator", event.target.value)}
          />
        </FormField>
        <FormField
          label="Denominator"
          htmlFor="strategy-entry-denominator"
          hint={
            <ErrorHint
              error={errors.denominator}
              fallback={
                fixedDenominator === null
                  ? "Enter the raw denominator."
                  : `Uses configured fixed denominator ${fixedDenominator}.`
              }
            />
          }
        >
          <Input
            id="strategy-entry-denominator"
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
      <AverageFields draft={draft} errors={errors} updateDraft={updateDraft} />
    );
  }

  if (measurementType === "distribution") {
    return (
      <DistributionFields
        draft={draft}
        errors={errors}
        bands={bands}
        updateDraft={updateDraft}
      />
    );
  }

  return (
    <StatusBanner variant="error">
      Choose a configured atomic component before entering a value.
    </StatusBanner>
  );
}

function AverageFields({
  draft,
  errors,
  updateDraft,
}: {
  draft: StrategicDataEntryDraft;
  errors: StrategicDataEntryErrors;
  updateDraft: <K extends keyof StrategicDataEntryDraft>(
    key: K,
    value: StrategicDataEntryDraft[K],
  ) => void;
}) {
  return (
    <div className="space-y-4">
      <FormField label="Average input method" htmlFor="strategy-entry-average-method">
        <Select
          id="strategy-entry-average-method"
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
          <FormField label="Positive responses" htmlFor="strategy-entry-positive" hint={<ErrorHint error={errors.positiveResponseCount} />}>
            <Input
              id="strategy-entry-positive"
              type="number"
              min={0}
              step={1}
              value={draft.positiveResponseCount}
              aria-invalid={Boolean(errors.positiveResponseCount)}
              onChange={(event) => updateDraft("positiveResponseCount", event.target.value)}
            />
          </FormField>
          <FormField label="Total responses" htmlFor="strategy-entry-total-responses" hint={<ErrorHint error={errors.totalResponseCount} />}>
            <Input
              id="strategy-entry-total-responses"
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
          <FormField label="Respondent count" htmlFor="strategy-entry-respondents" hint={<ErrorHint error={errors.respondentCount} />}>
            <Input
              id="strategy-entry-respondents"
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
              <FormField label="Average score" htmlFor="strategy-entry-average-score" hint={<ErrorHint error={errors.averageScore} />}>
                <Input
                  id="strategy-entry-average-score"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.averageScore}
                  aria-invalid={Boolean(errors.averageScore)}
                  onChange={(event) => updateDraft("averageScore", event.target.value)}
                />
              </FormField>
              <FormField label="Maximum scale value" htmlFor="strategy-entry-scale-max" hint={<ErrorHint error={errors.maxScorePerRespondent} />}>
                <Input
                  id="strategy-entry-scale-max"
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
              <FormField label="Total score" htmlFor="strategy-entry-total-score" hint={<ErrorHint error={errors.totalScore} />}>
                <Input
                  id="strategy-entry-total-score"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.totalScore}
                  aria-invalid={Boolean(errors.totalScore)}
                  onChange={(event) => updateDraft("totalScore", event.target.value)}
                />
              </FormField>
              <FormField label="Total possible score" htmlFor="strategy-entry-total-possible" hint={<ErrorHint error={errors.totalPossibleScore} fallback="Provide this or the maximum score per respondent." />}>
                <Input
                  id="strategy-entry-total-possible"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.totalPossibleScore}
                  aria-invalid={Boolean(errors.totalPossibleScore)}
                  onChange={(event) => updateDraft("totalPossibleScore", event.target.value)}
                />
              </FormField>
              <FormField label="Maximum score per respondent" htmlFor="strategy-entry-max-per-respondent" hint={<ErrorHint error={errors.maxScorePerRespondent} fallback="Optional when total possible score is entered." />}>
                <Input
                  id="strategy-entry-max-per-respondent"
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

function DistributionFields({
  draft,
  errors,
  bands,
  updateDraft,
}: {
  draft: StrategicDataEntryDraft;
  errors: StrategicDataEntryErrors;
  bands: ReturnType<typeof activeBandsForDraft>;
  updateDraft: <K extends keyof StrategicDataEntryDraft>(
    key: K,
    value: StrategicDataEntryDraft[K],
  ) => void;
}) {
  return (
    <div className="space-y-5">
      <FormField label="Respondent total" htmlFor="strategy-entry-distribution-total" hint={<ErrorHint error={errors.respondentCount} fallback="The denominator represented by these category counts." />}>
        <Input
          id="strategy-entry-distribution-total"
          type="number"
          min={0}
          step={1}
          value={draft.respondentCount}
          aria-invalid={Boolean(errors.respondentCount)}
          onChange={(event) => updateDraft("respondentCount", event.target.value)}
        />
      </FormField>
      <Checkbox
        id="strategy-entry-exclusive"
        label="Categories are mutually exclusive"
        description="When selected, every respondent must be allocated exactly once, including unknown or declined bands."
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
          No effective distribution bands are configured for this KPI or component.
        </StatusBanner>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {bands.map((band) => (
            <FormField
              key={band.id}
              label={band.label}
              htmlFor={`strategy-entry-band-${band.id}`}
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
                id={`strategy-entry-band-${band.id}`}
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

function SavedValues({
  data,
  busy,
  onEdit,
  onDelete,
}: {
  data: StrategicDataEntryPageData & {
    selectedKpi: NonNullable<StrategicDataEntryPageData["selectedKpi"]>;
  };
  busy: boolean;
  onEdit: (record: StrategicDataEntryRecord) => void;
  onDelete: (record: StrategicDataEntryRecord) => void;
}) {
  const componentUnits = useMemo(
    () =>
      new Map(
        data.selectedKpi.components.map((component) => [
          component.id,
          component.unit,
        ]),
      ),
    [data.selectedKpi.components],
  );
  return (
    <Card as="section" className="overflow-hidden" aria-labelledby="saved-strategy-values-title">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-200 p-5 lg:px-6">
        <div>
          <h2 id="saved-strategy-values-title" className="text-xl font-semibold text-ink-900">
            Saved values
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {data.reportingYear} raw entries and immutable source context.
          </p>
        </div>
        <Badge variant="info">{data.records.length} saved</Badge>
      </div>

      {data.records.length === 0 ? (
        <EmptyState
          className="min-h-72"
          title="No values saved for this year"
          description="Choose the reporting period, enter the raw source values, and save the first record."
        />
      ) : (
        <Table minWidth="760px">
          <caption className="sr-only">
            Saved strategic values for {data.selectedKpi.name} in {data.reportingYear}
          </caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Component</th>
              <th scope="col">Raw value</th>
              <th scope="col">Notes and source</th>
              <th scope="col" className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.records.map((record) => {
              const unit =
                record.componentId === null
                  ? data.selectedKpi.unit
                  : componentUnits.get(record.componentId) ?? null;
              return (
                <tr key={`${record.kind}:${record.id}`}>
                  <td className="font-medium text-ink-900">
                    {strategicDataEntryPeriodLabel(record)}
                  </td>
                  <td>{record.componentLabel ?? "Primary KPI"}</td>
                  <td>
                    <p className="font-mono text-sm tabular-nums text-ink-900">
                      {strategicDataEntryRawValueLabel(record, unit)}
                    </p>
                    {record.kind === "distribution" ? (
                      <p className="mt-1 max-w-xs text-xs leading-5 text-ink-500">
                        {[...record.bands]
                          .sort(
                            (left, right) =>
                              left.displayOrder - right.displayOrder ||
                              left.bandId - right.bandId,
                          )
                          .map((band) => `${band.labelSnapshot}: ${band.count}`)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td>
                    <p className="max-w-xs break-words text-sm text-ink-700">
                      {record.notes ?? "No notes"}
                    </p>
                    <p className="mt-1 max-w-xs break-words text-xs text-ink-500">
                      {record.sourceReference ?? "No source reference"}
                    </p>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <IconButton
                        icon={Pencil}
                        label={`Edit ${strategicDataEntryPeriodLabel(record)}`}
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onEdit(record)}
                      />
                      <IconButton
                        icon={Trash2}
                        label={`Delete ${strategicDataEntryPeriodLabel(record)}`}
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => onDelete(record)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
