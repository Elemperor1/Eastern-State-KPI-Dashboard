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
        "inline-flex rounded-xl bg-ink-100 p-1",
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
              "tab-button min-h-10 rounded-lg px-4 py-2 text-sm font-medium transition-[scale,background-color,color,box-shadow] duration-150 focus:outline-none active:scale-[0.96]",
              active ? "bg-white text-ink-950 shadow-sm" : "text-ink-600 hover:text-ink-950",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
