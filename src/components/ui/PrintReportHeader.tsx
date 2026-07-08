"use client";

import { cn } from "@/lib/utils";

/**
 * A professional report header for print, PDF, and PNG exports.
 *
 * Hidden on screen (`export-only`); visible only when the page is printed
 * or rasterized. It renders the Eastern State brand bar, a report title,
 * the active filter context (years, month, category/metric), and the
 * generated date so a printed page is self-describing and board-ready.
 */
export interface PrintReportHeaderProps {
  /** The report title, e.g. "Organizational Performance" or the KPI name. */
  title: string;
  /** Optional eyebrow label above the title, e.g. the category name. */
  eyebrow?: string;
  /** Optional subtitle line, e.g. the KPI description. */
  subtitle?: string | null;
  /**
   * Active filter chips to display. Pass objects with `label` and `value`
   * so the printed output shows exactly what the user had selected.
   */
  filters?: { label: string; value: string }[];
  className?: string;
}

export function PrintReportHeader({
  title,
  eyebrow,
  subtitle,
  filters,
  className,
}: PrintReportHeaderProps) {
  const generated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header
      className={cn("export-only print-report-header", className)}
      data-pdf-keep-together
    >
      {/* Brand bar — the navy→teal gradient strip with the org name. */}
      <div className="print-report-brand-bar">
        <div className="print-report-brand-text">
          <span className="print-report-brand-name">Eastern State Penitentiary</span>
          <span className="print-report-brand-sub">KPI Intelligence Dashboard</span>
        </div>
        <span className="print-report-date" suppressHydrationWarning>
          Generated {generated}
        </span>
      </div>

      {/* Title block */}
      <div className="print-report-title-block">
        {eyebrow ? <p className="print-report-eyebrow">{eyebrow}</p> : null}
        <h1 className="print-report-title">{title}</h1>
        {subtitle ? <p className="print-report-subtitle">{subtitle}</p> : null}
      </div>

      {/* Filter context chips */}
      {filters && filters.length > 0 ? (
        <div className="print-report-filters">
          {filters.map((f, i) => (
            <span key={i} className="print-report-filter-chip">
              <span className="print-report-filter-label">{f.label}:</span>{" "}
              <span className="print-report-filter-value">{f.value}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="print-report-divider" />
    </header>
  );
}
