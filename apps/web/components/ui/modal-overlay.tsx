"use client";

import { useEffect, useCallback, useRef, type ReactNode } from "react";

interface ModalOverlayProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
}

export function ModalOverlay({ open, onClose, children }: ModalOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && onClose) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;

    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const focusableElements = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
    );
    (focusableElements[0] ?? containerRef.current)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      handleEscape(event);

      if (event.key !== "Tab") {
        return;
      }

      const currentFocusable = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
      );
      if (currentFocusable.length === 0) {
        event.preventDefault();
        containerRef.current?.focus();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      previousActiveElement?.focus();
    };
  }, [open, handleEscape]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ease-out"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        className="relative z-10 w-full max-w-lg animate-in fade-in zoom-in-95 duration-200"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
