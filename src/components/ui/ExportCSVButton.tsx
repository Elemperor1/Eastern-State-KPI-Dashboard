"use client";

import { useCallback, useId, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "./Button";
import { buildCSV, ensureCsvExt, inferColumns } from "./csv-helpers";

export interface ExportCSVButtonProps {
  /** Rows to serialize. Each object's own enumerable keys become the columns. */
  rows: Record<string, unknown>[];
  /** Suggested filename (the browser will sanitize it; .csv is appended if missing). */
  filename: string;
  /**
   * Optional explicit column order. Defaults to the union of keys, in first-seen order.
   * Use this when you want stable column ordering or to drop internal columns.
   */
  columns?: string[];
  /** Optional label override; defaults to "Export CSV". */
  label?: string;
  /** Size variant forwarded to Button. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Generic CSV export trigger. Generates a CSV blob from `rows` and downloads
 * it via a hidden <a download>. Prepends a UTF-8 BOM so Excel opens it cleanly.
 */
export function ExportCSVButton({
  rows,
  filename,
  columns,
  label = "Export CSV",
  size = "md",
  className,
}: ExportCSVButtonProps) {
  const statusId = useId();
  const [announcement, setAnnouncement] = useState({ message: "", sequence: 0 });
  const handleClick = useCallback(() => {
    if (typeof document === "undefined") return;
    const cols = columns ?? inferColumns(rows);
    const csv = buildCSV(rows ?? [], cols);
    // BOM helps Excel detect UTF-8; harmless for other parsers.
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ensureCsvExt(filename);
    a.rel = "noopener";
    // Hide it; some browsers ignore download= on visible anchors.
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke on next tick so the click has time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setAnnouncement((current) => ({
      message: "CSV export ready. Download started.",
      sequence: current.sequence + 1,
    }));
  }, [rows, columns, filename]);

  return (
    <>
    <Button
      type="button"
      variant="secondary"
      size={size}
      icon={Download}
      onClick={handleClick}
      aria-label={`Download ${ensureCsvExt(filename)}`}
      aria-describedby={statusId}
      className={className}
    >
      {label}
    </Button>
    <span id={statusId} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement.sequence > 0 ? (
        <span
          key={announcement.sequence}
          data-announcement-sequence={announcement.sequence}
        >
          {announcement.message}
        </span>
      ) : null}
    </span>
    </>
  );
}
