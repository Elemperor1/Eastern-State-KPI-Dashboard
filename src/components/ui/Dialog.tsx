"use client";

import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { useModalFocus, usePresence } from "./useModalInteraction";

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
}

/** Renders the dialog interface. */
export function Dialog({ open, title, description, children, footer, onClose }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const presence = usePresence(open);
  useModalFocus({ open: open && presence.rendered, containerRef: dialogRef, onClose });

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
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="modal-panel surface-elevated relative w-full max-w-lg overflow-hidden focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-5">
          <div>
            <h2 id={titleId} className="text-xl font-semibold text-ink-900">{title}</h2>
            {description ? (
              <p id={descriptionId} className="mt-2 text-sm leading-6 text-ink-600 text-pretty">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton icon={X} label="Close dialog" variant="ghost" size="sm" onClick={onClose} />
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer ? <div className="flex justify-end gap-3 border-t border-ink-100 bg-ink-50 px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
