"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { ActiveInstallation } from "@/features/installation/types";
import {
  PlanSettingsUpdateSchema,
  type PlanSettingsUpdate,
} from "@/features/installation/validation";
import { apiFetch } from "@/lib/api-client";
import { runEventHandler } from "@/lib/async-event";
import { useUnsavedChanges } from "@/components/UnsavedChangesContext";
import { Button, FormField, Input, StatusBanner, Textarea } from "@/components/ui";

interface PlanSettingsDraft {
  organizationName: string;
  organizationShortName: string;
  planName: string;
  planDescription: string;
  startYear: string;
  endYear: string;
  sourceReference: string;
}

type PlanSettingsErrors = Partial<Record<keyof PlanSettingsDraft, string>>;

/** Builds from installation. */
function draftFromInstallation(installation: ActiveInstallation): PlanSettingsDraft {
  return {
    organizationName: installation.organization.name,
    organizationShortName: installation.organization.shortName,
    planName: installation.plan.name,
    planDescription: installation.plan.description ?? "",
    startYear: String(installation.plan.startYear),
    endYear: String(installation.plan.endYear),
    sourceReference: installation.plan.sourceReference ?? "",
  };
}

/** Builds from draft. */
function payloadFromDraft(
  draft: PlanSettingsDraft,
  expectedRevision: number,
): PlanSettingsUpdate {
  return {
    expectedRevision,
    organizationName: draft.organizationName.trim(),
    organizationShortName: draft.organizationShortName.trim(),
    planName: draft.planName.trim(),
    planDescription: draft.planDescription.trim() || null,
    startYear: Number(draft.startYear),
    endYear: Number(draft.endYear),
    sourceReference: draft.sourceReference.trim() || null,
  };
}

/** Implements the error hint operation. */
function errorHint(error: string | undefined, fallback?: ReactNode): ReactNode {
  return error ? (
    <span className="font-medium text-[var(--color-danger-text)]">{error}</span>
  ) : (
    fallback ?? null
  );
}

/** Renders the plan settings client interface. */
export function PlanSettingsClient({
  installation,
}: {
  installation: ActiveInstallation;
}) {
  const router = useRouter();
  const { setSourceState, clearSourceState } = useUnsavedChanges();
  const initialDraft = useMemo(
    () => draftFromInstallation(installation),
    [installation],
  );
  const [draft, setDraft] = useState(initialDraft);
  const [baseline, setBaseline] = useState(initialDraft);
  const [revision, setRevision] = useState(installation.plan.revision);
  const [errors, setErrors] = useState<PlanSettingsErrors>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [baseline, draft],
  );

  useEffect(() => {
    setSourceState("plan-settings", { dirty: isDirty, busy });
    return () => clearSourceState("plan-settings");
  }, [busy, clearSourceState, isDirty, setSourceState]);

  /** Updates the current state. */
  function update(key: keyof PlanSettingsDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFeedback(null);
  }

  /** Implements the focus first invalid field operation. */
  function focusFirstInvalidField() {
    window.requestAnimationFrame(() =>
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus(),
    );
  }

  /** Runs the submit workflow. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = PlanSettingsUpdateSchema.safeParse(
      payloadFromDraft(draft, revision),
    );
    if (!parsed.success) {
      const nextErrors: PlanSettingsErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && field in draft && !nextErrors[field as keyof PlanSettingsDraft]) {
          nextErrors[field as keyof PlanSettingsDraft] = issue.message;
        }
      }
      setErrors(nextErrors);
      setFeedback({
        variant: "error",
        message: "Correct the highlighted plan settings and try again.",
      });
      focusFirstInvalidField();
      return;
    }

    setBusy(true);
    try {
      const response = await apiFetch("/api/categories", {
        method: "PATCH",
        body: { action: "update_plan", ...parsed.data },
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        installation?: ActiveInstallation;
      };
      if (!response.ok) {
        setFeedback({
          variant: "error",
          message: body.error ?? "The plan settings could not be saved.",
        });
        return;
      }
      const savedDraft = body.installation
        ? draftFromInstallation(body.installation)
        : draft;
      setDraft(savedDraft);
      setBaseline(savedDraft);
      setRevision(body.installation?.plan.revision ?? revision + 1);
      setErrors({});
      setFeedback({ variant: "success", message: "Plan settings saved." });
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

  return (
    <section className="mb-10 border-b border-ink-200 pb-10" aria-labelledby="plan-settings-heading">
      <div className="mb-5">
        <h2 id="plan-settings-heading" className="text-xl font-semibold text-ink-950">Plan settings</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-600">
          These names and years appear throughout reporting. Existing records outside a shorter range must be resolved first.
        </p>
      </div>
      {feedback ? <StatusBanner variant={feedback.variant}>{feedback.message}</StatusBanner> : null}
      <form
        ref={formRef}
        onSubmit={(event) => runEventHandler(submit, event)}
        className="grid grid-cols-1 gap-5 md:grid-cols-2"
        aria-busy={busy}
      >
        <FormField label="Organization name" htmlFor="plan-organization-name" hint={errorHint(errors.organizationName)}>
          <Input id="plan-organization-name" required aria-invalid={Boolean(errors.organizationName)} value={draft.organizationName} onChange={(event) => update("organizationName", event.target.value)} />
        </FormField>
        <FormField label="Short name" htmlFor="plan-organization-short-name" hint={errorHint(errors.organizationShortName)}>
          <Input id="plan-organization-short-name" required aria-invalid={Boolean(errors.organizationShortName)} value={draft.organizationShortName} onChange={(event) => update("organizationShortName", event.target.value)} />
        </FormField>
        <FormField label="Plan name" htmlFor="plan-name" hint={errorHint(errors.planName)}>
          <Input id="plan-name" required aria-invalid={Boolean(errors.planName)} value={draft.planName} onChange={(event) => update("planName", event.target.value)} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Start year" htmlFor="plan-start-year" hint={errorHint(errors.startYear, "First reporting year in this plan.")}>
            <Input id="plan-start-year" type="number" min={1900} max={2100} required aria-invalid={Boolean(errors.startYear)} value={draft.startYear} onChange={(event) => update("startYear", event.target.value)} />
          </FormField>
          <FormField label="End year" htmlFor="plan-end-year" hint={errorHint(errors.endYear, "Last reporting year in this plan.")}>
            <Input id="plan-end-year" type="number" min={1900} max={2100} required aria-invalid={Boolean(errors.endYear)} value={draft.endYear} onChange={(event) => update("endYear", event.target.value)} />
          </FormField>
        </div>
        <FormField label="Description" htmlFor="plan-description" className="md:col-span-2" hint={errorHint(errors.planDescription)}>
          <Textarea id="plan-description" rows={3} aria-invalid={Boolean(errors.planDescription)} value={draft.planDescription} onChange={(event) => update("planDescription", event.target.value)} />
        </FormField>
        <FormField label="Source reference" htmlFor="plan-source-reference" className="md:col-span-2" hint={errorHint(errors.sourceReference)}>
          <Textarea id="plan-source-reference" rows={2} aria-invalid={Boolean(errors.sourceReference)} value={draft.sourceReference} onChange={(event) => update("sourceReference", event.target.value)} />
        </FormField>
        <div className="md:col-span-2">
          <Button type="submit" variant="primary" isLoading={busy}>Save plan settings</Button>
        </div>
      </form>
    </section>
  );
}
