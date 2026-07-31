"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminHistoryFilters } from "@/components/AdminHistoryFilters";
import { AdminHistoryTable } from "@/components/AdminHistoryTable";
import {
  StrategicAuditTable,
  type SetupAuditEvent,
} from "@/components/StrategicAuditTable";
import { Badge, Button, FormField, Select, Table } from "@/components/ui";
import {
  buildAdminHistoryFilterState,
  buildAdminHistoryHref,
  filterAdminHistoryKpisByCategory,
  hasActiveAdminHistoryFilter,
} from "@/features/audit/admin-history";
import { parseUtcTimestamp } from "@/lib/sqlite-timestamp";
import type {
  Category,
  EntryHistoryWithMeta,
  KPIWithCategory,
} from "@/lib/types";
import type {
  PlanLifecycleAction,
  PlanLifecycleEventRecord,
  StrategicPlanSummary,
} from "@/features/plans/types";
interface HistoryClientProps {
  history: EntryHistoryWithMeta[];
  kpis: KPIWithCategory[];
  categories: Category[];
  activeFilter: {
    kpi_id?: number;
    category_id?: number;
    year?: number;
  };
  setupEvents: SetupAuditEvent[];
  lifecycleEvents: PlanLifecycleEventRecord[];
  lifecyclePlans: StrategicPlanSummary[];
  lifecycleFilter: {
    planId?: number;
    action?: PlanLifecycleAction;
  };
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
  setupEvents,
  lifecycleEvents,
  lifecyclePlans,
  lifecycleFilter,
  availableYears,
  page,
  hasOlder,
}: HistoryClientProps) {
  const router = useRouter();
  const initialFilters = buildAdminHistoryFilterState(activeFilter);
  const [categoryId, setCategoryId] = useState<string>(initialFilters.categoryId);
  const [kpiId, setKpiId] = useState<string>(initialFilters.kpiId);
  const [year, setYear] = useState<string>(initialFilters.year);
  const [lifecyclePlanId, setLifecyclePlanId] = useState(
    lifecycleFilter.planId ? String(lifecycleFilter.planId) : "",
  );
  const [lifecycleAction, setLifecycleAction] = useState(
    lifecycleFilter.action ?? "",
  );

  const kpisForCategory = useMemo(() => {
    return filterAdminHistoryKpisByCategory(kpis, categoryId);
  }, [kpis, categoryId]);

  /** Implements the apply filters operation. */
  function applyFilters(next: { categoryId?: string; kpiId?: string; year?: string }) {
    router.replace(buildAdminHistoryHref({ categoryId, kpiId, year }, next), { scroll: false });
  }

  /** Removes or resets filters. */
  function clearFilters() {
    setCategoryId("");
    setKpiId("");
    setYear("");
    router.replace("/setup?area=activity", { scroll: false });
  }

  /** Implements the go to page operation. */
  function goToPage(nextPage: number) {
    const base = buildAdminHistoryHref({ categoryId, kpiId, year });
    const lifecycle = new URLSearchParams();
    if (lifecyclePlanId) lifecycle.set("lifecycle_plan", lifecyclePlanId);
    if (lifecycleAction) lifecycle.set("lifecycle_action", lifecycleAction);
    const suffix = lifecycle.toString();
    router.replace(
      `${base}&page=${nextPage}${suffix ? `&${suffix}` : ""}`,
      { scroll: false },
    );
  }

  /** Applies the independent Strategic Plan lifecycle filters. */
  function applyLifecycleFilters(nextPlanId: string, nextAction: string) {
    const query = new URLSearchParams({ area: "activity" });
    if (nextPlanId) query.set("lifecycle_plan", nextPlanId);
    if (nextAction) query.set("lifecycle_action", nextAction);
    router.replace(`/setup?${query.toString()}`, { scroll: false });
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

      <section aria-labelledby="plan-lifecycle-heading" className="mb-12">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-ink-200 pb-4">
          <div>
            <h2 id="plan-lifecycle-heading" className="text-xl font-semibold text-ink-950">
              Strategic Plan lifecycle
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Completed Draft creation, cancellation, activation, archiving, and recovery actions.
            </p>
          </div>
          <span className="text-sm font-medium text-ink-600">
            {lifecycleEvents.length} shown
          </span>
        </div>
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          <FormField label="Strategic Plan" htmlFor="lifecycle-plan-filter">
            <Select
              id="lifecycle-plan-filter"
              value={lifecyclePlanId}
              onChange={(event) => {
                const next = event.target.value;
                setLifecyclePlanId(next);
                applyLifecycleFilters(next, lifecycleAction);
              }}
            >
              <option value="">All Strategic Plans</option>
              {lifecyclePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.startYear}–{plan.endYear})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Lifecycle action" htmlFor="lifecycle-action-filter">
            <Select
              id="lifecycle-action-filter"
              value={lifecycleAction}
              onChange={(event) => {
                const next = event.target.value;
                setLifecycleAction(next);
                applyLifecycleFilters(lifecyclePlanId, next);
              }}
            >
              <option value="">All lifecycle actions</option>
              <option value="create_blank">Blank Draft created</option>
              <option value="create_structural_clone">Structural Draft created</option>
              <option value="cancel">Draft cancelled</option>
              <option value="activate">Plan activated</option>
              <option value="archive">Former plan archived</option>
              <option value="activation_recovered">Activation recovered</option>
            </Select>
          </FormField>
        </div>
        <div className="rounded-lg border border-ink-200">
          <Table minWidth="720px">
            <thead className="bg-ink-50 text-ink-700">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">When</th>
                <th scope="col" className="px-4 py-3 font-semibold">Strategic Plan</th>
                <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                <th scope="col" className="px-4 py-3 font-semibold">Completed by</th>
                <th scope="col" className="px-4 py-3 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {lifecycleEvents.map((event) => (
                <tr key={event.eventId} className="border-t border-ink-200 align-top">
                  <td className="px-4 py-3 text-ink-600">
                    {parseUtcTimestamp(event.occurredAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-900">
                    {event.planName}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{event.action.replaceAll("_", " ")}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {event.actorEmail ?? "System operator"}
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {event.beforeState
                      ? `${event.beforeState} → ${event.afterState}`
                      : event.afterState}
                  </td>
                </tr>
              ))}
              {lifecycleEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-600">
                    No completed lifecycle actions match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="setup-changes-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-ink-200 pb-4">
          <div>
            <h2 id="setup-changes-heading" className="text-xl font-semibold text-ink-950">Setup changes</h2>
            <p className="mt-1 text-sm text-ink-600">Recent changes to organization, plan, measures, goals, and targets.</p>
          </div>
          <span className="text-sm font-medium text-ink-600">{setupEvents.length} shown</span>
        </div>
        <StrategicAuditTable events={setupEvents} />
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
