"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminHistoryFilters } from "@/components/AdminHistoryFilters";
import { AdminHistoryTable } from "@/components/AdminHistoryTable";
import { StrategicAuditTable } from "@/components/StrategicAuditTable";
import { Button } from "@/components/ui";
import {
  buildAdminHistoryFilterState,
  buildAdminHistoryHref,
  filterAdminHistoryKpisByCategory,
  hasActiveAdminHistoryFilter,
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
  availableYears: number[];
  page: number;
  hasOlder: boolean;
}

/**
 * Read-only audit-trail browser for KPI admin actions.
 *
 * Filters compose a URL query so a deep link preserves the view; clear filters
 * to return to the full feed (newest first).
 */
export function HistoryClient({
  history,
  kpis,
  categories,
  activeFilter,
  strategicEvents,
  availableYears,
  page,
  hasOlder,
}: HistoryClientProps) {
  const router = useRouter();
  const initialFilters = buildAdminHistoryFilterState(activeFilter);
  const [categoryId, setCategoryId] = useState<string>(initialFilters.categoryId);
  const [kpiId, setKpiId] = useState<string>(initialFilters.kpiId);
  const [year, setYear] = useState<string>(initialFilters.year);

  const kpisForCategory = useMemo(() => {
    return filterAdminHistoryKpisByCategory(kpis, categoryId);
  }, [kpis, categoryId]);

  function applyFilters(next: { categoryId?: string; kpiId?: string; year?: string }) {
    router.replace(buildAdminHistoryHref({ categoryId, kpiId, year }, next), { scroll: false });
  }

  function clearFilters() {
    setCategoryId("");
    setKpiId("");
    setYear("");
    router.replace("/setup?area=activity", { scroll: false });
  }

  function goToPage(nextPage: number) {
    const base = buildAdminHistoryHref({ categoryId, kpiId, year });
    router.replace(`${base}&page=${nextPage}`, { scroll: false });
  }

  return (
    <div className="min-w-0 page-enter">

      <section aria-labelledby="data-changes-heading" className="mb-12">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-ink-200 pb-4">
          <div>
            <h2 id="data-changes-heading" className="text-xl font-semibold text-ink-950">Data changes</h2>
            <p className="mt-1 text-sm text-ink-600">Who changed a reported value and when.</p>
          </div>
          <span className="text-sm font-medium text-ink-600">{history.length} shown</span>
        </div>
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
      </section>

      <section aria-labelledby="setup-changes-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-ink-200 pb-4">
          <div>
            <h2 id="setup-changes-heading" className="text-xl font-semibold text-ink-950">Setup changes</h2>
            <p className="mt-1 text-sm text-ink-600">Recent changes to results, measures, goals, and targets.</p>
          </div>
          <span className="text-sm font-medium text-ink-600">{strategicEvents.length} shown</span>
        </div>
        <StrategicAuditTable events={strategicEvents} />
      </section>

      <nav aria-label="Activity pages" className="mt-8 flex items-center justify-between gap-4 border-t border-ink-200 pt-5">
        <Button
          type="button"
          variant="secondary"
          disabled={page === 1}
          onClick={() => goToPage(page - 1)}
        >
          Newer
        </Button>
        <span className="text-sm font-medium tabular-nums text-ink-600">Page {page}</span>
        <Button
          type="button"
          variant="secondary"
          disabled={!hasOlder}
          onClick={() => goToPage(page + 1)}
        >
          Older
        </Button>
      </nav>
    </div>
  );
}
