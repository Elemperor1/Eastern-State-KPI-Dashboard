"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { useModalFocus, usePresence } from "./useModalInteraction";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [busy, setBusy] = useState(false);
  const presence = usePresence(open);

  useEffect(() => {
    if (open) setBusy(false);
  }, [open]);

  useModalFocus({
    open: open && presence.rendered,
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onClose,
    closeEnabled: !busy,
  });

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  if (!presence.rendered || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-layer fixed inset-0 z-[70] grid place-items-center px-4"
      data-state={presence.visible ? "open" : "closed"}
      aria-hidden={!open}
      inert={!open}
    >
      <button
        type="button"
        className="modal-scrim absolute inset-0 bg-ink-950/65 backdrop-blur-[2px]"
        aria-label="Close confirmation dialog"
        onClick={busy ? undefined : onClose}
        disabled={busy}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="modal-panel surface-elevated relative w-full max-w-md p-6 focus:outline-none"
      >
        <div className="mb-5 flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <div>
            <h2 id={titleId} className="text-xl font-semibold text-ink-900">
              {title}
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-ink-600 text-pretty">
              {description}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button ref={cancelRef} type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={confirm}
            isLoading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {busy ? `${confirmLabel} in progress.` : ""}
        </span>
      </div>
    </div>,
    document.body,
  );
}
