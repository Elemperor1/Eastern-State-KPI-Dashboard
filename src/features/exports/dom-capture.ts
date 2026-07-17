/**
 * DOM preparation rules for dashboard PNG/PDF raster exports.
 *
 * PNG and legacy PDF exports snapshot the rendered dashboard so they keep
 * the exact values and layout users see on screen. Before capture, the app
 * reveals report-only header/footer chrome and hides interactive controls so
 * downloaded files include context without duplicating action buttons.
 */

export const EXPORT_ONLY_SELECTOR = ".export-only";
export const EXPORT_ACTIONS_SELECTOR = "[data-page-header-actions], .no-print";
export const EXPORT_TEXT_SELECTOR = "[data-raster-export-text]";
export const EXPORT_DEFERRED_SELECTOR = "[data-raster-export-deferred]";
export const EXPORT_MIN_WIDTH_ATTRIBUTE = "data-raster-export-min-width";

/** Conservative canvas limits with headroom below Chromium's 32,767px edge. */
const MAX_RASTER_DIMENSION = 30_000;
const MAX_RASTER_PIXELS = 24_000_000;
const MIN_RASTER_OUTPUT_WIDTH = 512;
const MIN_RASTER_SCALE = 0.25;

export function resolveRasterCaptureScale({
  width,
  height,
  preferredScale,
  minimumOutputWidth = MIN_RASTER_OUTPUT_WIDTH,
  minimumScale = MIN_RASTER_SCALE,
}: {
  width: number;
  height: number;
  preferredScale: number;
  minimumOutputWidth?: number;
  minimumScale?: number;
}): number {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(preferredScale) ||
    !Number.isFinite(minimumOutputWidth) ||
    !Number.isFinite(minimumScale) ||
    width <= 0 ||
    height <= 0 ||
    preferredScale <= 0 ||
    minimumOutputWidth <= 0 ||
    minimumScale <= 0
  ) {
    throw new Error("Raster export dimensions and scales must be positive.");
  }

  const dimensionScale = Math.min(
    MAX_RASTER_DIMENSION / width,
    MAX_RASTER_DIMENSION / height,
  );
  const pixelScale = Math.sqrt(MAX_RASTER_PIXELS / (width * height));
  // Round down so floating-point drift can never put the allocated canvas one
  // pixel over a browser limit.
  const scale = Math.floor(
    Math.min(preferredScale, dimensionScale, pixelScale) * 1_000,
  ) / 1_000;

  if (
    scale < minimumScale ||
    Math.floor(width * scale) < minimumOutputWidth
  ) {
    throw new Error(
      "This report is too large for a readable raster export. Use Print / PDF instead.",
    );
  }
  return scale;
}

interface StyleSnapshot {
  element: HTMLElement;
  properties: Array<{
    name: string;
    value: string;
    priority: string;
  }>;
}

function setTemporaryStyles(
  elements: Iterable<HTMLElement>,
  properties: Record<string, string>,
): () => void {
  const snapshots: StyleSnapshot[] = Array.from(elements, (element) => ({
    element,
    properties: Object.keys(properties).map((name) => ({
      name,
      value: element.style.getPropertyValue(name),
      priority: element.style.getPropertyPriority(name),
    })),
  }));

  for (const snapshot of snapshots) {
    for (const [name, value] of Object.entries(properties)) {
      snapshot.element.style.setProperty(name, value, "important");
    }
  }

  return () => {
    for (const snapshot of snapshots) {
      for (const property of snapshot.properties) {
        if (!property.value) {
          snapshot.element.style.removeProperty(property.name);
        } else {
          snapshot.element.style.setProperty(
            property.name,
            property.value,
            property.priority,
          );
        }
      }
    }
  };
}

function setTemporaryDisplay(
  elements: Iterable<HTMLElement>,
  display: string,
): () => void {
  return setTemporaryStyles(elements, { display });
}

function widenConfiguredRasterTarget(target: HTMLElement): () => void {
  const configuredWidth = Number.parseInt(
    target.getAttribute(EXPORT_MIN_WIDTH_ATTRIBUTE) ?? "",
    10,
  );
  if (!Number.isFinite(configuredWidth) || configuredWidth <= target.scrollWidth) {
    return () => {};
  }

  return setTemporaryStyles([target], {
    width: `${configuredWidth}px`,
    "max-width": "none",
  });
}

export function showExportOnly(target: HTMLElement): () => void {
  return setTemporaryDisplay(
    target.querySelectorAll<HTMLElement>(EXPORT_ONLY_SELECTOR),
    "block",
  );
}

export function hideActionsForExport(target: HTMLElement): () => void {
  return setTemporaryDisplay(
    target.querySelectorAll<HTMLElement>(EXPORT_ACTIONS_SELECTOR),
    "none",
  );
}

export function relaxTextForExport(target: HTMLElement): () => void {
  return setTemporaryStyles(
    target.querySelectorAll<HTMLElement>(EXPORT_TEXT_SELECTOR),
    {
      "line-height": "1.75",
      overflow: "visible",
      "padding-block": "0.2em",
      "white-space": "normal",
      "text-overflow": "clip",
    },
  );
}

export function revealDeferredForExport(target: HTMLElement): () => void {
  return setTemporaryStyles(
    target.querySelectorAll<HTMLElement>(EXPORT_DEFERRED_SELECTOR),
    {
      "content-visibility": "visible",
      "contain-intrinsic-block-size": "none",
    },
  );
}

export function prepareRasterExportTarget(target: HTMLElement): () => void {
  const restoreExportOnly = showExportOnly(target);
  const restoreActions = hideActionsForExport(target);
  const restoreText = relaxTextForExport(target);
  const restoreDeferred = revealDeferredForExport(target);
  const restoreWidth = widenConfiguredRasterTarget(target);

  return () => {
    restoreWidth();
    restoreDeferred();
    restoreText();
    restoreActions();
    restoreExportOnly();
  };
}

export function getPageBackground(): string {
  if (typeof document === "undefined") return "white";
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-page")
      .trim() || "white"
  );
}
