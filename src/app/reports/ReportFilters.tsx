"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormField, Select } from "@/components/ui";
import type { ReportingCycleOption } from "@/features/strategy";
import type { ReportingPlanContext } from "@/features/reporting/types";

/** Renders the report filters interface. */
export function ReportFilters({
  view,
  year,
  years,
  period,
  periods,
  plans,
  plan,
  allowTrends = true,
  allowDetails = false,
}: {
  view: "board" | "trends" | "details";
  year: number;
  years: number[];
  period: ReportingCycleOption;
  periods: ReportingCycleOption[];
  plans: ReportingPlanContext[];
  plan: ReportingPlanContext;
  allowTrends?: boolean;
  allowDetails?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /** Implements the navigate operation. */
  function navigate(
    nextView: "board" | "trends" | "details",
    nextYear: number,
    nextPeriod: string,
    nextPlanId: number | null = plan.lifecycleState === "archived"
      ? plan.id
      : null,
  ) {
    const params = new URLSearchParams({
      view: nextView,
      year: String(nextYear),
      period: nextPeriod,
    });
    if (nextPlanId !== null) params.set("plan", String(nextPlanId));
    startTransition(() => router.replace(`/reports?${params.toString()}`));
  }

  /** Opens a new request-scoped plan context without retaining stale filters. */
  function navigateToPlan(value: string) {
    const params = new URLSearchParams({ view: "board" });
    if (value !== "active") params.set("plan", value);
    startTransition(() => router.replace(`/reports?${params.toString()}`));
  }

  return (
    <div
      className="mb-8 flex flex-wrap gap-4 border-b border-ink-200 pb-6"
      aria-busy={isPending}
    >
      <FormField label="Viewing plan" htmlFor="report-plan" className="w-full sm:w-72">
        <Select
          id="report-plan"
          value={plan.lifecycleState === "active" ? "active" : String(plan.id)}
          disabled={isPending}
          onChange={(event) => navigateToPlan(event.target.value)}
        >
          <optgroup label="Active">
            {plans
              .filter((option) => option.lifecycleState === "active")
              .map((option) => (
                <option key={option.id} value="active">
                  {option.name} ({option.startYear}–{option.endYear})
                </option>
              ))}
          </optgroup>
          {plans.some((option) => option.lifecycleState === "archived") ? (
            <optgroup label="Archived">
              {plans
                .filter((option) => option.lifecycleState === "archived")
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.startYear}–{option.endYear})
                  </option>
                ))}
            </optgroup>
          ) : null}
        </Select>
      </FormField>
      <FormField label="Report" htmlFor="report-view" className="w-full sm:w-56">
        <Select
          id="report-view"
          value={view}
          disabled={isPending}
          onChange={(event) => navigate(
            event.target.value as "board" | "trends" | "details",
            year,
            period.value,
          )}
        >
          <option value="board">Board Report</option>
          {allowTrends ? <option value="trends">Trends</option> : null}
          {allowDetails ? (
            <option value="details">Plan details</option>
          ) : null}
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
