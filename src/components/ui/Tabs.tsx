"use client";

import { cn } from "@/lib/utils";

export interface TabsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ options, value, onChange, className }: TabsProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex rounded-xl border border-ink-200 bg-white p-1 shadow-sm",
        className,
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-lg transition-[background-color,color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.96]",
              active ? "bg-brand-700 text-white" : "text-ink-700 hover:bg-ink-50",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
