"use client";

/**
 * Lazy wrapper around the html2canvas + jspdf based {@link ExportPDFButton}.
 *
 * For metric and category pages the server page parses `?legacy=1` and passes
 * the result as `enabled`. The server-provided flag keeps the initial HTML and
 * hydrated client tree identical.
 *
 * The underlying {@link ExportPDFButton} already dynamic-imports its heavy
 * dependencies on click, so this wrapper just decides whether to render
 * itself based on the URL flag and forwards props.
 */

import { ExportPDFButton } from "./ExportPDFButton";

interface LegacyExportPDFButtonProps {
  targetId: string;
  fileName?: string;
  enabled: boolean;
}

/**
 * Render the legacy PDF export button only when the server-approved URL flag
 * is enabled. Returns `null` otherwise so the page bundle stays small.
 */
export function LegacyExportPDFButton({
  targetId,
  fileName,
  enabled,
}: LegacyExportPDFButtonProps) {
  if (!enabled) return null;
  return <ExportPDFButton targetId={targetId} fileName={fileName} />;
}
