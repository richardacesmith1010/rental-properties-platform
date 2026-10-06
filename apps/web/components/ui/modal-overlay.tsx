"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalOverlayProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  label?: string;
}

const focusableSelector = [
  "a[href]", "button:not([disabled])", "textarea:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "[tabindex]:not([tabindex='-1'])"
].join(",");

export function ModalOverlay({ open, onClose, children, label }: ModalOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  // Keep onClose ref current without triggering effect re-runs
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(containerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
      .filter((element) => getComputedStyle(element).display !== "none");
    (focusable()[0] ?? containerRef.current)?.focus();

    function keepFocusInside(event: FocusEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        (focusable()[0] ?? containerRef.current).focus();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const currentFocusable = focusable();
      if (currentFocusable.length === 0) {
        event.preventDefault();
        containerRef.current?.focus();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];

      if (event.shiftKey && (document.activeElement === first || !containerRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !containerRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", keepFocusInside);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", keepFocusInside);
      document.body.style.overflow = "";
      previousActive?.focus();
    };
    // Only run on open change — NOT on onClose changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) {
    return null;
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label={label}
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
          className={[
            "relative z-10 mx-auto max-h-[92svh] w-full max-w-full overflow-y-auto rounded-t-[1.5rem]",
            "shadow-[var(--domus-shadow-lg)] scroll-smooth [-webkit-overflow-scrolling:touch]",
            "sm:max-h-[calc(100svh-3rem)] sm:max-w-2xl sm:rounded-2xl"
          ].join(" ")}
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
    </div>,
    document.body
  );
}
