"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  SearchX,
} from "lucide-react";
import { Badge, Card, EmptyState, Table } from "@/components/ui";
import {
  formatConfigurationGapDate,
  getConfigurationGapKindLabel,
  getConfigurationGapKinds,
  getConfigurationGapStatusLabel,
  type ConfigurationGapRowViewModel,
  type ConfigurationGapStatus,
} from "./configuration-gap-model";

interface ConfigurationGapTableProps {
  rows: ConfigurationGapRowViewModel[];
  totalRows: number;
  reportingYear: number;
  hasActiveFilters: boolean;
  loadFailed?: boolean;
}

function statusVariant(
  status: ConfigurationGapStatus,
): "default" | "success" | "error" | "warning" | "info" {
  if (status === "active") return "success";
  if (status === "ready") return "info";
  if (status === "needs_definition") return "error";
  if (status === "needs_target") return "warning";
  return "default";
}

function displayLabel(value: string | null): string {
  if (!value?.trim()) return "Not recorded";
  return value
    .trim()
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toLocaleUpperCase());
}

export function ConfigurationGapTable({
  rows,
  totalRows,
  reportingYear,
  hasActiveFilters,
  loadFailed = false,
}: ConfigurationGapTableProps) {
  return (
    <Card as="section" className="overflow-hidden" aria-labelledby="configuration-gap-table-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 p-5 lg:px-6">
        <div>
          <h2 id="configuration-gap-table-title" className="text-xl font-semibold text-ink-900">
            Configuration gaps
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Read-only review for reporting year {reportingYear}.
          </p>
        </div>
        <Badge
          variant={loadFailed ? "error" : rows.length > 0 ? "warning" : "success"}
        >
          {loadFailed ? "Unavailable" : `${rows.length} shown`}
        </Badge>
      </div>

      {rows.length === 0 ? (
        <div className="min-h-72 py-12" role="status" aria-live="polite">
          {loadFailed ? (
            <EmptyState
              icon={CircleAlert}
              title="Configuration gaps are unavailable"
              description="The reporting data could not be loaded. No readiness conclusion has been made."
            />
          ) : hasActiveFilters ? (
            <EmptyState
              icon={SearchX}
              title="No gaps match these filters"
              description={`Try clearing a filter to review all ${totalRows} configuration gaps.`}
            />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="No configuration gaps"
              description="No unresolved KPI configuration gaps were reported for this year."
            />
          )}
        </div>
      ) : (
        <Table minWidth="1180px">
          <caption className="sr-only">
            KPI configuration gaps for reporting year {reportingYear}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">KPI</th>
              <th scope="col" className="text-left">Status</th>
              <th scope="col" className="text-left">Missing configuration</th>
              <th scope="col" className="text-left">Unresolved question</th>
              <th scope="col" className="text-left">Owner and due date</th>
              <th scope="col" className="text-left">Last reviewed</th>
              <th scope="col" className="text-left">KPI editor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const gaps = getConfigurationGapKinds(row);
              return (
                <tr key={row.id} className="align-top transition-colors hover:bg-ink-50/70">
                  <td>
                    <p className="font-semibold text-ink-900">{row.kpiName}</p>
                    <p className="mt-1 text-xs text-ink-600">{row.priorityName}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{row.goalName}</p>
                  </td>
                  <td>
                    <Badge variant={statusVariant(row.configurationStatus)}>
                      {getConfigurationGapStatusLabel(row.configurationStatus)}
                    </Badge>
                    <p className="mt-2 text-xs text-ink-500">
                      {displayLabel(row.reportingFrequency)}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-ink-500">
                      {row.targetYears.length > 0
                        ? `Targets: ${row.targetYears.join(", ")}`
                        : "No target year recorded"}
                    </p>
                  </td>
                  <td>
                    <div className="flex max-w-xs flex-wrap gap-1.5">
                      {gaps.map((gap) => (
                        <Badge
                          key={gap}
                          variant={gap === "unresolved_question" ? "error" : "warning"}
                        >
                          {getConfigurationGapKindLabel(gap)}
                        </Badge>
                      ))}
                      {gaps.length === 0 ? (
                        <Badge variant="default">Configuration status</Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-xs text-sm leading-6 text-ink-700">
                    {row.unresolvedQuestion?.trim() || (
                      <span className="text-ink-400">No question recorded</span>
                    )}
                  </td>
                  <td className="text-sm text-ink-700">
                    <p>{row.owner?.trim() || "Unassigned"}</p>
                    <p className="mt-1 text-xs tabular-nums text-ink-500">
                      Due {formatConfigurationGapDate(row.dueDate)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap text-xs tabular-nums text-ink-500">
                    {formatConfigurationGapDate(row.lastReviewedDate)}
                  </td>
                  <td>
                    <Link
                      href={row.editorHref}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-800 hover:underline"
                      aria-label={`Open KPI editor for ${row.kpiName}`}
                    >
                      Open editor
                      <ArrowUpRight className="size-4" aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
