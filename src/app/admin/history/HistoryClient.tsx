"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminHistoryFilters } from "@/components/AdminHistoryFilters";
import { AdminHistoryTable } from "@/components/AdminHistoryTable";
import { StrategicAuditTable } from "@/components/StrategicAuditTable";
import { PageHeader, Tabs } from "@/components/ui";
import {
  buildAdminHistoryFilterState,
  buildAdminHistoryHref,
  filterAdminHistoryKpisByCategory,
  hasActiveAdminHistoryFilter,
  listAdminHistoryYears,
} from "@/features/audit/admin-history";
import type {
  Category,
  EntryHistoryWithMeta,
  KPIWithCategory,
} from "@/lib/types";
import type { StrategicAuditEvent } from "@/features/strategy";

interface HistoryClientProps {
  history: EntryHistoryWithMeta[];
  kpis: KPIWithCategory[];
  categories: Category[];
  activeFilter: {
    kpi_id?: number;
    category_id?: number;
    year?: number;
  };
  strategicEvents: StrategicAuditEvent[];
}

/**
 * Read-only audit-trail browser for KPI admin actions.
 *
 * Filters compose a URL query so a deep link preserves the view; clear filters
 * to return to the full feed (newest first).
 */
export function HistoryClient({ history, kpis, categories, activeFilter, strategicEvents }: HistoryClientProps) {
  const router = useRouter();
  const initialFilters = buildAdminHistoryFilterState(activeFilter);
  const [categoryId, setCategoryId] = useState<string>(initialFilters.categoryId);
  const [kpiId, setKpiId] = useState<string>(initialFilters.kpiId);
  const [year, setYear] = useState<string>(initialFilters.year);
  const [view, setView] = useState<"values" | "strategy">("values");

  const kpisForCategory = useMemo(() => {
    return filterAdminHistoryKpisByCategory(kpis, categoryId);
  }, [kpis, categoryId]);

  const availableYears = useMemo(() => {
    return listAdminHistoryYears(history);
  }, [history]);

  function applyFilters(next: { categoryId?: string; kpiId?: string; year?: string }) {
    router.replace(buildAdminHistoryHref({ categoryId, kpiId, year }, next), { scroll: false });
  }

  function clearFilters() {
    setCategoryId("");
    setKpiId("");
    setYear("");
    router.replace("/admin/history", { scroll: false });
  }

  return (
    <div className="page-content page-content-wide page-enter">
      <PageHeader
        eyebrow="Admin · History"
        title="Edit history"
        subtitle="Every value and strategic-configuration change leaves an immutable before/after record. Read-only — changes cannot be replayed from this view."
      />

      <Tabs
        value={view}
        onChange={setView}
        options={[
          { value: "values", label: `KPI values (${history.length})` },
          { value: "strategy", label: `Strategic configuration (${strategicEvents.length})` },
        ]}
        className="mb-6"
      />

      {view === "values" ? <><AdminHistoryFilters
        categories={categories}
        kpis={kpisForCategory}
        years={availableYears}
        historyCount={history.length}
        categoryId={categoryId}
        kpiId={kpiId}
        year={year}
        showClear={hasActiveAdminHistoryFilter(activeFilter)}
        onCategoryChange={(next) => {
          setCategoryId(next);
          setKpiId("");
          applyFilters({ categoryId: next, kpiId: "" });
        }}
        onKpiChange={(next) => {
          setKpiId(next);
          applyFilters({ kpiId: next });
        }}
        onYearChange={(next) => {
          setYear(next);
          applyFilters({ year: next });
        }}
        onClear={clearFilters}
      />

      <AdminHistoryTable history={history} /></> : (
        <StrategicAuditTable events={strategicEvents} />
      )}
    </div>
  );
}
