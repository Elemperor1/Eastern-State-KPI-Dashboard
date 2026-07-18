/**
 * Legacy raster PDF export, extracted into its own module so it can be
 * dynamic-imported and stay out of the initial page bundle.
 *
 * This module pulls in html2canvas (~200 KB) + jspdf (~350 KB). Importers
 * MUST use `await import("@/features/exports/legacy-pdf-export")` rather than a static
 * import so webpack can code-split it.
 *
 * The export temporarily reveals `.export-only` report chrome (brand
 * header, filter chips, footer) inside the target so the PDF includes
 * branding and filter context. The on-screen action buttons
 * (`.no-print`, `[data-page-header-actions]`) are hidden during capture
 * to avoid duplicate controls in the output.
 */

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  getPageBackground,
  prepareRasterExportTarget,
  resolveRasterCaptureScale,
} from "./dom-capture";
import { planRasterPdfPages } from "./raster-layout";

const PREFERRED_RASTER_SCALE = 1.5;
const JPEG_QUALITY = 0.86;

export interface ExportPdfOptions {
  /** id of the element to rasterize. */
  targetId: string;
  /** Suggested output filename. */
  fileName?: string;
}

/**
 * Render the given DOM subtree to a multi-page PDF by rasterizing the
 * complete export root once and slicing it at card boundaries.
 */
export async function exportElementToPdf({
  targetId,
  fileName = "strategic-plan-report.pdf",
}: ExportPdfOptions): Promise<void> {
  const target = document.getElementById(targetId);
  if (!target) {
    throw new Error(`Export target #${targetId} not found.`);
  }

  const restoreTarget = prepareRasterExportTarget(target);

  try {
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "letter",
      compress: true,
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const pageBackground = getPageBackground();
    let targetHeight = target.scrollHeight;
    let keepTogetherRanges: Array<{ start: number; end: number }> = [];
    const width = target.scrollWidth;
    const height = target.scrollHeight;
    const rasterScale = resolveRasterCaptureScale({
      width,
      height,
      preferredScale: PREFERRED_RASTER_SCALE,
    });

    const canvas = await html2canvas(target, {
      scale: rasterScale,
      backgroundColor: pageBackground,
      logging: false,
      useCORS: true,
      // Keep the complete report as the output crop without making the
      // hidden html2canvas clone iframe tens of thousands of pixels tall.
      width,
      height,
      windowWidth: width,
      onclone: (clonedDocument) => {
        const clonedTarget = clonedDocument.getElementById(targetId);
        if (!clonedTarget) return;
        const targetRect = clonedTarget.getBoundingClientRect();
        targetHeight = targetRect.height || clonedTarget.scrollHeight;
        keepTogetherRanges = Array.from(
          clonedTarget.querySelectorAll<HTMLElement>(
            "[data-pdf-keep-together], .surface",
          ),
          (element) => {
            const rect = element.getBoundingClientRect();
            return {
              start: rect.top - targetRect.top,
              end: rect.top + rect.height - targetRect.top,
            };
          },
        ).filter(({ start, end }) => start >= 0 && end > start);
      },
    });
    const sourceScale = targetHeight > 0 ? canvas.height / targetHeight : 1;
    const avoidBreakRanges = keepTogetherRanges.map(({ start, end }) => ({
      start: start * sourceScale,
      end: end * sourceScale,
    }));
    const pages = planRasterPdfPages({
      sourceWidth: canvas.width,
      sourceHeight: canvas.height,
      pageWidth,
      pageHeight,
      margin,
      avoidBreakRanges,
    });

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const page = pages[pageIndex];
      if (pageIndex > 0) pdf.addPage();

      if (pages.length === 1) {
        pdf.addImage(
          canvas.toDataURL("image/jpeg", JPEG_QUALITY),
          "JPEG",
          margin,
          margin,
          page.renderWidth,
          page.renderHeight,
          undefined,
          "FAST",
        );
      } else {
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = page.sourceHeight;
        const ctx = sliceCanvas.getContext("2d");
        if (!ctx) {
          throw new Error("Could not create a PDF page canvas.");
        }
        ctx.drawImage(
          canvas,
          0,
          page.sourceY,
          canvas.width,
          page.sourceHeight,
          0,
          0,
          canvas.width,
          page.sourceHeight,
        );
        pdf.addImage(
          sliceCanvas.toDataURL("image/jpeg", JPEG_QUALITY),
          "JPEG",
          margin,
          margin,
          page.renderWidth,
          page.renderHeight,
          undefined,
          "FAST",
        );
      }
    }
    pdf.save(fileName);
  } finally {
    restoreTarget();
  }
}
