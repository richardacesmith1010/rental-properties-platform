"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ModalOverlayProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
}

export function ModalOverlay({ open, onClose, children }: ModalOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const hasInitialFocused = useRef(false);
  const previousActiveRef = useRef<HTMLElement | null>(null);

  // Keep onClose ref current without triggering effect re-runs
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    // Capture the element that was focused before the modal opened
    if (!previousActiveRef.current) {
      previousActiveRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }

    // Focus the first focusable element only on initial open
    if (!hasInitialFocused.current) {
      const focusableSelector = [
        "a[href]",
        "button:not([disabled])",
        "textarea:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(",");
      const focusableElements = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ??
          []
      );
      (focusableElements[0] ?? containerRef.current)?.focus();
      hasInitialFocused.current = true;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableSelector = [
        "a[href]",
        "button:not([disabled])",
        "textarea:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(",");

      const currentFocusable = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ??
          []
      );
      if (currentFocusable.length === 0) {
        event.preventDefault();
        containerRef.current?.focus();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
    // Only run on open change — NOT on onClose changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) {
    hasInitialFocused.current = false;
    // Restore focus when modal closes
    if (previousActiveRef.current) {
      previousActiveRef.current.focus();
      previousActiveRef.current = null;
    }
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm transition-opacity duration-200"
        onClick={() => onCloseRef.current?.()}
        aria-hidden="true"
      />
      <div className="relative z-10 flex min-h-full items-start justify-center px-4 py-6 sm:items-center">
        <div
          ref={containerRef}
          className="relative z-10 mx-auto w-full max-w-2xl overflow-y-auto rounded-2xl animate-scale-in scroll-smooth [-webkit-overflow-scrolling:touch]"
          tabIndex={-1}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
