"use client";

import { History } from "lucide-react";
import { Badge, Card, Chip, EmptyState, Table } from "@/components/ui";
import {
  describeAdminHistoryPeriod,
  formatAdminHistoryChangedAt,
  formatAdminHistoryValue,
  getAdminHistoryActorLabel,
  getAdminHistoryCategoryLabel,
  getAdminHistoryChangeLabel,
  getAdminHistoryEntryTypeLabel,
  getAdminHistoryKpiLabel,
} from "@/features/audit/admin-history";
import type { EntryHistoryWithMeta } from "@/lib/types";

interface AdminHistoryTableProps {
  history: EntryHistoryWithMeta[];
}

export function AdminHistoryTable({ history }: AdminHistoryTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-100 p-5">
        <h2 className="text-xl font-semibold text-ink-900">Activity</h2>
        <p className="mt-1 text-sm text-ink-500">Most recent first.</p>
      </div>
      {history.length === 0 ? (
        <EmptyState
          icon={History}
          title="No history yet"
          description="Once someone edits a KPI entry, every before/after change will appear here."
        />
      ) : (
        <Table minWidth="900px">
          <thead>
            <tr>
              <th scope="col" className="text-left">When</th>
              <th scope="col" className="text-left">KPI</th>
              <th scope="col" className="text-left">Period</th>
              <th scope="col" className="text-left">Change</th>
              <th scope="col" className="text-left">By</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.id} className="align-top transition-colors hover:bg-ink-50/70">
                <td className="whitespace-nowrap text-xs text-ink-500">
                  {formatAdminHistoryChangedAt(row.changed_at)}
                </td>
                <td>
                  <div className="font-medium text-ink-900">
                    {row.kpi_name ? getAdminHistoryKpiLabel(row) : (
                      <span className="text-ink-400">{getAdminHistoryKpiLabel(row)}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="default">{getAdminHistoryEntryTypeLabel(row)}</Badge>
                    <Chip>{getAdminHistoryCategoryLabel(row)}</Chip>
                    {row.metadata_deleted ? (
                      <Badge variant="error">Metadata deleted</Badge>
                    ) : row.metadata_renamed ? (
                      <Badge variant="warning" title="The KPI has been renamed since this change. The label shown is the historical one.">
                        Renamed
                        {row.kpi_current_name ? ` → ${row.kpi_current_name}` : ""}
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="text-sm tabular text-ink-700">
                  <div>{row.year}</div>
                  <div className="text-xs text-ink-500">{describeAdminHistoryPeriod(row)}</div>
                </td>
                <td className="text-sm">
                  <div className="flex items-center gap-2 tabular">
                    <span className="text-ink-500 line-through">{formatAdminHistoryValue(row.prev_value)}</span>
                    <span className="text-ink-400">→</span>
                    <span className="font-medium text-ink-900">{formatAdminHistoryValue(row.new_value)}</span>
                  </div>
                  <HistoryChangeBadge label={getAdminHistoryChangeLabel(row)} />
                </td>
                <td className="text-xs text-ink-700">
                  {row.changed_by_email ? getAdminHistoryActorLabel(row) : (
                    <span className="text-ink-400">{getAdminHistoryActorLabel(row)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function HistoryChangeBadge({ label }: { label: "Created" | "Updated" | "Deleted" }) {
  if (label === "Deleted") {
    return <Badge variant="error" className="mt-1">Deleted</Badge>;
  }
  if (label === "Updated") {
    return <Badge variant="info" className="mt-1">Updated</Badge>;
  }
  return <Badge variant="default" className="mt-1">Created</Badge>;
}
