"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  CONFIGURATION_STATUSES,
  type ConfigurationStatus,
  type MeasurementType,
} from "@/features/strategy";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  FormField,
  Input,
  Select,
  StatusBanner,
  Textarea,
} from "@/components/ui";
import {
  buildTargetFormPayload,
  buildTargetMutation,
  firstFormError,
  type StrategyEditorFormErrors,
  type StrategyEditorMutationRunner,
  type TargetFormDraft,
} from "./strategic-kpi-editor-model";

const EDITABLE_CONFIGURATION_STATUSES = CONFIGURATION_STATUSES.filter(
  (status) => status !== "archived",
);

export function StrategicTargetEditorCard({
  title,
  description,
  initialDraft,
  kpiId,
  componentId = null,
  measurementType,
  runMutation,
  idPrefix,
  lockedTargetYear,
}: {
  title: string;
  description: string;
  initialDraft: TargetFormDraft;
  kpiId: number;
  componentId?: number | null;
  measurementType: MeasurementType;
  runMutation: StrategyEditorMutationRunner;
  idPrefix: string;
  lockedTargetYear?: number;
}) {
  const initialDraftSignature = JSON.stringify(initialDraft);
  const latestInitialDraft = useRef(initialDraft);
  latestInitialDraft.current = initialDraft;
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<StrategyEditorFormErrors>({});
  const [feedback, setFeedback] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(latestInitialDraft.current);
    setErrors({});
    setFeedback(null);
  }, [initialDraftSignature]);

  function update<K extends keyof TargetFormDraft>(
    key: K,
    value: TargetFormDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const built = buildTargetFormPayload(
      draft,
      kpiId,
      measurementType,
      componentId,
    );
    if (!built.ok) {
      setErrors(built.errors);
      setFeedback({
        variant: "error",
        message: firstFormError(built.errors) ?? "Review the target fields.",
      });
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await runMutation(
      buildTargetMutation(built.payload, draft.id === null),
    );
    setBusy(false);
    setFeedback(
      result.ok
        ? { variant: "success", message: `${title} saved.` }
        : {
            variant: "error",
            message:
              result.error ?? `Could not save ${title.toLocaleLowerCase()}.`,
          },
    );
  }

  const fieldId = (suffix: string) => `${idPrefix}-${draft.scope}-${suffix}`;
  return (
    <Card as="section" className="p-5 lg:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-ink-900">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-500">{description}</p>
        </div>
        <Badge variant={draft.id === null ? "warning" : "info"}>
          {draft.id === null ? "Needs attention" : "Saved"}
        </Badge>
      </div>
      {feedback ? (
        <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner>
      ) : null}
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={busy} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            label={lockedTargetYear === undefined ? "Target year" : "Reporting year"}
            htmlFor={fieldId("year")}
            hint={
              errors.target_year ??
              (lockedTargetYear === undefined
                ? "Choose a year from 2025 through 2029."
                : "Change the reporting year above to edit another target.")
            }
          >
            <Input
              id={fieldId("year")}
              type="number"
              min={draft.externalTargetYear ? 1900 : 2025}
              max={draft.externalTargetYear ? 2100 : 2029}
              value={draft.targetYear}
              disabled={lockedTargetYear !== undefined}
              aria-invalid={Boolean(errors.target_year)}
              onChange={(event) => update("targetYear", event.target.value)}
            />
          </FormField>
          {lockedTargetYear === undefined ? (
            <div className="flex items-end pb-1">
              <Checkbox
                id={fieldId("external-year")}
                checked={draft.externalTargetYear}
                onChange={(event) =>
                  update("externalTargetYear", event.target.checked)
                }
                label="Use a year outside the plan"
                description="Turn this on only when the approved target is outside 2025–2029."
              />
            </div>
          ) : (
            <div className="flex items-end pb-2 text-sm leading-6 text-ink-600">
              This target applies to {lockedTargetYear}.
            </div>
          )}
          <FormField
            label="Target value"
            htmlFor={fieldId("value")}
            hint={
              errors.target_value ??
              "Zero is valid; a binary target may use a description only."
            }
          >
            <Input
              id={fieldId("value")}
              type="number"
              step="any"
              value={draft.targetValue}
              aria-invalid={Boolean(errors.target_value)}
              onChange={(event) => update("targetValue", event.target.value)}
            />
          </FormField>
          <FormField
            label="Setup status"
            htmlFor={fieldId("status")}
            hint={errors.configuration_status}
          >
            <Select
              id={fieldId("status")}
              value={draft.configurationStatus}
              onChange={(event) =>
                update(
                  "configurationStatus",
                  event.target.value as ConfigurationStatus,
                )
              }
            >
              {EDITABLE_CONFIGURATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {displayLabel(status)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Last reviewed"
            htmlFor={fieldId("reviewed")}
            hint={errors.last_reviewed_date}
          >
            <Input
              id={fieldId("reviewed")}
              type="date"
              value={draft.lastReviewedDate}
              onChange={(event) => update("lastReviewedDate", event.target.value)}
            />
          </FormField>
          <FormField
            label="What does success look like?"
            htmlFor={fieldId("description")}
            className="md:col-span-2"
            hint={
              errors.target_description ??
              "Describe the outcome and when it should happen."
            }
          >
            <Textarea
              id={fieldId("description")}
              value={draft.targetDescription}
              aria-invalid={Boolean(errors.target_description)}
              onChange={(event) =>
                update("targetDescription", event.target.value)
              }
            />
          </FormField>
          <FormField
            label="Source"
            htmlFor={fieldId("source")}
            className="md:col-span-2"
            hint={errors.source_reference}
          >
            <Input
              id={fieldId("source")}
              value={draft.sourceReference}
              onChange={(event) => update("sourceReference", event.target.value)}
            />
          </FormField>
        </fieldset>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" isLoading={busy}>
            Save {title.toLocaleLowerCase()}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function displayLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toLocaleUpperCase());
}
