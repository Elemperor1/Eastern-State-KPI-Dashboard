export interface RasterPdfPage {
  sourceY: number;
  sourceHeight: number;
  renderWidth: number;
  renderHeight: number;
}

export interface RasterKeepTogetherRange {
  start: number;
  end: number;
}

export function planRasterPdfPages({
  sourceWidth,
  sourceHeight,
  pageWidth,
  pageHeight,
  margin,
  avoidBreakRanges = [],
}: {
  sourceWidth: number;
  sourceHeight: number;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  avoidBreakRanges?: readonly RasterKeepTogetherRange[];
}): RasterPdfPage[] {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    !Number.isFinite(pageWidth) ||
    !Number.isFinite(pageHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    pageWidth <= 0 ||
    pageHeight <= 0
  ) {
    throw new Error("Raster and PDF dimensions must be positive.");
  }
  if (!Number.isFinite(margin) || margin < 0) {
    throw new Error("PDF margin must be a non-negative number.");
  }

  const renderWidth = pageWidth - margin * 2;
  const pageContentHeight = pageHeight - margin * 2;
  if (renderWidth <= 0 || pageContentHeight <= 0) {
    throw new Error("PDF margin leaves no readable page content.");
  }

  const scale = renderWidth / sourceWidth;
  const maxSourceHeight = Math.floor(pageContentHeight / scale);
  if (maxSourceHeight < 1) {
    throw new Error("PDF page cannot fit one source pixel at this margin.");
  }

  const ranges = avoidBreakRanges.map(({ start, end }) => {
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start
    ) {
      throw new Error("PDF keep-together ranges must have a positive span.");
    }
    return {
      start: Math.max(0, Math.floor(start)),
      end: Math.min(sourceHeight, Math.ceil(end)),
    };
  });

  const pages: RasterPdfPage[] = [];
  for (let sourceY = 0; sourceY < sourceHeight;) {
    const nominalEnd = Math.min(sourceY + maxSourceHeight, sourceHeight);
    const crossingStarts = nominalEnd < sourceHeight
      ? ranges
        .filter(
          (range) =>
            range.start > sourceY &&
            range.start < nominalEnd &&
            range.end > nominalEnd,
        )
        .map((range) => range.start)
      : [];
    const sourceEnd = crossingStarts.length
      ? Math.min(...crossingStarts)
      : nominalEnd;
    const sliceSourceHeight = sourceEnd - sourceY;

    pages.push({
      sourceY,
      sourceHeight: sliceSourceHeight,
      renderWidth,
      renderHeight: sliceSourceHeight * scale,
    });
    sourceY = sourceEnd;
  }
  return pages;
}
