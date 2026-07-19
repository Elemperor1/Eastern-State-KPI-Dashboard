"use client";

import { cn } from "@/lib/utils";

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  minWidth?: string;
}

/** Renders the table interface. */
export function Table({ children, className, minWidth, ...props }: TableProps) {
  return (
    <div className="scroll-hint">
      <table
        className={cn("data-table", className)}
        style={minWidth ? { minWidth } : undefined}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}
