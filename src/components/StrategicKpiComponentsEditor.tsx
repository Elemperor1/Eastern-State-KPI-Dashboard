"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Plus, RotateCcw, Save } from "lucide-react";
import {
  COMPONENT_AGGREGATION_ROLES,
  CONFIGURATION_STATUSES,
  MEASUREMENT_TYPES,
  type ConfigurationStatus,
  type ComponentAggregationRole,
  type MeasurementType,
  type PersistedMeasurementConfig,
  type StrategyComponentWithTargets,
} from "@/features/strategy";
import {
  Badge,
  Button,
  Card,
  FormField,
  IconButton,
  Input,
  Select,
  StatusBanner,
  Textarea,
} from "@/components/ui";
import {
  buildComponentFormPayload,
  buildComponentLifecycleMutation,
  buildComponentMutation,
  buildComponentReorderMutation,
  componentDraftFromData,
  firstFormError,
  moveId,
  type ComponentFormDraft,
  type StrategyEditorFormErrors,
  type StrategyEditorMutationRunner,
} from "./strategic-kpi-editor-model";

type Feedback = { variant: "success" | "error"; message: string } | null;

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

function ErrorHint({ error, fallback }: { error?: string; fallback?: string }) {
  return error ? (
    <span className="font-medium text-[var(--color-danger-text)]">{error}</span>
  ) : (
    fallback ?? null
  );
}

export function StrategicKpiComponentsEditor({
  configuration,
  components: initialComponents,
  runMutation,
}: {
  configuration: PersistedMeasurementConfig | null;
  components: StrategyComponentWithTargets[];
  reportingYear?: number;
  runMutation: StrategyEditorMutationRunner;
}) {
  const [components, setComponents] = useState(initialComponents);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => setComponents(initialComponents), [initialComponents]);

  const active = useMemo(
    () =>
      components
        .filter((component) => component.archived_at === null)
        .sort((a, b) => a.display_order - b.display_order || a.id - b.id),
    [components],
  );
  const archived = useMemo(
    () => components.filter((component) => component.archived_at !== null),
    [components],
  );

  if (!configuration) {
    return (
      <Card className="p-6">
        <StatusBanner variant="error">
          Save the measure details before adding inputs.
        </StatusBanner>
      </Card>
    );
  }
  const configurationId = configuration.id;

  async function lifecycle(id: number, action: "archive" | "restore") {
    setBusyId(id);
    setFeedback(null);
    const result = await runMutation(buildComponentLifecycleMutation(id, action));
    setBusyId(null);
    setFeedback(
      result.ok
        ? {
            variant: "success",
            message: action === "archive" ? "Input archived." : "Input restored.",
          }
        : {
            variant: "error",
            message: result.error ?? `Could not ${action} this input.`,
          },
    );
  }

  async function reorder(id: number, direction: "up" | "down") {
    const nextActive = moveId(active, id, direction);
    if (nextActive === active) return;
    const ordered = nextActive.map((component, displayOrder) => ({
      ...component,
      display_order: displayOrder,
    }));
    const before = components;
    setComponents([...ordered, ...archived]);
    setBusyId(id);
    setFeedback(null);
    const result = await runMutation(
      buildComponentReorderMutation(
        configurationId,
        ordered.map((component) => component.id),
      ),
    );
    setBusyId(null);
    if (!result.ok) {
      setComponents(before);
      setFeedback({
        variant: "error",
        message: result.error ?? "Could not reorder inputs.",
      });
      return;
    }
    setFeedback({ variant: "success", message: "Input order saved." });
  }

  const supportsComponents = configuration.measurement_type === "multi_component";

  return (
    <div className="space-y-6">
      {feedback ? <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner> : null}
      {!supportsComponents ? (
        <StatusBanner variant="neutral">
          Choose “Several related inputs” above before adding inputs here.
        </StatusBanner>
      ) : null}

      {supportsComponents ? (
        <ComponentFormCard
          key={`new-${configurationId}-${active.length}`}
          title="Add input"
          description=""
          initialDraft={componentDraftFromData(null, active.length)}
          configurationId={configurationId}
          runMutation={runMutation}
          isCreate
        />
      ) : null}

      <section aria-labelledby="active-components-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="active-components-title" className="text-xl font-semibold text-ink-900">
              Inputs
            </h2>
          </div>
          <Badge variant="info">{active.length} active</Badge>
        </div>

        {active.length === 0 ? (
          <Card className="p-6">
            <StatusBanner variant="neutral">
              No inputs have been added yet.
            </StatusBanner>
          </Card>
        ) : (
          active.map((component, index) => (
            <ComponentFormCard
              key={`${component.id}-${component.display_order}-${component.updated_at}`}
              title={component.label}
              description=""
              initialDraft={componentDraftFromData(component, index)}
              configurationId={configurationId}
              runMutation={runMutation}
              reorderActions={
                <div className="flex gap-1">
                  <IconButton
                    icon={ArrowUp}
                    label={`Move ${component.label} up`}
                    size="sm"
                    variant="ghost"
                    disabled={index === 0 || busyId !== null}
                    onClick={() => reorder(component.id, "up")}
                  />
                  <IconButton
                    icon={ArrowDown}
                    label={`Move ${component.label} down`}
                    size="sm"
                    variant="ghost"
                    disabled={index === active.length - 1 || busyId !== null}
                    onClick={() => reorder(component.id, "down")}
                  />
                  <IconButton
                    icon={Archive}
                    label={`Archive ${component.label}`}
                    size="sm"
                    variant="danger"
                    disabled={busyId !== null}
                    onClick={() => lifecycle(component.id, "archive")}
                  />
                </div>
              }
            />
          ))
        )}
      </section>

      {archived.length > 0 ? (
        <section aria-labelledby="archived-components-title" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="archived-components-title" className="text-xl font-semibold text-ink-900">
              Archived inputs
            </h2>
            <Badge variant="default">{archived.length} archived</Badge>
          </div>
          {archived.map((component) => (
            <Card key={component.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="break-words font-semibold text-ink-900">{component.label}</p>
                <p className="mt-1 text-xs text-ink-500">
                  {displayLabel(component.measurement_type ?? "unknown")}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={RotateCcw}
                isLoading={busyId === component.id}
                disabled={busyId !== null && busyId !== component.id}
                onClick={() => lifecycle(component.id, "restore")}
              >
                Restore input
              </Button>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ComponentFormCard({
  title,
  description,
  initialDraft,
  configurationId,
  runMutation,
  isCreate = false,
  reorderActions,
}: {
  title: string;
  description: string;
  initialDraft: ComponentFormDraft;
  configurationId: number;
  runMutation: StrategyEditorMutationRunner;
  isCreate?: boolean;
  reorderActions?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<StrategyEditorFormErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const prefix = isCreate ? "new-component" : `component-${draft.id}`;

  function update<K extends keyof ComponentFormDraft>(
    key: K,
    value: ComponentFormDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const built = buildComponentFormPayload(draft, configurationId);
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
    const result = await runMutation(buildComponentMutation(built.payload, isCreate));
    setBusy(false);
    setFeedback(
      result.ok
        ? {
            variant: "success",
            message: isCreate ? "Input created." : "Input saved.",
          }
        : {
            variant: "error",
            message: result.error ?? "Could not save this input.",
          },
    );
    if (result.ok && isCreate) {
      setDraft(componentDraftFromData(null, Number(draft.displayOrder) + 1));
    }
  }

  return (
    <Card as="section" className="p-5 lg:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-500">{description}</p>
        </div>
        {reorderActions}
      </div>
      {feedback ? <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner> : null}
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={busy} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FormField label="Input name" htmlFor={`${prefix}-label`} hint={<ErrorHint error={errors.label ?? errors.slug} />}>
            <Input
              id={`${prefix}-label`}
              value={draft.label}
              aria-invalid={Boolean(errors.label ?? errors.slug)}
              onChange={(event) => update("label", event.target.value)}
            />
          </FormField>
          <FormField label="What will people enter?" htmlFor={`${prefix}-type`} hint={<ErrorHint error={errors.measurement_type} />}>
            <Select
              id={`${prefix}-type`}
              value={draft.measurementType}
              onChange={(event) => update("measurementType", event.target.value as MeasurementType)}
            >
              {MEASUREMENT_TYPES.map((type) => (
                <option key={type} value={type}>{measurementLabel(type)}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Unit" htmlFor={`${prefix}-unit`} hint={<ErrorHint error={errors.unit} />}>
            <Input
              id={`${prefix}-unit`}
              value={draft.unit}
              onChange={(event) => update("unit", event.target.value)}
            />
          </FormField>
          <FormField label="Used as" htmlFor={`${prefix}-aggregation-role`} hint={<ErrorHint error={errors.aggregation_role} />}>
            <Select
              id={`${prefix}-aggregation-role`}
              value={draft.aggregationRole}
              aria-invalid={Boolean(errors.aggregation_role)}
              onChange={(event) => update("aggregationRole", event.target.value as ComponentAggregationRole)}
            >
              {COMPONENT_AGGREGATION_ROLES.map((role) => (
                <option key={role} value={role}>{role === "numerator" ? "Top number" : role === "denominator" ? "Total number" : "Value"}</option>
              ))}
            </Select>
          </FormField>
          {draft.measurementType === "percentage" || draft.measurementType === "ratio" ? <>
          <FormField label="Top number label" htmlFor={`${prefix}-numerator`} hint={<ErrorHint error={errors.numerator_label} />}>
            <Input
              id={`${prefix}-numerator`}
              value={draft.numeratorLabel}
              onChange={(event) => update("numeratorLabel", event.target.value)}
            />
          </FormField>
          <FormField label="Total number label" htmlFor={`${prefix}-denominator`} hint={<ErrorHint error={errors.denominator_label} />}>
            <Input
              id={`${prefix}-denominator`}
              value={draft.denominatorLabel}
              onChange={(event) => update("denominatorLabel", event.target.value)}
            />
          </FormField>
          <FormField label="Fixed total" htmlFor={`${prefix}-fixed-denominator`} hint={<ErrorHint error={errors.fixed_denominator} />}>
            <Input
              id={`${prefix}-fixed-denominator`}
              type="number"
              step="any"
              value={draft.fixedDenominator}
              onChange={(event) => update("fixedDenominator", event.target.value)}
            />
          </FormField>
          </> : null}
          <FormField label="Starting value" htmlFor={`${prefix}-baseline`} hint={<ErrorHint error={errors.baseline_value} />}>
            <Input
              id={`${prefix}-baseline`}
              type="number"
              step="any"
              value={draft.baselineValue}
              onChange={(event) => update("baselineValue", event.target.value)}
            />
          </FormField>
          {draft.measurementType === "year_over_year" ? <FormField label="Previous result" htmlFor={`${prefix}-previous`} hint={<ErrorHint error={errors.previous_period_value} />}>
            <Input
              id={`${prefix}-previous`}
              type="number"
              step="any"
              value={draft.previousPeriodValue}
              onChange={(event) => update("previousPeriodValue", event.target.value)}
            />
          </FormField> : null}
          <FormField label="Importance" htmlFor={`${prefix}-weight`} hint={<ErrorHint error={errors.weight} />}>
            <Input
              id={`${prefix}-weight`}
              type="number"
              min="0"
              step="any"
              value={draft.weight}
              onChange={(event) => update("weight", event.target.value)}
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
              onChange={(event) => update("displayOrder", event.target.value)}
            />
          </FormField>
          <FormField label="Setup status" htmlFor={`${prefix}-status`} hint={<ErrorHint error={errors.configuration_status} />}>
            <Select
              id={`${prefix}-status`}
              value={draft.configurationStatus}
              onChange={(event) => update("configurationStatus", event.target.value as ConfigurationStatus)}
            >
              {CONFIGURATION_STATUSES.filter(
                (status) =>
                  status !== "archived" &&
                  (!isCreate || (status !== "ready" && status !== "active")),
              ).map((status) => (
                <option key={status} value={status}>{displayLabel(status)}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="What still needs an answer?" htmlFor={`${prefix}-question`} className="md:col-span-2 lg:col-span-3" hint={<ErrorHint error={errors.unresolved_question} />}>
            <Textarea
              id={`${prefix}-question`}
              value={draft.unresolvedQuestion}
              aria-invalid={Boolean(errors.unresolved_question)}
              onChange={(event) => update("unresolvedQuestion", event.target.value)}
            />
          </FormField>
        </fieldset>
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            icon={isCreate ? Plus : Save}
            isLoading={busy}
          >
            {isCreate ? "Create input" : "Save input"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
