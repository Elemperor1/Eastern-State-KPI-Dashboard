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
  const originalDisplays: string[] = [];
  exportEls.forEach((el) => {
    originalDisplays.push(el.style.display);
    el.style.display = "block";
  });
  return () => {
    exportEls.forEach((el, i) => {
      el.style.display = originalDisplays[i];
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
  const originalDisplays: string[] = [];
  actions.forEach((el) => {
    originalDisplays.push(el.style.display);
    el.style.display = "none";
  });
  return () => {
    actions.forEach((el, i) => {
      el.style.display = originalDisplays[i];
    });
  };
}