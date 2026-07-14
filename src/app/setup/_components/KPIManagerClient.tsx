"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AdminKpiCreateForm } from "@/components/AdminKpiCreateForm";
import { AdminKpisTable } from "@/components/AdminKpisTable";
import { Button, StatusBanner } from "@/components/ui";
import {
  buildCreateKpiPayload,
  filterCatalogKpis,
} from "@/features/catalog/admin-catalog";
import { apiFetch } from "@/lib/api-client";
import type { Category, KPIWithCategory } from "@/lib/types";

interface CatalogMutationPayload {
  kpis?: KPIWithCategory[];
  categories?: Category[];
  error?: string;
}

export function KPIManagerClient({
  kpis: initialKpis,
  categories: initialCategories,
  selectedKpiId = null,
  focusKpiId = null,
  reportingYear,
}: {
  kpis: KPIWithCategory[];
  categories: Category[];
  selectedKpiId?: number | null;
  focusKpiId?: number | null;
  reportingYear?: number;
}) {
  const [kpis, setKpis] = useState(initialKpis);
  const [categories, setCategories] = useState(initialCategories);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setKpis(initialKpis);
    setCategories(initialCategories);
  }, [initialCategories, initialKpis]);

  const filteredKpis = useMemo(
    () => filterCatalogKpis(kpis, { query, categoryId: null }),
    [kpis, query],
  );

  function applyPayload(data: CatalogMutationPayload) {
    if (data.kpis) setKpis(data.kpis);
    if (data.categories) setCategories(data.categories);
  }

  async function createMeasure(form: FormData) {
    const response = await apiFetch("/api/kpis", {
      method: "POST",
      body: buildCreateKpiPayload(form),
    });
    const data = await response.json() as CatalogMutationPayload;
    if (!response.ok) {
      setFeedback({ message: `Could not create measure: ${data.error ?? response.status}`, variant: "error" });
      return;
    }
    applyPayload(data);
    setShowCreate(false);
    setFeedback({ message: "Measure created.", variant: "success" });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setCreating(true);
    try {
      await createMeasure(new FormData(form));
      form.reset();
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
            categories={categories.filter((category) => !category.archived_at)}
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
