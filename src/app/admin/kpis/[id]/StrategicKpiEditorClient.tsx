"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AGGREGATION_METHODS,
  BOARD_STATUSES,
  CONFIGURATION_STATUSES,
  MEASUREMENT_TYPES,
  STRATEGIC_PLAN_REPORTING_YEARS,
  STRATEGY_REPORTING_FREQUENCIES,
  type AggregationMethod,
  type BoardStatus,
  type ConfigurationStatus,
  type MeasurementType,
  type StrategyReportingFrequency,
} from "@/features/strategy";
import { apiFetch } from "@/lib/api-client";
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  FormField,
  FilterToolbar,
  Input,
  PageHeader,
  Select,
  StatusBanner,
  Tabs,
  Textarea,
} from "@/components/ui";
import {
  buildConfigurationFormPayload,
  buildConfigurationMutation,
  buildSuccessorConfigurationMutation,
  canCreateMeasurementSuccessor,
  configurationDraftFromData,
  firstFormError,
  targetDraftForScope,
  successorConfigurationDraftFromData,
  type ConfigurationFormDraft,
  type StrategicKpiEditorData,
  type StrategyEditorFormErrors,
  type StrategyEditorMutation,
  type StrategyEditorMutationRunner,
} from "@/components/strategic-kpi-editor-model";
import { StrategicKpiComponentsEditor } from "@/components/StrategicKpiComponentsEditor";
import { StrategicDistributionBandsEditor } from "@/components/StrategicDistributionBandsEditor";
import { StrategicTargetEditorCard } from "@/components/StrategicTargetEditorCard";

type EditorTab = "configuration" | "targets" | "components" | "distribution";
type Feedback = { variant: "success" | "error"; message: string } | null;

const EDITABLE_CONFIGURATION_STATUSES = CONFIGURATION_STATUSES.filter(
  (status) => status !== "archived",
);

function displayLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toLocaleUpperCase());
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
  const [tab, setTab] = useState<EditorTab>("configuration");
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
          .map((goal) => `${goal.priorityName} · ${goal.name}`)
          .join("; ")
      : "Not assigned to a strategic goal";

  return (
    <div className="page-content page-content-wide page-enter">
      <Breadcrumb href="/admin/kpis" label="Back to KPIs" />
      <PageHeader
        eyebrow={`Admin · Strategic KPI · ${data.kpi.category_name}`}
        title={data.kpi.name}
        subtitle={`${data.kpi.slug} · ${goalLabel}`}
        actions={
          <Badge
            variant={
              data.configuration?.configuration_status === "active"
                ? "success"
                : data.configuration?.configuration_status === "needs_definition"
                  ? "error"
                  : "warning"
            }
          >
            {data.configuration
              ? displayLabel(data.configuration.configuration_status)
              : "Not configured"}
          </Badge>
        }
      />

      <StatusBanner variant="neutral">
        Semantic changes are versioned once results exist. Create a successor definition for future calculations; historical observations retain the definition that originally interpreted them.
      </StatusBanner>

      <FilterToolbar className="mb-6">
        <FormField
          label="Reporting year"
          htmlFor="strategic-kpi-reporting-year"
          hint="Controls annual targets, effective definitions, components, and bands."
          className="w-full sm:max-w-xs"
        >
          <Select
            id="strategic-kpi-reporting-year"
            value={data.reportingYear}
            onChange={(event) =>
              router.push(
                `/admin/kpis/${data.kpi.id}?year=${Number(event.target.value)}`,
              )
            }
          >
            {STRATEGIC_PLAN_REPORTING_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterToolbar>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "configuration", label: "Measurement" },
          { value: "targets", label: `Targets (${data.targets.filter((target) => target.archived_at === null).length})` },
          { value: "components", label: `Components (${data.components.filter((component) => component.archived_at === null).length})` },
          { value: "distribution", label: `Demographic bands (${data.distributionBands.filter((band) => band.archivedAt === null).length})` },
        ]}
        className="mb-6 max-w-full flex-wrap"
      />

      <div role="tabpanel" aria-label={`${displayLabel(tab)} editor`}>
        {tab === "configuration" ? (
          <ConfigurationEditor data={data} runMutation={runMutation} />
        ) : null}
        {tab === "targets" ? (
          <TargetsEditor data={data} runMutation={runMutation} />
        ) : null}
        {tab === "components" ? (
          <StrategicKpiComponentsEditor
            configuration={data.configuration}
            components={data.components}
            reportingYear={data.reportingYear}
            runMutation={runMutation}
          />
        ) : null}
        {tab === "distribution" ? (
          <DistributionEditors data={data} runMutation={runMutation} />
        ) : null}
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
        ownerLabel={data.kpi.name}
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
          Distribution-band controls become available for a Distribution KPI or a Distribution component inside a Multi component KPI.
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
            ownerLabel={component.label}
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
    canCreateMeasurementSuccessor(data.configuration, data.reportingYear);

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
              ? "Successor definition saved. Select its first reporting year to review it."
              : "Measurement configuration saved.",
          }
        : { variant: "error", message: result.error ?? "Could not save configuration." },
    );
  }

  return (
    <Card as="section" className="p-5 lg:p-6" aria-labelledby="measurement-editor-title">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="measurement-editor-title" className="text-xl font-semibold text-ink-900">
            Measurement definition
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">
            Store raw inputs and define how this KPI should be interpreted. Calculated results are not entered here.
          </p>
        </div>
        <Badge variant={data.configuration ? "info" : "warning"}>
          {successorMode
            ? `Successor to #${data.configuration?.id}`
            : data.configuration
              ? `Configuration #${data.configuration.id}`
              : "New configuration"}
        </Badge>
      </div>

      {archived ? (
        <StatusBanner variant="error">
          This configuration is archived and cannot be edited from this form.
        </StatusBanner>
      ) : null}
      {feedback ? <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner> : null}
      {successorMode && data.configuration ? (
        <StatusBanner variant="neutral">
          The predecessor will end one year before this successor starts. Choose the first year without historical values; the save is atomic and rejects overlaps.
        </StatusBanner>
      ) : null}

      <form onSubmit={submit} className="space-y-8">
        <fieldset disabled={busy || archived} className="space-y-8">
          <section aria-labelledby="measurement-fields-title">
            <h3 id="measurement-fields-title" className="mb-4 text-base font-semibold text-ink-900">
              Formula and reporting
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <FormField
                label="Measurement type"
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
                  <option value="">Choose a measurement type</option>
                  {MEASUREMENT_TYPES.map((type) => (
                    <option key={type} value={type}>{displayLabel(type)}</option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label="Reporting frequency"
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
                  <option value="">Choose a frequency</option>
                  {STRATEGY_REPORTING_FREQUENCIES.map((frequency) => (
                    <option key={frequency} value={frequency}>{displayLabel(frequency)}</option>
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
              <FormField label="Numerator label" htmlFor="strategy-numerator" hint={<ErrorHint error={errors.numerator_label} fallback="Required for ready percentage and ratio KPIs." />}>
                <Input
                  id="strategy-numerator"
                  value={draft.numeratorLabel}
                  aria-invalid={Boolean(errors.numerator_label)}
                  onChange={(event) => update("numeratorLabel", event.target.value)}
                />
              </FormField>
              <FormField label="Denominator label" htmlFor="strategy-denominator" hint={<ErrorHint error={errors.denominator_label} fallback="Use a label or fixed denominator for percentages and ratios." />}>
                <Input
                  id="strategy-denominator"
                  value={draft.denominatorLabel}
                  aria-invalid={Boolean(errors.denominator_label)}
                  onChange={(event) => update("denominatorLabel", event.target.value)}
                />
              </FormField>
              <FormField label="Fixed denominator" htmlFor="strategy-fixed-denominator" hint={<ErrorHint error={errors.fixed_denominator} fallback="Optional positive constant." />}>
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
              <FormField label="Aggregation" htmlFor="strategy-aggregation" hint={<ErrorHint error={errors.aggregation_method} fallback="Only multi-component KPIs may aggregate component results." />}>
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
                    <option key={method} value={method}>{displayLabel(method)}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Calculation precision" htmlFor="strategy-precision" hint={<ErrorHint error={errors.calculation_precision} fallback="Decimal places from 0 through 6." />}>
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
              <FormField label="Effective start year" htmlFor="strategy-effective-start" hint={<ErrorHint error={errors.effective_start_year} />}>
                <Input
                  id="strategy-effective-start"
                  type="number"
                  min={successorMode ? 2025 : 1900}
                  max={successorMode ? 2029 : 2100}
                  value={draft.effectiveStartYear}
                  aria-invalid={Boolean(errors.effective_start_year)}
                  onChange={(event) => update("effectiveStartYear", event.target.value)}
                />
              </FormField>
              <FormField label="Effective end year" htmlFor="strategy-effective-end" hint={<ErrorHint error={errors.effective_end_year} fallback="Leave blank for no end year." />}>
                <Input
                  id="strategy-effective-end"
                  type="number"
                  min={successorMode ? 2025 : 1900}
                  max={successorMode ? 2029 : 2100}
                  value={draft.effectiveEndYear}
                  aria-invalid={Boolean(errors.effective_end_year)}
                  onChange={(event) => update("effectiveEndYear", event.target.value)}
                />
              </FormField>
            </div>
            <Checkbox
              id="strategy-allow-over-max"
              checked={draft.allowScoreOverMax}
              onChange={(event) => update("allowScoreOverMax", event.target.checked)}
              label="Allow average scores above the configured maximum"
              description="Use only when the source instrument explicitly permits bonus or extra-credit scores."
              className="mt-4 max-w-2xl"
            />
          </section>

          <section aria-labelledby="gap-workflow-title">
            <h3 id="gap-workflow-title" className="mb-4 text-base font-semibold text-ink-900">
              Configuration-gap workflow
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <FormField label="Configuration status" htmlFor="strategy-config-status" hint={<ErrorHint error={errors.configuration_status} />}>
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
              <FormField label="Source reference" htmlFor="strategy-source" className="md:col-span-2" hint={<ErrorHint error={errors.source_reference} />}>
                <Input
                  id="strategy-source"
                  value={draft.sourceReference}
                  onChange={(event) => update("sourceReference", event.target.value)}
                />
              </FormField>
              <FormField label="Unresolved question" htmlFor="strategy-question" className="md:col-span-2 lg:col-span-3" hint={<ErrorHint error={errors.unresolved_question} fallback="Required when the status is Needs definition or Needs target." />}>
                <Textarea
                  id="strategy-question"
                  value={draft.unresolvedQuestion}
                  aria-invalid={Boolean(errors.unresolved_question)}
                  onChange={(event) => update("unresolvedQuestion", event.target.value)}
                />
              </FormField>
              <FormField label="Resolution notes" htmlFor="strategy-resolution-notes" className="md:col-span-2 lg:col-span-3" hint={<ErrorHint error={errors.resolution_notes} />}>
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
              {successorMode ? "Cancel successor" : "Create successor definition"}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" isLoading={busy} disabled={archived}>
            {successorMode ? "Save successor definition" : "Save measurement definition"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TargetsEditor({
  data,
  runMutation,
}: {
  data: StrategicKpiEditorData;
  runMutation: StrategyEditorMutationRunner;
}) {
  if (!data.configuration || !data.configuration.measurement_type) {
    return (
      <Card className="p-6">
        <StatusBanner variant="error">
          Save a measurement type before configuring annual or full-plan targets.
        </StatusBanner>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <StrategicTargetEditorCard
        key={`annual-${data.reportingYear}-${data.targets.map((target) => target.updated_at).join("-")}`}
        title="Annual target"
        description="Pacing target for one reporting year. Its reporting year and target year remain aligned."
        initialDraft={targetDraftForScope(data.targets, "annual", data.reportingYear)}
        kpiId={data.kpi.id}
        measurementType={data.configuration.measurement_type}
        runMutation={runMutation}
        idPrefix="kpi"
        lockedTargetYear={data.reportingYear}
      />
      <StrategicTargetEditorCard
        key={`full-${data.targets.map((target) => target.updated_at).join("-")}`}
        title="Full-plan target"
        description="Long-range strategic outcome. It is stored independently from the annual pacing target."
        initialDraft={targetDraftForScope(data.targets, "full_plan", data.reportingYear)}
        kpiId={data.kpi.id}
        measurementType={data.configuration.measurement_type}
        runMutation={runMutation}
        idPrefix="kpi"
      />
    </div>
  );
}
