"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminHistoryFilters } from "@/components/AdminHistoryFilters";
import { AdminHistoryTable } from "@/components/AdminHistoryTable";
import { PageHeader } from "@/components/ui";
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

interface HistoryClientProps {
  history: EntryHistoryWithMeta[];
  kpis: KPIWithCategory[];
  categories: Category[];
  activeFilter: {
    kpi_id?: number;
    category_id?: number;
    year?: number;
  };
}

/**
 * Read-only audit-trail browser for KPI admin actions.
 *
 * Filters compose a URL query so a deep link preserves the view; clear filters
 * to return to the full feed (newest first).
 */
export function HistoryClient({ history, kpis, categories, activeFilter }: HistoryClientProps) {
  const router = useRouter();
  const initialFilters = buildAdminHistoryFilterState(activeFilter);
  const [categoryId, setCategoryId] = useState<string>(initialFilters.categoryId);
  const [kpiId, setKpiId] = useState<string>(initialFilters.kpiId);
  const [year, setYear] = useState<string>(initialFilters.year);

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
        subtitle="Every change to a monthly or breakdown entry leaves a before/after row here. Read-only — entries cannot be replayed from this view."
      />

      <AdminHistoryFilters
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

      <AdminHistoryTable history={history} />
    </div>
  );
}
