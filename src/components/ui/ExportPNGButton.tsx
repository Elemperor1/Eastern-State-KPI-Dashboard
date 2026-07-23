"use client";

import { useState } from "react";
import { ImageDown, Loader2 } from "lucide-react";
import { Button } from "./Button";
import {
  getPageBackground,
  prepareRasterExportTarget,
  resolveRasterCaptureScale,
} from "@/features/exports/dom-capture";

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
  fileName = "strategic-plan-report.png",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  /** Runs the handle export workflow. */
  async function handleExport() {
    const target = document.getElementById(targetId);
    if (!target) return;
    setBusy(true);
    setError(null);
    setStatus("Preparing PNG export.");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const restoreTarget = prepareRasterExportTarget(target);
      try {
        const width = target.scrollWidth;
        const height = target.scrollHeight;
        const scale = resolveRasterCaptureScale({
          width,
          height,
          preferredScale: 2,
        });
        const canvas = await html2canvas(target, {
          scale,
          backgroundColor: getPageBackground(),
          logging: false,
          useCORS: true,
          // `width`/`height` define the complete output crop. Do not set
          // `windowHeight` to a tall report's height: html2canvas uses that
          // value for its hidden clone iframe before output scaling applies.
          width,
          height,
          windowWidth: width,
        });
        if (canvas.width <= 0 || canvas.height <= 0) {
          throw new Error("The PNG renderer produced an empty canvas.");
        }
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => {
            if (result && result.size > 0) resolve(result);
            else reject(new Error("The PNG renderer produced an empty file."));
          }, "image/png");
        });
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = fileName;
        a.rel = "noopener";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        setStatus("PNG export ready. Download started.");
      } finally {
        restoreTarget();
      }
    } catch (err) {
      console.error("PNG export failed", err);
      setError("PNG export failed. Try Print → Save as PDF.");
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
        icon={busy ? Loader2 : ImageDown}
        aria-label="Export current view as PNG image"
        aria-controls={targetId}
      >
        {busy ? "Exporting" : "Export PNG"}
      </Button>
      {error ? (
        <div
          role="alert"
          className="absolute right-0 top-[calc(100%+8px)] z-20 w-64 rounded-lg bg-(--color-danger-bg) px-3 py-2 text-xs normal-case leading-5 tracking-normal text-(--color-danger-text) shadow-floating"
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
