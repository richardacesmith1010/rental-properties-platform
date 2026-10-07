"use client";

import { useEffect, useRef, useState } from "react";
import { CircleOff, MessageSquare, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChargeMoreMenu({
  disabled = false,
  onEdit,
  onWaive,
  onDelete,
  onMessage,
  compact = false
}: {
  disabled?: boolean;
  onEdit?: () => void;
  onWaive?: () => void;
  onDelete?: () => void;
  onMessage?: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (!onEdit && !onWaive && !onDelete && !onMessage) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={compact ? "h-11 min-w-11 px-3" : "h-11 px-3 sm:h-8"}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title="Open more payment actions."
        aria-label="Open more payment actions"
      >
        <MoreVertical className="h-4 w-4" />
        {compact ? null : <span className="ml-1.5">More</span>}
      </Button>

      {open ? (
        <div
          className={[
            "absolute right-0 top-full z-30 mt-2 min-w-[11rem] overflow-hidden rounded-2xl",
            "border border-border bg-background p-1.5 shadow-xl"
          ].join(" ")}
        >
          {onMessage ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onMessage();
              }}
              className={[
                "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
                "text-foreground transition hover:bg-muted"
              ].join(" ")}
              title="Message this tenant."
            >
              <MessageSquare className="h-4 w-4" />
              Message
            </button>
          ) : null}
          {onEdit ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className={[
                "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
                "text-foreground transition hover:bg-muted"
              ].join(" ")}
              title="Edit this payment."
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          ) : null}
          {onWaive ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onWaive();
              }}
              className={[
                "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
                "text-foreground transition hover:bg-muted"
              ].join(" ")}
              title="Waive this payment."
            >
              <CircleOff className="h-4 w-4" />
              Waive
            </button>
          ) : null}
          {onDelete ? (
            <>
              <div className="my-1 h-px bg-border/70" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className={[
                  "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
                  "text-[var(--crit)] transition hover:bg-[var(--crit-bg)]"
                ].join(" ")}
                title="Delete this payment."
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
