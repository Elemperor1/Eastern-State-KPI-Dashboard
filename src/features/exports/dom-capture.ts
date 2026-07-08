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

export function prepareRasterExportTarget(target: HTMLElement): () => void {
  const restoreExportOnly = showExportOnly(target);
  const restoreActions = hideActionsForExport(target);
  const restoreText = relaxTextForExport(target);

  return () => {
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
