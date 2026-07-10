"use client";

import { cn } from "@/lib/utils";

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, hint, children, className, ...props }: FormFieldProps) {
  return (
    <div className={cn("min-w-[140px]", className)} {...props}>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-500 mt-1.5">{hint}</p> : null}
    </div>
  );
}
