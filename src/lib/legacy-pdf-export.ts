/**
 * Legacy raster PDF export, extracted into its own module so it can be
 * dynamic-imported and stay out of the initial page bundle.
 *
 * This module pulls in html2canvas (~200 KB) + jspdf (~350 KB). Importers
 * MUST use `await import("@/lib/legacy-pdf-export")` rather than a static
 * import so webpack can code-split it.
 */

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export interface ExportPdfOptions {
  /** id of the element to rasterize. */
  targetId: string;
  /** Suggested output filename. */
  fileName?: string;
}

/**
 * Render the given DOM subtree to a multi-page PDF by rasterizing each
 * `section / header / footer` (or the whole target if none) with
 * html2canvas and stitching the canvases into a jsPDF document.
 */
export async function exportElementToPdf({
  targetId,
  fileName = "eastern-state-kpi.pdf",
}: ExportPdfOptions): Promise<void> {
  const target = document.getElementById(targetId);
  if (!target) {
    throw new Error(`Export target #${targetId} not found.`);
  }

  const sections = Array.from(
    target.querySelectorAll<HTMLElement>("section, header, footer"),
  );
  const blocks = sections.length ? sections : [target];

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const pageBackground =
    getComputedStyle(document.documentElement).getPropertyValue("--color-page").trim() ||
    "white";

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
}
