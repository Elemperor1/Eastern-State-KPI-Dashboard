"use client";

import { cn } from "@/lib/utils";

/**
 * A professional report footer for print, PDF, and PNG exports.
 *
 * Hidden on screen (`export-only`); visible only when the page is printed
 * or rasterized. It renders a thin rule, a confidentiality notice, and
 * the generated timestamp.
 */
export interface PrintReportFooterProps {
  /** Optional override of the confidentiality notice. */
  notice?: string;
  className?: string;
}

export function PrintReportFooter({
  notice = "Internal — Eastern State Penitentiary Historic Site · For internal use only",
  className,
}: PrintReportFooterProps) {
  const generated = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <footer
      className={cn("export-only print-report-footer", className)}
      data-pdf-keep-together
      data-raster-export-text
    >
      <div className="print-report-footer-rule" />
      <div className="print-report-footer-row">
        <span className="print-report-footer-notice">{notice}</span>
        <span className="print-report-footer-timestamp" suppressHydrationWarning>
          Generated {generated}
        </span>
      </div>
    </footer>
  );
}
