"use client";

import { useId, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "./Button";

export interface PrintButtonProps {
  /** Optional label override; defaults to "Print / PDF". */
  label?: string;
  /** Size variant forwarded to Button. */
  size?: "sm" | "md" | "lg";
  className?: string;
  /**
   * Optional override of the print function. Used by tests; defaults to
   * `window.print()` in the browser.
   */
  onPrint?: () => void;
}

/**
 * Triggers the browser print dialog. Combined with the print stylesheet in
 * globals.css this produces a vector PDF via "Save as PDF" in any modern
 * browser, without pulling html2canvas/jspdf into the client bundle.
 */
export function PrintButton({
  label = "Print / PDF",
  size = "md",
  className,
  onPrint,
}: PrintButtonProps) {
  const statusId = useId();
  const [status, setStatus] = useState("");
  function handleClick() {
    if (onPrint) {
      onPrint();
      setStatus("Print dialog requested.");
      return;
    }
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
      setStatus("Print dialog closed.");
    }
  }

  return (
    <>
    <Button
      type="button"
      variant="secondary"
      size={size}
      icon={Printer}
      onClick={handleClick}
      aria-label="Open browser print dialog"
      aria-describedby={statusId}
      className={className}
    >
      {label}
    </Button>
    <span id={statusId} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {status}
    </span>
    </>
  );
}
