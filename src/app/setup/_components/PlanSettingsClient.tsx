"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ActiveInstallation } from "@/features/installation/types";
import { apiFetch } from "@/lib/api-client";
import { runEventHandler } from "@/lib/async-event";
import { Button, FormField, Input, StatusBanner, Textarea } from "@/components/ui";

export function PlanSettingsClient({
  installation,
}: {
  installation: ActiveInstallation;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    organizationName: installation.organization.name,
    organizationShortName: installation.organization.shortName,
    planName: installation.plan.name,
    planDescription: installation.plan.description ?? "",
    startYear: String(installation.plan.startYear),
    endYear: String(installation.plan.endYear),
    sourceReference: installation.plan.sourceReference ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);

  function update(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startYear = Number(draft.startYear);
    const endYear = Number(draft.endYear);
    if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) {
      setFeedback({
        variant: "error",
        message: "Use whole years, with the plan ending on or after it starts.",
      });
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch("/api/categories", {
        method: "PATCH",
        body: {
          action: "update_plan",
          expectedRevision: installation.plan.revision,
          organizationName: draft.organizationName.trim(),
          organizationShortName: draft.organizationShortName.trim(),
          planName: draft.planName.trim(),
          planDescription: draft.planDescription.trim() || null,
          startYear,
          endYear,
          sourceReference: draft.sourceReference.trim() || null,
        },
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setFeedback({
          variant: "error",
          message: body.error ?? "The plan settings could not be saved.",
        });
        return;
      }
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
      <form onSubmit={(event) => runEventHandler(submit, event)} className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <FormField label="Organization name" htmlFor="plan-organization-name">
          <Input id="plan-organization-name" required value={draft.organizationName} onChange={(event) => update("organizationName", event.target.value)} />
        </FormField>
        <FormField label="Short name" htmlFor="plan-organization-short-name">
          <Input id="plan-organization-short-name" required value={draft.organizationShortName} onChange={(event) => update("organizationShortName", event.target.value)} />
        </FormField>
        <FormField label="Plan name" htmlFor="plan-name">
          <Input id="plan-name" required value={draft.planName} onChange={(event) => update("planName", event.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Start year" htmlFor="plan-start-year">
            <Input id="plan-start-year" type="number" min={1900} max={2100} required value={draft.startYear} onChange={(event) => update("startYear", event.target.value)} />
          </FormField>
          <FormField label="End year" htmlFor="plan-end-year">
            <Input id="plan-end-year" type="number" min={1900} max={2100} required value={draft.endYear} onChange={(event) => update("endYear", event.target.value)} />
          </FormField>
        </div>
        <FormField label="Description" htmlFor="plan-description" className="md:col-span-2">
          <Textarea id="plan-description" rows={3} value={draft.planDescription} onChange={(event) => update("planDescription", event.target.value)} />
        </FormField>
        <FormField label="Source reference" htmlFor="plan-source-reference" className="md:col-span-2">
          <Textarea id="plan-source-reference" rows={2} value={draft.sourceReference} onChange={(event) => update("sourceReference", event.target.value)} />
        </FormField>
        <div className="md:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save plan settings"}</Button>
        </div>
      </form>
    </section>
  );
}
