"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface Props {
  targetId: string;
  fileName?: string;
}

export function ExportPDFButton({ targetId, fileName = "eastern-state-kpi.pdf" }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    const target = document.getElementById(targetId);
    if (!target) return;
    setBusy(true);
    try {
      // Render each direct child to its own page so tall content doesn't get clipped.
      const sections = Array.from(target.querySelectorAll<HTMLElement>("section, header, footer")) as HTMLElement[];
      const blocks = sections.length ? sections : [target];

      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const canvas = await html2canvas(block, {
          scale: 2,
          backgroundColor: "#f8fafc",
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
          // Tile the image across multiple pages if very tall.
          let remaining = imgHeight;
          let yOffset = 0;
          const pageContent = pageHeight - margin * 2;
          while (remaining > 0) {
            const sliceHeight = Math.min(pageContent, remaining);
            // Create a slice canvas.
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
      alert("Could not export PDF. Please try again or use your browser's Print → Save as PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={busy}
      className="btn-secondary"
      aria-label="Export current dashboard view as PDF"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      {busy ? "Exporting…" : "Export PDF"}
    </button>
  );
}
