"use client";

import { cn } from "@/lib/utils";

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  minWidth?: string;
}

export function Table({ children, className, minWidth, ...props }: TableProps) {
  return (
    <div className="scroll-hint">
      <table className={cn("data-table", minWidth && `min-w-[${minWidth}]`, className)} {...props}>
        {children}
      </table>
    </div>
  );
}
