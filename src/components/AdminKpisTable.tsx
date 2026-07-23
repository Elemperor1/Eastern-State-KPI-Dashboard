"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect } from "react";
import { Badge, Input } from "@/components/ui";
import type { KPIWithCategory } from "@/lib/types";

interface AdminKpisTableProps {
  kpis: KPIWithCategory[];
  totalKpis: number;
  query: string;
  onQueryChange: (query: string) => void;
  selectedKpiId?: number | null;
  focusKpiId?: number | null;
  reportingYear?: number;
}

/** Renders the admin kpis table interface. */
export function AdminKpisTable({
  kpis,
  totalKpis,
  query,
  onQueryChange,
  selectedKpiId = null,
  focusKpiId = null,
  reportingYear,
}: AdminKpisTableProps) {
  /** Implements the href for operation. */
  const hrefFor = (id: number) =>
    `/setup?area=measures&item=${id}${reportingYear ? `&year=${reportingYear}` : ""}`;

  useEffect(() => {
    if (focusKpiId === null) return;
    document.getElementById(`measure-list-item-${focusKpiId}`)?.focus();
  }, [focusKpiId]);

  return (
    <section className="overflow-hidden border-y border-ink-200">
      <div className="space-y-4 border-b border-ink-100 p-4">
        <div>
          <h2 className="text-base font-semibold text-ink-950">Find a measure</h2>
          <p className="mt-1 text-sm text-ink-600">{kpis.length} of {totalKpis} measures</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search measures…"
            aria-label="Search measures"
            className="pl-9"
          />
        </div>
      </div>

      <ul className="divide-y divide-ink-100">
        {kpis.length === 0 ? <li className="px-4 py-8 text-center text-sm text-ink-500">No measures match.</li> : null}
        {kpis.map((kpi) => (
          <li key={kpi.id}>
            <Link
              id={`measure-list-item-${kpi.id}`}
              href={hrefFor(kpi.id)}
              aria-current={selectedKpiId === kpi.id ? "page" : undefined}
              className={`block px-4 py-4 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--color-focus) ${selectedKpiId === kpi.id ? "bg-brand-50" : "hover:bg-ink-50"}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium text-ink-950">{kpi.name}</span>
                {kpi.archived_at ? <Badge variant="incomplete" label="Measure status">Archived</Badge> : null}
              </span>
              <span className="mt-1 block text-sm text-ink-600">{kpi.category_name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
