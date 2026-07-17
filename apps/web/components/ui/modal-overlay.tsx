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
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 backdrop-blur-sm transition-opacity duration-200"
        style={{
          backgroundColor: "color-mix(in srgb, var(--ground) 20%, rgba(18, 19, 22, 0.62))"
        }}
        onClick={() => onCloseRef.current?.()}
        aria-hidden="true"
      />
      <div className="relative z-10 flex min-h-full items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-6">
        <div
          ref={containerRef}
          className="relative z-10 mx-auto max-h-[92svh] w-full max-w-full overflow-y-auto rounded-t-[1.5rem] shadow-[var(--domus-shadow-lg)] animate-scale-in scroll-smooth [-webkit-overflow-scrolling:touch] sm:max-h-[calc(100svh-3rem)] sm:max-w-2xl sm:rounded-2xl"
          tabIndex={-1}
        >
          <div className="sticky top-0 z-20 flex justify-center bg-transparent pt-3 sm:hidden" aria-hidden="true">
            <div
              className="h-1.5 w-12 rounded-full"
              style={{ backgroundColor: "color-mix(in srgb, var(--line) 80%, transparent)" }}
            />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
