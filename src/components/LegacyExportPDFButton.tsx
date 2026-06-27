"use client";

/**
 * Lazy wrapper around the html2canvas + jspdf based {@link ExportPDFButton}.
 *
 * For metric and category pages this is gated behind `?legacy=1` (the
 * primary export paths are now CSV + browser Print → Save as PDF, neither of
 * which requires any extra client JS beyond `lucide-react`).
 *
 * The underlying {@link ExportPDFButton} already dynamic-imports its heavy
 * dependencies on click, so this wrapper just decides whether to render
 * itself based on the URL flag and forwards props.
 */

import { ExportPDFButton } from "./ExportPDFButton";

interface LegacyExportPDFButtonProps {
  targetId: string;
  fileName?: string;
}

/**
 * Render a legacy PDF export button only when `?legacy=1` is present in the
 * current URL. Returns `null` otherwise so the page bundle stays small.
 */
export function LegacyExportPDFButton({ targetId, fileName }: LegacyExportPDFButtonProps) {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("legacy") !== "1") return null;
  return <ExportPDFButton targetId={targetId} fileName={fileName} />;
}
