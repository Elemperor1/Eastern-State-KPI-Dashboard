"use client";

import { Calendar, Layers } from "lucide-react";
import { FormField, Select } from "@/components/ui";
import { MONTH_LABELS } from "@/lib/analytics";

export interface CompareState {
  currentYear: number;
  compareYear: number;
  currentMonth: number;
}

export function DashboardControls({
  state,
  availableYears,
  onChange,
  allowMonth = true,
}: {
  state: CompareState;
  availableYears: number[];
  onChange: (next: Partial<CompareState>) => void;
  allowMonth?: boolean;
}) {
  const otherYears = availableYears.filter((y) => y !== state.currentYear);

  return (
    <div className="flex flex-wrap items-end gap-4 mb-8 no-print">
      <FormField
        htmlFor="currentYear"
        label={
          <>
            <Calendar className="inline w-3 h-3 mr-1 -mt-0.5" aria-hidden />
            Current year
          </>
        }
      >
        <Select
          id="currentYear"
          value={state.currentYear}
          onChange={(e) => onChange({ currentYear: Number(e.target.value) })}
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
      </FormField>

      <FormField htmlFor="compareYear" label="Compare against">
        <Select
          id="compareYear"
          value={state.compareYear}
          onChange={(e) => onChange({ compareYear: Number(e.target.value) })}
        >
          {otherYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
      </FormField>

      {allowMonth ? (
        <FormField
          htmlFor="currentMonth"
          label={
            <>
              <Layers className="inline w-3 h-3 mr-1 -mt-0.5" aria-hidden />
              Through month
            </>
          }
        >
          <Select
            id="currentMonth"
            value={state.currentMonth}
            onChange={(e) => onChange({ currentMonth: Number(e.target.value) })}
          >
            {MONTH_LABELS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </Select>
        </FormField>
      ) : null}
    </div>
  );
}
