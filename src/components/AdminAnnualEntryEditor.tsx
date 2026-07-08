"use client";

import { Save, Trash2 } from "lucide-react";
import { Button, Card, IconButton, Input } from "@/components/ui";
import { formatValue } from "@/lib/analytics";
import type { AdminEntryDraft, AdminEntryDraftPatch } from "@/features/metrics";
import type { KPIWithCategory } from "@/lib/types";

interface AdminAnnualEntryEditorProps {
  draft: AdminEntryDraft | undefined;
  kpi: KPIWithCategory;
  year: number;
  onChange: (patch: AdminEntryDraftPatch) => void;
  onSave: () => void;
  onClear: () => void;
}

export function AdminAnnualEntryEditor({
  draft,
  kpi,
  year,
  onChange,
  onSave,
  onClear,
}: AdminAnnualEntryEditorProps) {
  return (
    <Card className="max-w-2xl p-5 lg:p-6">
      <h2 className="text-xl font-semibold text-ink-900">{kpi.name}</h2>
      <p className="mb-5 mt-1 text-sm text-ink-500">
        Annual metric · {year} · {kpi.unit} ({kpi.unit_type})
      </p>
      {!draft ? (
        <p className="text-sm text-ink-500">No draft.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              className="tabular max-w-[240px]"
              inputMode="decimal"
              placeholder={`Enter ${year} value`}
              value={draft.value}
              onChange={(event) => onChange({ value: event.target.value })}
            />
            <span className="text-xs text-ink-400">{kpi.unit}</span>
            {draft.saved !== null ? (
              <span className="text-xs text-ink-400 tabular">
                saved {formatValue(draft.saved, kpi.unit_type)}
              </span>
            ) : null}
          </div>
          <Input
            className="text-sm"
            placeholder="Notes (optional)"
            value={draft.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
          />
          <div className="flex items-center gap-2">
            <Button
              variant={draft.dirty ? "primary" : "secondary"}
              size="sm"
              onClick={onSave}
              isLoading={draft.saving}
              icon={Save}
              disabled={!draft.dirty}
            >
              Save {year} value
            </Button>
            <IconButton
              icon={Trash2}
              label={`Clear ${year} value`}
              variant="danger"
              size="sm"
              onClick={onClear}
              disabled={draft.saved === null}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
