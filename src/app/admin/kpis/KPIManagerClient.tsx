"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { AdminCategoriesList } from "@/components/AdminCategoriesList";
import { AdminCategoryCreateForm } from "@/components/AdminCategoryCreateForm";
import { AdminKpiCreateForm } from "@/components/AdminKpiCreateForm";
import { AdminKpisTable } from "@/components/AdminKpisTable";
import {
  ConfirmDialog,
  PageHeader,
  StatusBanner,
  Tabs,
} from "@/components/ui";
import {
  buildCatalogCategorySummaries,
  buildCatalogDeleteConfirmation,
  buildCreateCategoryPayload,
  buildCreateKpiPayload,
  filterCatalogKpis,
  type CatalogDeleteTarget,
} from "@/features/catalog/admin-catalog";
import type { Category, KPIWithCategory } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";

type Tab = "kpis" | "categories";

interface CatalogMutationPayload {
  kpis?: KPIWithCategory[];
  categories?: Category[];
  lifecycle?: "archived" | "restored" | "deleted";
  error?: string;
}

export function KPIManagerClient({
  kpis: initialKpis,
  categories: initialCategories,
}: {
  kpis: KPIWithCategory[];
  categories: Category[];
}) {
  const [tab, setTab] = useState<Tab>("kpis");
  const [kpis, setKpis] = useState(initialKpis);
  const [categories, setCategories] = useState(initialCategories);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogDeleteTarget | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);

  const filteredKpis = useMemo(() => {
    return filterCatalogKpis(kpis, { query, categoryId: categoryFilter });
  }, [kpis, query, categoryFilter]);

  const categorySummaries = useMemo(
    () => buildCatalogCategorySummaries(categories, kpis),
    [categories, kpis],
  );

  function applyCatalogPayload(data: CatalogMutationPayload) {
    if (data.kpis) setKpis(data.kpis);
    if (data.categories) setCategories(data.categories);
  }

  async function createKPI(form: FormData) {
    const payload = buildCreateKpiPayload(form);
    const res = await apiFetch("/api/kpis", {
      method: "POST",
      body: payload,
    });
    const data = await res.json() as CatalogMutationPayload;
    if (!res.ok) {
      setFeedback({ message: `Could not create KPI: ${data.error}`, variant: "error" });
      return;
    }
    applyCatalogPayload(data);
    setFeedback({ message: "KPI created.", variant: "success" });
  }

  async function deleteKPI(id: number) {
    const res = await apiFetch("/api/kpis", {
      method: "DELETE",
      body: { id },
    });
    const data = await res.json() as CatalogMutationPayload;
    if (!res.ok) {
      setFeedback({ message: `Could not delete: ${data.error}`, variant: "error" });
      return;
    }
    applyCatalogPayload(data);
    setFeedback({
      message:
        data.lifecycle === "archived"
          ? "Strategic KPI archived. History and configuration were preserved."
          : "Legacy KPI deleted.",
      variant: "success",
    });
  }

  async function restoreKPI(id: number) {
    const res = await apiFetch("/api/kpis", {
      method: "PATCH",
      body: { action: "restore", id },
    });
    const data = await res.json() as CatalogMutationPayload;
    if (!res.ok) {
      setFeedback({ message: `Could not restore KPI: ${data.error}`, variant: "error" });
      return;
    }
    applyCatalogPayload(data);
    setFeedback({ message: "Strategic KPI restored.", variant: "success" });
  }

  async function createCategory(form: FormData) {
    const payload = buildCreateCategoryPayload(form);
    const res = await apiFetch("/api/categories", {
      method: "POST",
      body: payload,
    });
    const data = await res.json() as CatalogMutationPayload;
    if (!res.ok) {
      setFeedback({ message: `Could not create category: ${data.error}`, variant: "error" });
      return;
    }
    applyCatalogPayload(data);
    setFeedback({ message: "Category created.", variant: "success" });
  }

  async function deleteCategory(id: number) {
    const res = await apiFetch("/api/categories", {
      method: "DELETE",
      body: { id },
    });
    const data = await res.json() as CatalogMutationPayload;
    if (!res.ok) {
      setFeedback({ message: `Could not delete: ${data.error}`, variant: "error" });
      return;
    }
    applyCatalogPayload(data);
    setFeedback({
      message:
        data.lifecycle === "archived"
          ? "Strategic priority archived. Its goals, KPIs, and history were preserved."
          : "Legacy category deleted.",
      variant: "success",
    });
  }

  async function restoreCategory(id: number) {
    const res = await apiFetch("/api/categories", {
      method: "PATCH",
      body: { action: "restore", id },
    });
    const data = await res.json() as CatalogMutationPayload;
    if (!res.ok) {
      setFeedback({
        message: `Could not restore category: ${data.error}`,
        variant: "error",
      });
      return;
    }
    applyCatalogPayload(data);
    setFeedback({ message: "Strategic priority restored.", variant: "success" });
  }

  function requestDeleteKPI(id: number, name: string) {
    setDeleteTarget({ kind: "kpi", id, name });
  }

  function requestDeleteCategory(id: number, name: string) {
    setDeleteTarget({ kind: "category", id, name });
  }

  async function handleCreateKpi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await createKPI(new FormData(form));
    form.reset();
  }

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await createCategory(new FormData(form));
    form.reset();
  }

  const deleteConfirmation = deleteTarget
    ? buildCatalogDeleteConfirmation(deleteTarget)
    : null;

  return (
    <div className="page-content page-enter">
      <PageHeader
        eyebrow="Admin · KPIs & Categories"
        title="Define what gets measured"
        subtitle="Add new KPIs or categories. Each KPI defines its unit type, reporting frequency, and direction."
      />

      {feedback ? (
        <StatusBanner variant={feedback.variant} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </StatusBanner>
      ) : null}

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "kpis", label: `KPIs (${kpis.length})` },
          { value: "categories", label: `Categories (${categories.length})` },
        ]}
        className="mb-6"
      />

      {tab === "kpis" ? (
        <div className="space-y-6">
          <AdminKpiCreateForm
            categories={categories.filter((category) => !category.archived_at)}
            onSubmit={handleCreateKpi}
          />
          <AdminKpisTable
            kpis={filteredKpis}
            totalKpis={kpis.length}
            totalCategories={categories.length}
            categories={categorySummaries}
            query={query}
            categoryFilter={categoryFilter}
            onQueryChange={setQuery}
            onCategoryFilterChange={setCategoryFilter}
            onDelete={requestDeleteKPI}
            onRestore={(id) => restoreKPI(id)}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <AdminCategoryCreateForm onSubmit={handleCreateCategory} />
          <AdminCategoriesList
            categories={categories}
            onDelete={requestDeleteCategory}
            onRestore={(id) => restoreCategory(id)}
          />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteConfirmation?.title ?? ""}
        description={deleteConfirmation?.description ?? ""}
        confirmLabel={deleteConfirmation?.confirmLabel}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (!target) return;
          if (target.kind === "kpi") {
            await deleteKPI(target.id);
          } else {
            await deleteCategory(target.id);
          }
        }}
      />
    </div>
  );
}
