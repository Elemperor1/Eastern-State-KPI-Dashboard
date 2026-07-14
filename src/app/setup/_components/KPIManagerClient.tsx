"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminKpiCreateForm } from "@/components/AdminKpiCreateForm";
import { AdminKpisTable } from "@/components/AdminKpisTable";
import { Button, StatusBanner } from "@/components/ui";
import {
  buildCreateKpiPayload,
  filterCatalogKpis,
  type StrategicMeasureGoalOption,
} from "@/features/catalog/admin-catalog";
import { apiFetch } from "@/lib/api-client";
import type { KPIWithCategory } from "@/lib/types";

interface CatalogMutationPayload {
  kpis?: KPIWithCategory[];
  kpi?: { id: number };
  error?: string;
}

export function KPIManagerClient({
  kpis: initialKpis,
  goals,
  selectedKpiId = null,
  focusKpiId = null,
  reportingYear,
}: {
  kpis: KPIWithCategory[];
  goals: StrategicMeasureGoalOption[];
  selectedKpiId?: number | null;
  focusKpiId?: number | null;
  reportingYear: number;
}) {
  const router = useRouter();
  const [kpis, setKpis] = useState(initialKpis);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setKpis(initialKpis);
  }, [initialKpis]);

  const filteredKpis = useMemo(
    () => filterCatalogKpis(kpis, { query, categoryId: null }),
    [kpis, query],
  );

  function applyPayload(data: CatalogMutationPayload) {
    if (data.kpis) setKpis(data.kpis);
  }

  async function createMeasure(form: FormData): Promise<number | null> {
    form.set("reporting_year", String(reportingYear));
    const response = await apiFetch("/api/kpis", {
      method: "POST",
      body: buildCreateKpiPayload(form),
    });
    const data = await response.json() as CatalogMutationPayload;
    if (!response.ok) {
      setFeedback({ message: `Could not create measure: ${data.error ?? response.status}`, variant: "error" });
      return null;
    }
    applyPayload(data);
    setShowCreate(false);
    setFeedback({ message: "Measure created. Finish its setup before entering data.", variant: "success" });
    const createdId = data.kpi?.id ?? null;
    if (createdId !== null) {
      router.push(`/setup?area=measures&item=${createdId}&year=${reportingYear}`);
    }
    return createdId;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setCreating(true);
    try {
      const createdId = await createMeasure(new FormData(form));
      if (createdId !== null) form.reset();
    } catch {
      setFeedback({ message: "Could not create measure. Check the connection and try again.", variant: "error" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-w-0">

      {feedback ? (
        <StatusBanner variant={feedback.variant} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </StatusBanner>
      ) : null}

      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-ink-200 pb-4">
          <h2 className="text-lg font-semibold text-ink-950">Measures</h2>
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowCreate((current) => !current)}>
            {showCreate ? "Cancel" : "Add measure"}
          </Button>
        </div>

        {showCreate ? (
          <AdminKpiCreateForm
            goals={goals}
            onSubmit={handleCreate}
            isSubmitting={creating}
          />
        ) : null}

        <AdminKpisTable
          kpis={filteredKpis}
          totalKpis={kpis.length}
          query={query}
          onQueryChange={setQuery}
          selectedKpiId={selectedKpiId}
          focusKpiId={focusKpiId}
          reportingYear={reportingYear}
        />
      </div>
    </div>
  );
}
