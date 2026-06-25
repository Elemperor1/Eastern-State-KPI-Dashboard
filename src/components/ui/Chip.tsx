"use client";

import { cn } from "@/lib/utils";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function Chip({ children, active, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      className={cn(
        active ? "chip-active" : "chip-inactive",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
