"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AGGREGATION_METHODS,
  BOARD_STATUSES,
  CONFIGURATION_STATUSES,
  MEASUREMENT_TYPES,
  STRATEGY_REPORTING_FREQUENCIES,
  type AggregationMethod,
  type BoardStatus,
  type ConfigurationStatus,
  type MeasurementType,
  type StrategyReportingFrequency,
} from "@/features/strategy";
import { apiFetch } from "@/lib/api-client";
import { runEventHandler } from "@/lib/async-event";
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  FormField,
  FilterToolbar,
  Input,
  LinkButton,
  Select,
  StatusBanner,
  Textarea,
} from "@/components/ui";
import {
  buildConfigurationFormPayload,
  buildConfigurationMutation,
  buildSuccessorConfigurationMutation,
  canCreateMeasurementSuccessor,
  configurationDraftFromData,
  firstFormError,
  successorConfigurationDraftFromData,
  type ConfigurationFormDraft,
  type StrategicKpiEditorData,
  type StrategyEditorFormErrors,
  type StrategyEditorMutation,
  type StrategyEditorMutationRunner,
} from "@/components/strategic-kpi-editor-model";
import { StrategicKpiComponentsEditor } from "@/components/StrategicKpiComponentsEditor";
import { StrategicDistributionBandsEditor } from "@/components/StrategicDistributionBandsEditor";

type Feedback = { variant: "success" | "error"; message: string } | null;

const EDITABLE_CONFIGURATION_STATUSES = CONFIGURATION_STATUSES.filter(
  (status) => status !== "archived",
);

function displayLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toLocaleUpperCase());
}

function measurementLabel(value: MeasurementType): string {
  const labels: Record<MeasurementType, string> = {
    binary: "Yes or no",
    milestone: "Milestone progress",
    count: "Number",
    percentage: "Percentage",
    average: "Average",
    cumulative: "Running total",
    year_over_year: "Change from last year",
    distribution: "Reporting groups",
    currency: "Money",
    ratio: "Ratio",
    multi_component: "Several related inputs",
  };
  return labels[value];
}

function frequencyLabel(value: StrategyReportingFrequency): string {
  if (value === "annual") return "Yearly";
  if (value === "one_time") return "One time";
  if (value === "cumulative") return "Running total";
  if (value === "flexible") return "As needed";
  return displayLabel(value);
}

function aggregationLabel(value: AggregationMethod): string {
  const labels: Record<AggregationMethod, string> = {
    none: "Keep separate",
    average: "Average",
    weighted_average: "Weighted average",
    sum: "Add together",
    ratio: "Calculate a ratio",
    all_complete: "All inputs complete",
  };
  return labels[value];
}

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
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  for (const nested of Object.values(record)) {
    const message = issueMessage(nested);
    if (message) return message;
  }
  return null;
}

function ErrorHint({ error, fallback }: { error?: string; fallback?: string }) {
  if (error) return <span className="font-medium text-[var(--color-danger-text)]">{error}</span>;
  return fallback ?? null;
}

export function StrategicKpiEditorClient({ data }: { data: StrategicKpiEditorData }) {
  const router = useRouter();

  const runMutation = useCallback<StrategyEditorMutationRunner>(
    async (mutation: StrategyEditorMutation) => {
      try {
        const response = await apiFetch(mutation.endpoint, {
          method: mutation.method,
          body: mutation.body,
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          issues?: unknown;
        };
        if (!response.ok) {
          const detail = issueMessage(body.issues);
          return {
            ok: false,
            error: detail ? `${body.error ?? "Invalid input"}: ${detail}` : body.error ?? "The change could not be saved.",
          };
        }
        router.refresh();
        return { ok: true, error: null };
      } catch {
        return {
          ok: false,
          error: "The request could not be completed. Check the connection and try again.",
        };
      }
    },
    [router],
  );

  const goalLabel =
    data.goalContexts.length > 0
      ? data.goalContexts
          .map((goal) =>
            goal.priorityName === data.kpi.category_name
              ? goal.name
              : `${goal.priorityName} · ${goal.name}`,
          )
          .join("; ")
      : "Not assigned to a strategic goal";
  const setupStatus = data.configuration?.configuration_status === "active" ||
    data.configuration?.configuration_status === "ready"
    ? "Ready"
    : "Needs attention";
  const hasComponents = data.configuration?.measurement_type === "multi_component";
  const hasDistribution = data.configuration?.measurement_type === "distribution" ||
    data.components.some((component) =>
      component.archived_at === null && component.measurement_type === "distribution"
    );
  const targetGoal = data.goalContexts[0] ?? null;

  return (
    <div className="min-w-0 page-enter">
      <div className="lg:hidden">
        <Breadcrumb
          href={`/setup?area=measures&year=${data.reportingYear}&focus=${data.kpi.id}`}
          label="Back to list"
        />
      </div>
      <div className="mb-6 border-b border-ink-200 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-950">{data.kpi.name}</h2>
            <p className="mt-1 text-sm text-ink-600">{data.kpi.category_name} · {goalLabel}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Badge variant={setupStatus === "Ready" ? "success" : "warning"} label="Setup status">
              {setupStatus}
            </Badge>
            {targetGoal ? (
              <LinkButton
                href={`/setup?area=goals&year=${data.reportingYear}&goal=${targetGoal.id}#goal-target-measure-${data.kpi.id}`}
                size="sm"
              >
                Review target
              </LinkButton>
            ) : null}
          </div>
        </div>
      </div>

      <FilterToolbar className="mb-6">
        <FormField
          label="Reporting year"
          htmlFor="strategic-kpi-reporting-year"
          className="w-full sm:max-w-xs"
        >
          <Select
            id="strategic-kpi-reporting-year"
            value={data.reportingYear}
            onChange={(event) =>
              router.push(
                `/setup?area=measures&item=${data.kpi.id}&year=${Number(event.target.value)}`,
              )
            }
          >
            {data.planYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterToolbar>

      <div className="divide-y divide-ink-200 border-y border-ink-200">
        <section className="py-8" aria-labelledby="measure-definition-heading">
          <h3 id="measure-definition-heading" className="mb-5 text-xl font-semibold text-ink-950">How this measure works</h3>
          <ConfigurationEditor data={data} runMutation={runMutation} />
        </section>
        {hasComponents ? <section className="py-8" aria-labelledby="measure-fields-heading">
          <h3 id="measure-fields-heading" className="mb-5 text-xl font-semibold text-ink-950">Inputs to complete</h3>
          <StrategicKpiComponentsEditor
            configuration={data.configuration}
            components={data.components}
            runMutation={runMutation}
          />
        </section> : null}
        {hasDistribution ? <section className="py-8" aria-labelledby="measure-groups-heading">
          <h3 id="measure-groups-heading" className="mb-5 text-xl font-semibold text-ink-950">Reporting groups</h3>
          <DistributionEditors data={data} runMutation={runMutation} />
        </section> : null}
      </div>
    </div>
  );
}

function DistributionEditors({
  data,
  runMutation,
}: {
  data: StrategicKpiEditorData;
  runMutation: StrategyEditorMutationRunner;
}) {
  if (data.configuration?.measurement_type === "distribution") {
    return (
      <StrategicDistributionBandsEditor
        kpiId={data.kpi.id}
        reportingYear={data.reportingYear}
        measurementType="distribution"
        bands={data.distributionBands}
        runMutation={runMutation}
      />
    );
  }

  const distributionComponents = data.components.filter(
    (component) =>
      component.archived_at === null &&
      component.measurement_type === "distribution",
  );
  if (
    data.configuration?.measurement_type !== "multi_component" ||
    distributionComponents.length === 0
  ) {
    return (
      <Card className="p-6">
        <StatusBanner variant="neutral">
          Add a distribution input before creating its response groups.
        </StatusBanner>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {distributionComponents.map((component) => (
        <section key={component.id} aria-labelledby={`component-${component.id}-bands-title`}>
          <h2
            id={`component-${component.id}-bands-title`}
            className="mb-4 text-xl font-semibold text-ink-900"
          >
            {component.label} demographic bands
          </h2>
          <StrategicDistributionBandsEditor
            kpiId={data.kpi.id}
            componentId={component.id}
            reportingYear={data.reportingYear}
            measurementType="distribution"
            bands={data.distributionBands}
            runMutation={runMutation}
          />
        </section>
      ))}
    </div>
  );
}

function ConfigurationEditor({
  data,
  runMutation,
}: {
  data: StrategicKpiEditorData;
  runMutation: StrategyEditorMutationRunner;
}) {
  const [draft, setDraft] = useState(() =>
    configurationDraftFromData(data.configuration, data.kpi, data.reportingYear),
  );
  const [errors, setErrors] = useState<StrategyEditorFormErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [successorMode, setSuccessorMode] = useState(false);
  const archived = data.configuration?.archived_at !== null && data.configuration !== null;
  const successorAvailable =
    data.configuration !== null &&
    canCreateMeasurementSuccessor(
      data.configuration,
      data.reportingYear,
      data.planYears.at(-1)!,
    );

  useEffect(() => {
    setSuccessorMode(false);
    setDraft(
      configurationDraftFromData(data.configuration, data.kpi, data.reportingYear),
    );
  }, [data.configuration, data.kpi, data.reportingYear]);

  function update<K extends keyof ConfigurationFormDraft>(
    key: K,
    value: ConfigurationFormDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      delete next[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const built = buildConfigurationFormPayload(
      draft,
      data.kpi.id,
      successorMode ? null : data.configuration?.id ?? null,
    );
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
      successorMode && data.configuration
        ? buildSuccessorConfigurationMutation(
            data.configuration.id,
            built.payload,
          )
        : buildConfigurationMutation(
            built.payload,
            data.configuration === null,
          ),
    );
    setBusy(false);
    if (result.ok && successorMode) {
      setSuccessorMode(false);
      setDraft(
        configurationDraftFromData(
          data.configuration,
          data.kpi,
          data.reportingYear,
        ),
      );
    }
    setFeedback(
      result.ok
        ? {
            variant: "success",
            message: successorMode
              ? "Future change saved. Select its first year to review it."
              : "Measure saved.",
          }
        : { variant: "error", message: result.error ?? "Could not save this measure." },
    );
  }

  return (
    <Card as="section" className="p-5 lg:p-6" aria-labelledby="measurement-editor-title">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="measurement-editor-title" className="text-xl font-semibold text-ink-900">
            Measure details
          </h2>
        </div>
        <Badge variant={data.configuration ? "info" : "incomplete"} label="Definition status">
          {successorMode
            ? "Future change"
            : data.configuration ? "Current setup" : "Not set up"}
        </Badge>
      </div>

      {archived ? (
        <StatusBanner variant="error">
          This setup is archived and cannot be changed.
        </StatusBanner>
      ) : null}
      {feedback ? <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner> : null}
      {successorMode && data.configuration ? (
        <StatusBanner variant="neutral">
          Choose the first reporting year for this change. Earlier results will stay unchanged.
        </StatusBanner>
      ) : null}

      <form
        onSubmit={(event) => runEventHandler(submit, event)}
        className="space-y-8"
      >
        <fieldset disabled={busy || archived} className="space-y-8">
          <section aria-labelledby="measurement-fields-title">
            <h3 id="measurement-fields-title" className="mb-4 text-base font-semibold text-ink-900">
              Reporting details
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <FormField
                label="What will people enter?"
                htmlFor="strategy-measurement-type"
                hint={<ErrorHint error={errors.measurement_type} />}
              >
                <Select
                  id="strategy-measurement-type"
                  value={draft.measurementType}
                  aria-invalid={Boolean(errors.measurement_type)}
                  onChange={(event) => {
                    const measurementType = event.target.value as MeasurementType | "";
                    update("measurementType", measurementType);
                    if (measurementType !== "multi_component") {
                      update("aggregationMethod", "none");
                    }
                  }}
                >
                  <option value="">Choose an input</option>
                  {MEASUREMENT_TYPES.map((type) => (
                    <option key={type} value={type}>{measurementLabel(type)}</option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label="How often?"
                htmlFor="strategy-reporting-frequency"
                hint={<ErrorHint error={errors.reporting_frequency} />}
              >
                <Select
                  id="strategy-reporting-frequency"
                  value={draft.reportingFrequency}
                  aria-invalid={Boolean(errors.reporting_frequency)}
                  onChange={(event) =>
                    update(
                      "reportingFrequency",
                      event.target.value as StrategyReportingFrequency | "",
                    )
                  }
                >
                  <option value="">Choose a schedule</option>
                  {STRATEGY_REPORTING_FREQUENCIES.map((frequency) => (
                    <option key={frequency} value={frequency}>{frequencyLabel(frequency)}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Unit" htmlFor="strategy-unit" hint={<ErrorHint error={errors.unit} fallback="For example: people, %, USD, or projects." />}>
                <Input
                  id="strategy-unit"
                  value={draft.unit}
                  aria-invalid={Boolean(errors.unit)}
                  onChange={(event) => update("unit", event.target.value)}
                />
              </FormField>
              {draft.measurementType === "percentage" || draft.measurementType === "ratio" ? <>
              <FormField label="Top number label" htmlFor="strategy-numerator" hint={<ErrorHint error={errors.numerator_label} fallback="Name the amount being measured." />}>
                <Input
                  id="strategy-numerator"
                  value={draft.numeratorLabel}
                  aria-invalid={Boolean(errors.numerator_label)}
                  onChange={(event) => update("numeratorLabel", event.target.value)}
                />
              </FormField>
              <FormField label="Total number label" htmlFor="strategy-denominator" hint={<ErrorHint error={errors.denominator_label} fallback="Name the total used for the calculation." />}>
                <Input
                  id="strategy-denominator"
                  value={draft.denominatorLabel}
                  aria-invalid={Boolean(errors.denominator_label)}
                  onChange={(event) => update("denominatorLabel", event.target.value)}
                />
              </FormField>
              <FormField label="Fixed total" htmlFor="strategy-fixed-denominator" hint={<ErrorHint error={errors.fixed_denominator} fallback="Leave blank when the total changes." />}>
                <Input
                  id="strategy-fixed-denominator"
                  type="number"
                  min="0"
                  step="any"
                  value={draft.fixedDenominator}
                  aria-invalid={Boolean(errors.fixed_denominator)}
                  onChange={(event) => update("fixedDenominator", event.target.value)}
                />
              </FormField>
              </> : null}
              {draft.measurementType === "multi_component" ? <FormField label="Combine the inputs by" htmlFor="strategy-aggregation" hint={<ErrorHint error={errors.aggregation_method} />}>
                <Select
                  id="strategy-aggregation"
                  value={draft.aggregationMethod}
                  disabled={draft.measurementType !== "multi_component"}
                  aria-invalid={Boolean(errors.aggregation_method)}
                  onChange={(event) =>
                    update("aggregationMethod", event.target.value as AggregationMethod)
                  }
                >
                  {AGGREGATION_METHODS.map((method) => (
                    <option key={method} value={method}>{aggregationLabel(method)}</option>
                  ))}
                </Select>
              </FormField> : null}
              <FormField label="Decimal places" htmlFor="strategy-precision" hint={<ErrorHint error={errors.calculation_precision} fallback="Choose 0 through 6." />}>
                <Input
                  id="strategy-precision"
                  type="number"
                  min={0}
                  max={6}
                  step={1}
                  value={draft.calculationPrecision}
                  aria-invalid={Boolean(errors.calculation_precision)}
                  onChange={(event) => update("calculationPrecision", event.target.value)}
                />
              </FormField>
              <FormField label="Baseline value" htmlFor="strategy-baseline" hint={<ErrorHint error={errors.baseline_value} fallback="Optional source baseline; zero remains a valid value." />}>
                <Input
                  id="strategy-baseline"
                  type="number"
                  step="any"
                  value={draft.baselineValue}
                  aria-invalid={Boolean(errors.baseline_value)}
                  onChange={(event) => update("baselineValue", event.target.value)}
                />
              </FormField>
              <FormField label="Board status" htmlFor="strategy-board-status" hint={<ErrorHint error={errors.board_level_status} />}>
                <Select
                  id="strategy-board-status"
                  value={draft.boardStatus}
                  onChange={(event) => update("boardStatus", event.target.value as BoardStatus)}
                >
                  {BOARD_STATUSES.map((status) => (
                    <option key={status} value={status}>{displayLabel(status)}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="First reporting year" htmlFor="strategy-effective-start" hint={<ErrorHint error={errors.effective_start_year} />}>
                <Input
                  id="strategy-effective-start"
                  type="number"
                  min={successorMode ? data.planYears[0] : 1900}
                  max={successorMode ? data.planYears.at(-1) : 2100}
                  value={draft.effectiveStartYear}
                  aria-invalid={Boolean(errors.effective_start_year)}
                  onChange={(event) => update("effectiveStartYear", event.target.value)}
                />
              </FormField>
              <FormField label="Last reporting year" htmlFor="strategy-effective-end" hint={<ErrorHint error={errors.effective_end_year} fallback="Leave blank to keep using it." />}>
                <Input
                  id="strategy-effective-end"
                  type="number"
                  min={successorMode ? data.planYears[0] : 1900}
                  max={successorMode ? data.planYears.at(-1) : 2100}
                  value={draft.effectiveEndYear}
                  aria-invalid={Boolean(errors.effective_end_year)}
                  onChange={(event) => update("effectiveEndYear", event.target.value)}
                />
              </FormField>
            </div>
            {draft.measurementType === "average" ? <Checkbox
              id="strategy-allow-over-max"
              checked={draft.allowScoreOverMax}
              onChange={(event) => update("allowScoreOverMax", event.target.checked)}
              label="Allow average scores above the usual maximum"
              description="Use this only when the survey allows bonus or extra-credit scores."
              className="mt-4 max-w-2xl"
            /> : null}
          </section>

          <section aria-labelledby="gap-workflow-title">
            <h3 id="gap-workflow-title" className="mb-4 text-base font-semibold text-ink-900">
              Setup progress
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <FormField label="Setup status" htmlFor="strategy-config-status" hint={<ErrorHint error={errors.configuration_status} />}>
                <Select
                  id="strategy-config-status"
                  value={draft.configurationStatus}
                  onChange={(event) => update("configurationStatus", event.target.value as ConfigurationStatus)}
                >
                  {draft.configurationStatus === "archived" ? (
                    <option value="archived">Archived</option>
                  ) : null}
                  {EDITABLE_CONFIGURATION_STATUSES.map((status) => (
                    <option key={status} value={status}>{displayLabel(status)}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Assigned owner" htmlFor="strategy-owner" hint={<ErrorHint error={errors.owner} />}>
                <Input
                  id="strategy-owner"
                  value={draft.owner}
                  onChange={(event) => update("owner", event.target.value)}
                />
              </FormField>
              <FormField label="Due date" htmlFor="strategy-due-date" hint={<ErrorHint error={errors.due_date} />}>
                <Input
                  id="strategy-due-date"
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) => update("dueDate", event.target.value)}
                />
              </FormField>
              <FormField label="Last reviewed" htmlFor="strategy-last-reviewed" hint={<ErrorHint error={errors.last_reviewed_date} />}>
                <Input
                  id="strategy-last-reviewed"
                  type="date"
                  value={draft.lastReviewedDate}
                  onChange={(event) => update("lastReviewedDate", event.target.value)}
                />
              </FormField>
              <FormField label="Source" htmlFor="strategy-source" className="md:col-span-2" hint={<ErrorHint error={errors.source_reference} />}>
                <Input
                  id="strategy-source"
                  value={draft.sourceReference}
                  onChange={(event) => update("sourceReference", event.target.value)}
                />
              </FormField>
              <FormField label="What still needs an answer?" htmlFor="strategy-question" className="md:col-span-2 lg:col-span-3" hint={<ErrorHint error={errors.unresolved_question} fallback="Add this when the setup still needs information." />}>
                <Textarea
                  id="strategy-question"
                  value={draft.unresolvedQuestion}
                  aria-invalid={Boolean(errors.unresolved_question)}
                  onChange={(event) => update("unresolvedQuestion", event.target.value)}
                />
              </FormField>
              <FormField label="Notes" htmlFor="strategy-resolution-notes" className="md:col-span-2 lg:col-span-3" hint={<ErrorHint error={errors.resolution_notes} />}>
                <Textarea
                  id="strategy-resolution-notes"
                  value={draft.resolutionNotes}
                  onChange={(event) => update("resolutionNotes", event.target.value)}
                />
              </FormField>
            </div>
          </section>
        </fieldset>

        <div className="flex flex-wrap justify-between gap-3">
          {data.configuration && !archived && successorAvailable ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setFeedback(null);
                setErrors({});
                const next = !successorMode;
                setSuccessorMode(next);
                setDraft(
                  next
                    ? successorConfigurationDraftFromData(
                        data.configuration!,
                        data.kpi,
                        data.reportingYear,
                      )
                    : configurationDraftFromData(
                        data.configuration,
                        data.kpi,
                        data.reportingYear,
                      ),
                );
              }}
            >
              {successorMode ? "Cancel future change" : "Plan future change"}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" isLoading={busy} disabled={archived}>
            {successorMode ? "Save future change" : "Save measure"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
