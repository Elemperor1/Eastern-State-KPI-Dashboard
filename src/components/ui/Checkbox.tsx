"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "group flex min-h-10 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm text-ink-700",
        "transition-[background-color,color] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-ink-100/70",
        className,
      )}
    >
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
        <input
          id={id}
          type="checkbox"
          className="checkbox-control peer absolute inset-0 m-0 size-5 cursor-pointer appearance-none rounded border border-ink-400 bg-white checked:border-ink-950 checked:bg-ink-950 disabled:cursor-not-allowed disabled:opacity-50"
          {...props}
        />
        <Check className="pointer-events-none relative size-3.5 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-pretty">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-ink-500">{description}</span> : null}
      </span>
    </label>
  );
}
