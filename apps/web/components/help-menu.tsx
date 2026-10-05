"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import type { StatefulAction } from "@/app/actions";
import { FeedbackButton } from "@/components/feedback/feedback-button";

export const OPEN_AI_ASSISTANT_EVENT = "domus:open-ai-assistant";
export const AI_ASSISTANT_AVAILABILITY_EVENT = "domus:ai-assistant-availability";

interface HelpMenuProps {
  onSubmitFeedback: StatefulAction;
}

export function HelpMenu({ onSubmitFeedback }: HelpMenuProps) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [assistantAvailable, setAssistantAvailable] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleAvailability = (event: Event) => {
      setAssistantAvailable((event as CustomEvent<boolean>).detail === true);
    };

    setAssistantAvailable(document.documentElement.dataset.domusAiAssistantAvailable === "true");
    window.addEventListener(AI_ASSISTANT_AVAILABILITY_EVENT, handleAvailability);
    return () => window.removeEventListener(AI_ASSISTANT_AVAILABILITY_EVENT, handleAvailability);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const openAssistant = () => {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent(OPEN_AI_ASSISTANT_EVENT, {
        detail: { trigger: triggerRef.current }
      })
    );
  };

  return (
    <div
      ref={containerRef}
      className={pathname.startsWith("/owner")
        ? "fixed bottom-[calc(env(safe-area-inset-bottom,0px)+6rem)] right-4 z-40 print:hidden lg:bottom-6 lg:right-6"
        : "fixed bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] right-4 z-40 print:hidden sm:bottom-6 sm:right-6"}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--accent)] text-white shadow-lg transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ground)]"
        title="Open help options."
        aria-label="Help"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <CircleHelp className="h-5 w-5" />
      </button>

      <div
        role="menu"
        aria-label="Help options"
        hidden={!open}
        className={open
          ? "absolute bottom-full right-0 mb-2 w-48 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--domus-shadow-md)]"
          : "hidden"}
      >
        {assistantAvailable ? (
          <button
            type="button"
            role="menuitem"
            onClick={openAssistant}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--ink-2)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]"
            title="Ask Domus about your properties."
          >
            <Sparkles className="h-4 w-4" />
            Ask Domus
          </button>
        ) : null}
        <FeedbackButton onSubmit={onSubmitFeedback} onOpen={() => setOpen(false)} />
      </div>
    </div>
  );
}
