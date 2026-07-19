import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Supports the source test scenario. */
function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("interaction and motion contracts", () => {
  it("keeps frequent route navigation immediate and temporary layers interruptible", () => {
    const css = source("../../app/globals.css");
    expect(css).toContain("--motion-fast: 120ms");
    expect(css).toContain("--motion-standard: 180ms");
    expect(css).toContain("--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)");
    expect(css).toContain(".page-enter {\n  animation: none;");
    expect(css).not.toContain("@keyframes page-enter");
    expect(css).toContain('transform: translateX(-100%)');
    expect(css).toContain("transform: scale(0.97)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps shared interaction timing on the fast motion token", () => {
    const css = source("../../app/globals.css");
    const primitives = [
      source("./Checkbox.tsx"),
      source("./IconButton.tsx"),
      source("./Breadcrumb.tsx"),
    ].join("\n");

    expect(css).not.toContain("duration-150");
    expect(css).toContain("transition-duration: var(--motion-fast)");
    expect(primitives).not.toContain("duration-150");
    expect(primitives).toContain("duration-[var(--motion-fast)]");
    expect(primitives).toContain("ease-[var(--ease-out)]");
  });

  it("shares focus trapping, Escape, presence, and restoration across temporary layers", () => {
    const interaction = source("./useModalInteraction.ts");
    const dialog = source("./Dialog.tsx");
    const confirm = source("./ConfirmDialog.tsx");
    const shell = source("../AppShell.tsx");
    expect(interaction).toContain('event.key === "Escape"');
    expect(interaction).toContain("previousFocus?.focus()");
    expect(interaction).toContain("containerRef.current.querySelectorAll");
    expect(dialog).toContain("useModalFocus");
    expect(dialog).toContain("usePresence");
    expect(confirm).toContain("isLoading={busy}");
    expect(shell).toContain("mobile-drawer-panel");
    expect(shell).toContain("inert={mobileOpen}");
  });

  it("uses compositor-friendly progress and honest export completion text", () => {
    expect(source("./Progress.tsx")).toContain("transform: `scaleX(");
    expect(source("./Progress.tsx")).not.toContain("transition-[width]");
    expect(source("./ExportCSVButton.tsx")).toContain(
      "CSV export ready. Download started.",
    );
    expect(source("./ExportPNGButton.tsx")).toContain(
      "PNG export ready. Download started.",
    );
    expect(source("../ExportPDFButton.tsx")).toContain(
      "PDF export ready. Download started.",
    );
  });

  it("keeps Data Entry drafts actionable through validation and connectivity failures", () => {
    const entry = source("../../app/data-entry/_components/StrategicDataEntryClient.tsx");
    expect(entry).toContain("window.navigator.onLine");
    expect(entry).toContain("Your unsaved changes are still here");
    expect(entry).toContain("querySelector<HTMLElement>('[aria-invalid=\"true\"]')");
    expect(entry).toContain("Save unavailable offline");
  });
});
