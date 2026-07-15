"use client";

import { Children, cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils";

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, hint, children, className, ...props }: FormFieldProps) {
  const hintId = hint && htmlFor ? `${htmlFor}-hint` : undefined;
  const describedChildren = hintId
    ? Children.map(children, (child) => {
        if (!isValidElement<{ id?: string; "aria-describedby"?: string }>(child)) {
          return child;
        }
        if (child.props.id !== htmlFor) return child;
        const describedBy = [child.props["aria-describedby"], hintId]
          .filter(Boolean)
          .join(" ");
        return cloneElement(child, { "aria-describedby": describedBy });
      })
    : children;

  return (
    <div className={cn("min-w-[140px]", className)} {...props}>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {describedChildren}
      {hint ? <p id={hintId} className="text-xs text-ink-500 mt-1.5">{hint}</p> : null}
    </div>
  );
}
