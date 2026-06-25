"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Button } from "@/components/ui";

interface Props {
  targetId: string;
  fileName?: string;
}

export function ExportPDFButton({ targetId, fileName = "eastern-state-kpi.pdf" }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    const target = document.getElementById(targetId);
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const sections = Array.from(target.querySelectorAll<HTMLElement>("section, header, footer")) as HTMLElement[];
      const blocks = sections.length ? sections : [target];

      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const pageBackground =
        getComputedStyle(document.documentElement).getPropertyValue("--color-page").trim() || "white";

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const canvas = await html2canvas(block, {
          scale: 2,
          backgroundColor: pageBackground,
          logging: false,
          useCORS: true,
          windowWidth: block.scrollWidth,
          windowHeight: block.scrollHeight,
        });
        const imgData = canvas.toDataURL("image/png");
        const imgWidth = pageWidth - margin * 2;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (i > 0) pdf.addPage();
        if (imgHeight <= pageHeight - margin * 2) {
          pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
        } else {
          let remaining = imgHeight;
          let yOffset = 0;
          const pageContent = pageHeight - margin * 2;
          while (remaining > 0) {
            const sliceHeight = Math.min(pageContent, remaining);
            const sliceCanvas = document.createElement("canvas");
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = (sliceHeight / imgWidth) * canvas.width;
            const ctx = sliceCanvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(
                canvas,
                0,
                yOffset,
                canvas.width,
                sliceCanvas.height,
                0,
                0,
                canvas.width,
                sliceCanvas.height,
              );
              pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, margin, imgWidth, sliceHeight);
            }
            remaining -= sliceHeight;
            yOffset += sliceCanvas.height;
            if (remaining > 0) pdf.addPage();
          }
        }
      }
      pdf.save(fileName);
    } catch (err) {
      console.error("PDF export failed", err);
      setError("Export failed. Use Print → Save as PDF.");
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
        aria-label="Export current dashboard view as PDF"
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
    </div>
  );
}
