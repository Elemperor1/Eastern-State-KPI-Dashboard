"use client";

import { useState } from "react";
import { ImageDown, Loader2 } from "lucide-react";
import { Button } from "./Button";
import {
  showExportOnly,
  getPageBackground,
  hideActionsForExport,
} from "@/lib/export-helpers";

interface Props {
  targetId: string;
  fileName?: string;
}

/**
 * Lazy PNG export button. On click, dynamically imports html2canvas,
 * temporarily reveals the `.export-only` report header/footer inside the
 * target, captures a high-resolution PNG snapshot, and downloads it.
 *
 * The report chrome (brand bar, filter chips, footer) is hidden on screen
 * via `.export-only { display: none }` and only flipped to `block` for the
 * duration of the capture, so the user never sees a flash.
 */
export function ExportPNGButton({
  targetId,
  fileName = "eastern-state-kpi.png",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    const target = document.getElementById(targetId);
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const restoreExport = showExportOnly(target);
      const restoreActions = hideActionsForExport(target);
      try {
        const canvas = await html2canvas(target, {
          scale: 2,
          backgroundColor: getPageBackground(),
          logging: false,
          useCORS: true,
          windowWidth: target.scrollWidth,
          windowHeight: target.scrollHeight,
        });
        const dataUrl = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = fileName;
        a.rel = "noopener";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        restoreExport();
        restoreActions();
      }
    } catch (err) {
      console.error("PNG export failed", err);
      setError("PNG export failed. Try Print → Save as PNG.");
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
        icon={busy ? Loader2 : ImageDown}
        aria-label="Export current view as PNG image"
      >
        {busy ? "Exporting" : "Export PNG"}
      </Button>
      {error ? (
        <div
          role="alert"
          className="absolute right-0 top-[calc(100%+8px)] z-20 w-64 rounded-lg bg-[var(--color-danger-bg)] px-3 py-2 text-xs normal-case leading-5 tracking-normal text-[var(--color-danger-text)] shadow-floating"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}