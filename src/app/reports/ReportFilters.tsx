"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormField, Select } from "@/components/ui";
import type { ReportingCycleOption } from "@/features/strategy";

export function ReportFilters({
  view,
  year,
  years,
  period,
  periods,
}: {
  view: "board" | "trends";
  year: number;
  years: number[];
  period: ReportingCycleOption;
  periods: ReportingCycleOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(
    nextView: "board" | "trends",
    nextYear: number,
    nextPeriod: string,
  ) {
    const params = new URLSearchParams({
      view: nextView,
      year: String(nextYear),
      period: nextPeriod,
    });
    startTransition(() => router.replace(`/reports?${params.toString()}`));
  }

  return (
    <div
      className="mb-8 flex flex-wrap gap-4 border-b border-ink-200 pb-6"
      aria-busy={isPending}
    >
      <FormField label="Report" htmlFor="report-view" className="w-full sm:w-56">
        <Select
          id="report-view"
          value={view}
          disabled={isPending}
          onChange={(event) => navigate(
            event.target.value as "board" | "trends",
            year,
            period.value,
          )}
        >
          <option value="board">Board Report</option>
          <option value="trends">Trends</option>
        </Select>
      </FormField>
      <FormField label="Reporting year" htmlFor="report-year" className="w-full sm:w-44">
        <Select
          id="report-year"
          value={year}
          disabled={isPending}
          onChange={(event) => navigate(
            view,
            Number(event.target.value),
            period.value,
          )}
        >
          {years.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Reporting period" htmlFor="report-period" className="w-full sm:w-64">
        <Select
          id="report-period"
          value={period.value}
          disabled={isPending}
          onChange={(event) => navigate(view, year, event.target.value)}
        >
          {periods.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </FormField>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isPending ? "Loading the selected report." : ""}
      </span>
    </div>
  );
}
