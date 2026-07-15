"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  targetId: string;
  fileName?: string;
}

/**
 * Lazy PDF export button. The html2canvas + jspdf code lives in
 * `@/features/exports/legacy-pdf-export` and is loaded on first click via a dynamic
 * `import()` so it stays out of the initial page bundle.
 *
 * Reports also expose browser-native print. This explicit download remains for
 * people who need a ready-to-share raster PDF without using the print dialog.
 */
export function ExportPDFButton({ targetId, fileName = "eastern-state-kpi.pdf" }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function handleExport() {
    const target = document.getElementById(targetId);
    if (!target) return;
    setBusy(true);
    setError(null);
    setStatus("Preparing PDF export.");
    try {
      const mod = await import("@/features/exports/legacy-pdf-export");
      await mod.exportElementToPdf({ targetId, fileName });
      setStatus("PDF export ready. Download started.");
    } catch (err) {
      console.error("PDF export failed", err);
      setError("Export failed. Use Print → Save as PDF.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <Button
        variant="secondary"
        onClick={handleExport}
        isLoading={busy}
        icon={busy ? Loader2 : Download}
        aria-label="Export current report as PDF"
        aria-controls={targetId}
      >
        {busy ? "Exporting" : "Export PDF"}
      </Button>
      {error ? (
        <div
          role="alert"
          className="absolute right-0 top-[calc(100%+8px)] z-20 w-64 rounded-lg bg-[var(--color-danger-bg)] px-3 py-2 text-xs normal-case leading-5 tracking-normal text-[var(--color-danger-text)] shadow-floating"
        >
          {error}
        </div>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {status}
      </span>
    </div>
  );
}
