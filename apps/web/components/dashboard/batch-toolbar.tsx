"use client";

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
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-primary/10 px-4 py-3 shadow-sm">
      <span className="text-sm font-semibold text-foreground">{selectedCount} selected</span>
      <div className="hidden h-4 w-px bg-border sm:block" />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onSendReminder}
        loading={sendingReminders}
        title="Send payment reminders for the selected charges."
      >
        Send Reminder
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onExport}
        title="Export the selected charges as CSV."
      >
        Export CSV
      </Button>
      <div className="flex-1" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onDeselectAll}
        title="Clear the current charge selection."
      >
        Clear selection
      </Button>
    </div>
  );
}
