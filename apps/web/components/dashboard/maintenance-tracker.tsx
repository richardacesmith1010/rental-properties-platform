"use client";

import type { StatusHistoryEntry } from "@/lib/maintenance";
import { formatDateTime } from "@/lib/format";

interface MaintenanceTrackerProps {
  currentStatus: string;
  timeline: StatusHistoryEntry[];
  ticketCreatedAt: string;
}

const TRACKER_STEPS = ["submitted", "reviewed", "in_progress", "resolved", "closed"] as const;

function labelForStatus(status: string) {
  if (status === "in_progress") {
    return "In Progress";
  }
  return status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
}

function normalizeStatus(status: string | null | undefined) {
  if (!status || status === "open") {
    return "submitted";
  }
  return status;
}

export function MaintenanceTracker({
  currentStatus,
  timeline,
  ticketCreatedAt
}: MaintenanceTrackerProps) {
  const normalizedCurrent = normalizeStatus(currentStatus);
  const currentIndex = Math.max(TRACKER_STEPS.indexOf(normalizedCurrent as (typeof TRACKER_STEPS)[number]), 0);

  const timelineByStatus = new Map<string, StatusHistoryEntry>();
  for (const entry of timeline) {
    const normalized = normalizeStatus(entry.toStatus);
    if (!timelineByStatus.has(normalized)) {
      timelineByStatus.set(normalized, entry);
    }
  }

  if (!timelineByStatus.has("submitted")) {
    timelineByStatus.set("submitted", {
      id: "submitted-fallback",
      ticketId: "",
      fromStatus: null,
      toStatus: "submitted",
      changedBy: null,
      changedByName: "Tenant",
      notes: null,
      createdAt: ticketCreatedAt
    });
  }

  if (!timelineByStatus.has("reviewed") && currentIndex > 0) {
    const firstProgressEntry = timeline.find(
      (entry) => !["submitted", "open"].includes(normalizeStatus(entry.toStatus))
    );
    if (firstProgressEntry) {
      timelineByStatus.set("reviewed", {
        ...firstProgressEntry,
        id: `${firstProgressEntry.id}-reviewed`,
        toStatus: "reviewed"
      });
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-foreground">Repair Tracker</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Follow the maintenance request from submission to closeout.
        </p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        {TRACKER_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;
          const entry = timelineByStatus.get(step);

          return (
            <div key={step} className="relative flex flex-1 gap-3 md:flex-col md:items-center">
              {index < TRACKER_STEPS.length - 1 ? (
                <div className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px border-l border-dashed border-border md:left-[calc(50%+1rem)] md:top-4 md:h-px md:w-[calc(100%-1rem)] md:border-l-0 md:border-t" />
              ) : null}
              <div
                className={[
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-all",
                  isCurrent
                    ? "border-[var(--accent-line)] bg-[var(--accent)] text-white shadow-[0_0_0_6px_var(--accent-weak)] animate-pulse"
                    : isCompleted
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-border bg-background text-muted-foreground"
                ].join(" ")}
              >
                {index + 1}
              </div>
              <div className="min-w-0 md:text-center">
                <p className={`text-sm font-medium ${isFuture ? "text-muted-foreground" : "text-foreground"}`}>
                  {labelForStatus(step)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry ? formatDateTime(entry.createdAt) : "Pending"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {entry ? entry.changedByName : isFuture ? "Pending" : "Awaiting update"}
                </p>
                {entry?.notes ? (
                  <div className="mt-2 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-weak)] px-3 py-2 text-left text-xs text-[var(--accent)] md:text-center">
                    {entry.notes}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
