/**
 * Shared helpers for PNG and PDF raster exports.
 *
 * Both exports use html2canvas, which takes a pixel snapshot of the DOM.
 * The `.export-only` report chrome (brand header, filter chips, footer) is
 * `display:none` on screen. This module temporarily flips it to
 * `display:block` for the duration of the capture so the branded header
 * and footer appear in the exported image — without a flash on the user's
 * screen.
 */

/**
 * Temporarily make `.export-only` elements visible inside `target`.
 * Returns a cleanup function that restores the original state.
 */
export function showExportOnly(target: HTMLElement): () => void {
  const exportEls = target.querySelectorAll<HTMLElement>(".export-only");
  const originalDisplays: Array<{ value: string; priority: string }> = [];
  exportEls.forEach((el) => {
    originalDisplays.push({
      value: el.style.getPropertyValue("display"),
      priority: el.style.getPropertyPriority("display"),
    });
    el.style.setProperty("display", "block", "important");
  });
  return () => {
    exportEls.forEach((el, i) => {
      const original = originalDisplays[i];
      if (!original.value) {
        el.style.removeProperty("display");
      } else {
        el.style.setProperty("display", original.value, original.priority);
      }
    });
  };
}

/**
 * Resolve the page background color from the CSS custom property
 * `--color-page`, falling back to white.
 */
export function getPageBackground(): string {
  if (typeof document === "undefined") return "white";
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-page")
      .trim() || "white"
  );
}

/**
 * Temporarily hide the on-screen PageHeader actions row so it doesn't
 * appear in the export as a duplicate of the report header. Returns a
 * cleanup function.
 */
export function hideActionsForExport(target: HTMLElement): () => void {
  const actions = target.querySelectorAll<HTMLElement>(
    '[data-page-header-actions], .no-print',
  );
  const originalDisplays: Array<{ value: string; priority: string }> = [];
  actions.forEach((el) => {
    originalDisplays.push({
      value: el.style.getPropertyValue("display"),
      priority: el.style.getPropertyPriority("display"),
    });
    el.style.setProperty("display", "none", "important");
  });
  return () => {
    actions.forEach((el, i) => {
      const original = originalDisplays[i];
      if (!original.value) {
        el.style.removeProperty("display");
      } else {
        el.style.setProperty("display", original.value, original.priority);
      }
    });
  };
}
