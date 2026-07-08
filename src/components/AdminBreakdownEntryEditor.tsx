"use client";

import { FileSpreadsheet, Save, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, IconButton, Input, Select } from "@/components/ui";
import { MONTH_LABELS } from "@/features/metrics";
import { cn } from "@/lib/utils";
import type { AdminBreakdownDraft } from "@/features/metrics";
import type { KPIWithCategory } from "@/lib/types";

type BreakdownDraftPatch = Partial<Omit<AdminBreakdownDraft, "savedValue" | "dirty" | "saving">>;

interface AdminBreakdownEntryEditorProps {
  drafts: AdminBreakdownDraft[];
  kpi: KPIWithCategory;
  selectedBreakdownIsMonthly: boolean;
  selectedBreakdownPeriod: string;
  breakdownMonth: number;
  onBreakdownMonthChange: (month: number) => void;
  onAddRow: () => void;
  onChangeRow: (index: number, patch: BreakdownDraftPatch) => void;
  onSaveRow: (index: number) => void;
  onDeleteRow: (index: number) => void;
}

export function AdminBreakdownEntryEditor({
  drafts,
  kpi,
  selectedBreakdownIsMonthly,
  selectedBreakdownPeriod,
  breakdownMonth,
  onBreakdownMonthChange,
  onAddRow,
  onChangeRow,
  onSaveRow,
  onDeleteRow,
}: AdminBreakdownEntryEditorProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 p-5">
        <div>
          <h2 className="text-xl font-semibold text-ink-900">{kpi.name}</h2>
          <p className="mt-1 text-sm text-ink-500">
            Breakdown · {selectedBreakdownPeriod} · {kpi.unit}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedBreakdownIsMonthly ? (
            <div className="min-w-[120px]">
              <Select
                id="admin-breakdown-month"
                aria-label="Breakdown month"
                value={breakdownMonth}
                onChange={(event) => onBreakdownMonthChange(Number(event.target.value))}
              >
                {MONTH_LABELS.map((monthLabel, index) => (
                  <option key={monthLabel} value={index + 1}>{monthLabel}</option>
                ))}
              </Select>
            </div>
          ) : null}
          <Button variant="secondary" size="sm" onClick={onAddRow}>Add row</Button>
        </div>
      </div>
      <div>
        {drafts.map((draft, index) => (
          <div
            key={draft.id ?? `new-${index}`}
            className={cn(
              "grid grid-cols-1 items-center gap-3 border-b border-ink-100 p-4 last:border-b-0 md:grid-cols-[minmax(180px,1fr)_140px_minmax(180px,1fr)_auto]",
              draft.dirty && "bg-brand-50/50 shadow-[inset_3px_0_0_var(--color-primary)]",
            )}
          >
            <Input
              placeholder="Label (e.g. Foundation funders)"
              value={draft.label}
              onChange={(event) => onChangeRow(index, { label: event.target.value })}
            />
            <Input
              className="tabular"
              inputMode="decimal"
              placeholder="Value"
              value={draft.value}
              onChange={(event) => onChangeRow(index, { value: event.target.value })}
            />
            <Input
              placeholder="Notes (optional)"
              value={draft.notes}
              onChange={(event) => onChangeRow(index, { notes: event.target.value })}
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant={draft.dirty ? "primary" : "secondary"}
                size="sm"
                onClick={() => onSaveRow(index)}
                isLoading={draft.saving}
                icon={Save}
                disabled={!draft.dirty}
              >
                Save
              </Button>
              <IconButton
                icon={Trash2}
                label={`Delete ${draft.label || "row"}`}
                variant="danger"
                size="sm"
                onClick={() => onDeleteRow(index)}
              />
            </div>
          </div>
        ))}
        {drafts.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={FileSpreadsheet}
              title={`No breakdown rows for ${selectedBreakdownPeriod}`}
              description="Add the first row to begin entering the composition for this metric."
              action={<Button variant="secondary" onClick={onAddRow}>Add row</Button>}
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
