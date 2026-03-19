"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface BatchToolbarProps {
  selectedCount: number;
  onDeselectAll: () => void;
  onSendReminder: () => void;
  onExport: () => void;
  sendingReminders?: boolean;
}

export function BatchToolbar({
  selectedCount,
  onDeselectAll,
  onSendReminder,
  onExport,
  sendingReminders = false
}: BatchToolbarProps) {
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const previousSelectedCountRef = useRef(0);

  useEffect(() => {
    const wasHidden = previousSelectedCountRef.current === 0;
    if (selectedCount > 0 && wasHidden) {
      window.requestAnimationFrame(() => firstActionRef.current?.focus());
    }
    previousSelectedCountRef.current = selectedCount;
  }, [selectedCount]);

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-primary/10 px-4 py-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
      role="toolbar"
      aria-label="Batch actions for selected charges"
    >
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="text-sm font-semibold text-foreground"
      >
        {selectedCount} selected
      </span>
      <div className="hidden h-4 w-px bg-border sm:block" />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          ref={firstActionRef}
          type="button"
          size="sm"
          variant="outline"
          onClick={onSendReminder}
          loading={sendingReminders}
          className="min-h-11 w-full sm:min-h-9 sm:w-auto"
          title="Send payment reminders for the selected charges."
        >
          Send Reminder
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onExport}
          className="min-h-11 w-full sm:min-h-9 sm:w-auto"
          title="Export the selected charges as CSV."
        >
          Export CSV
        </Button>
      </div>
      <div className="hidden flex-1 sm:block" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onDeselectAll}
        className="min-h-11 w-full sm:min-h-9 sm:w-auto"
        title="Clear the current charge selection."
      >
        Clear selection
      </Button>
    </div>
  );
}
