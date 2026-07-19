"use client";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** Renders the input interface. */
export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn("input", className)}
      {...props}
    />
  );
}
