"use client";

import { Save, Trash2 } from "lucide-react";
import { Button, Card, IconButton, Input } from "@/components/ui";
import { MONTH_LABELS } from "@/features/metrics";
import { formatValue } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { AdminEntryDraft, AdminEntryDraftPatch } from "@/features/metrics";
import type { KPIWithCategory } from "@/lib/types";

interface AdminMonthlyEntryEditorProps {
  drafts: Record<string, AdminEntryDraft>;
  kpi: KPIWithCategory;
  year: number;
  onChange: (month: number, patch: AdminEntryDraftPatch) => void;
  onSave: (month: number) => void;
  onClear: (month: number) => void;
}

export function AdminMonthlyEntryEditor({
  drafts,
  kpi,
  year,
  onChange,
  onSave,
  onClear,
}: AdminMonthlyEntryEditorProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-100 p-5">
        <h2 className="text-xl font-semibold text-ink-900">{kpi.name}</h2>
        <p className="mt-1 text-sm text-ink-500">
          Monthly metric · {year} · {kpi.unit} ({kpi.unit_type})
        </p>
      </div>
      <div className="hidden grid-cols-[minmax(56px,0.55fr)_minmax(140px,1fr)_minmax(180px,1.5fr)_auto] gap-3 border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500 md:grid">
        <span>Period</span>
        <span>Value</span>
        <span>Notes</span>
        <span className="text-right">Actions</span>
      </div>
      <div>
        {MONTH_LABELS.map((label, index) => {
          const month = index + 1;
          const draft = drafts[String(month)];
          if (!draft) return null;
          return (
            <MonthCell
              key={month}
              label={label}
              draft={draft}
              unit={kpi.unit}
              unitType={kpi.unit_type}
              onChange={(patch) => onChange(month, patch)}
              onSave={() => onSave(month)}
              onClear={() => onClear(month)}
            />
          );
        })}
      </div>
    </Card>
  );
}

function MonthCell({
  label,
  draft,
  unit,
  unitType,
  onChange,
  onSave,
  onClear,
}: {
  label: string;
  draft: AdminEntryDraft;
  unit: string;
  unitType: KPIWithCategory["unit_type"];
  onChange: (patch: AdminEntryDraftPatch) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  return (
    <div className={cn("entry-row", draft.dirty && "entry-row-dirty")}>
      <div>
        <span className="block text-sm font-semibold text-ink-900">{label}</span>
        {draft.saved !== null ? (
          <span className="mt-1 block text-xs tabular text-ink-500">
            Saved {formatValue(draft.saved, unitType)}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          className="min-w-0 flex-1 tabular"
          inputMode="decimal"
          placeholder="0"
          aria-label={`${label} value`}
          value={draft.value}
          onChange={(event) => onChange({ value: event.target.value })}
        />
        <span className="w-14 truncate text-right text-xs text-ink-500">{unit}</span>
      </div>
      <Input
        className="entry-notes text-sm"
        placeholder="Notes…"
        aria-label={`${label} notes`}
        value={draft.notes}
        onChange={(event) => onChange({ notes: event.target.value })}
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          variant={draft.dirty ? "primary" : "secondary"}
          size="sm"
          onClick={onSave}
          isLoading={draft.saving}
          icon={Save}
          disabled={!draft.dirty}
          aria-label={`Save ${label}`}
        >
          Save
        </Button>
        <IconButton
          icon={Trash2}
          label={`Clear ${label}`}
          variant="danger"
          size="sm"
          onClick={onClear}
          disabled={draft.saved === null}
        />
      </div>
    </div>
  );
}
