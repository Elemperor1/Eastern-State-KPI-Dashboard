"use client";

import {
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function usePresence(open: boolean, exitMs = 180) {
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    let frame = 0;
    let timeout = 0;
    if (open) {
      setRendered(true);
      frame = window.requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      timeout = window.setTimeout(() => setRendered(false), exitMs);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [exitMs, open]);

  return { rendered, visible };
}

export function useModalFocus({
  open,
  containerRef,
  initialFocusRef,
  onClose,
  closeEnabled = true,
  inertBackground = true,
}: {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  closeEnabled?: boolean;
  inertBackground?: boolean;
}) {
  const onCloseRef = useRef(onClose);
  const closeEnabledRef = useRef(closeEnabled);
  onCloseRef.current = onClose;
  closeEnabledRef.current = closeEnabled;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const appShell = inertBackground
      ? document.querySelector<HTMLElement>("[data-app-shell-content]")
      : null;
    const appShellWasInert = appShell?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (appShell) appShell.inert = true;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      const firstField = container?.querySelector<HTMLElement>(
        '[data-autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      const firstFocusable = container?.querySelector<HTMLElement>(
        FOCUSABLE_SELECTOR,
      );
      (initialFocusRef?.current ?? firstField ?? firstFocusable ?? container)?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && closeEnabledRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !containerRef.current) return;
      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.inert && element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        containerRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (appShell) appShell.inert = appShellWasInert;
      window.requestAnimationFrame(() => previousFocus?.focus());
    };
  }, [containerRef, inertBackground, initialFocusRef, open]);
}
