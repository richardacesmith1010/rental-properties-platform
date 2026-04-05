"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { AlertTriangle, BellRing, FileText, Loader2, Plus, ShieldAlert } from "lucide-react";
import type { ActionState, StatefulAction } from "@/app/actions";
import type { TenantActivityEntry, TenantActivityType } from "@/app/actions/tenant-activity";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface TenantActivityTimelineProps {
  tenantProfileId: string;
  propertyId: string;
  unitId?: string;
  leaseId?: string;
  tenantName: string;
  onLoadEntries: (tenantProfileId: string, propertyId: string) => Promise<TenantActivityEntry[]>;
  onCreateActivity: StatefulAction;
}

const activityTypeConfig: Record<
  TenantActivityType,
  {
    label: string;
    badgeClassName: string;
    icon: typeof ShieldAlert;
  }
> = {
  infraction: {
    label: "Infraction",
    badgeClassName: "border-rose-200 bg-rose-50 text-rose-700",
    icon: ShieldAlert
  },
  notice: {
    label: "Notice Sent",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    icon: BellRing
  },
  warning: {
    label: "Warning",
    badgeClassName: "border-orange-200 bg-orange-50 text-orange-700",
    icon: AlertTriangle
  },
  note: {
    label: "Note",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
    icon: FileText
  }
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit"
});

export function TenantActivityTimeline({
  tenantProfileId,
  propertyId,
  unitId,
  leaseId,
  tenantName,
  onLoadEntries,
  onCreateActivity
}: TenantActivityTimelineProps) {
  const [formState, formAction] = useFormState(onCreateActivity, null);
  const [entries, setEntries] = useState<TenantActivityEntry[]>([]);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const handledStateRef = useRef<ActionState>(null);

  const loadEntries = useCallback(async () => {
    setIsLoadingEntries(true);
    setLoadError(null);

    try {
      const nextEntries = await onLoadEntries(tenantProfileId, propertyId);
      setEntries(nextEntries);
    } catch (error) {
      console.error("[tenant-activity] load timeline:", error);
      setLoadError("Could not load activity right now.");
    } finally {
      setIsLoadingEntries(false);
    }
  }, [onLoadEntries, propertyId, tenantProfileId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!formState?.success) {
      return;
    }

    if (handledStateRef.current === formState) {
      return;
    }

    handledStateRef.current = formState;
    formRef.current?.reset();
    setIsAddingEntry(false);
    void loadEntries();
  }, [formState, loadEntries]);

  const timelineRows = useMemo(() => {
    let previousDateLabel: string | null = null;

    return entries.flatMap((entry) => {
      const dateLabel = dateFormatter.format(new Date(entry.createdAt));
      const rows: Array<{ kind: "date" | "entry"; key: string; entry?: TenantActivityEntry; label?: string }> = [];

      if (dateLabel !== previousDateLabel) {
        rows.push({
          kind: "date",
          key: `date-${dateLabel}`,
          label: dateLabel
        });
        previousDateLabel = dateLabel;
      }

      rows.push({
        kind: "entry",
        key: entry.id,
        entry
      });

      return rows;
    });
  }, [entries]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold text-foreground">Activity for {tenantName}</p>
          <p className="text-sm text-muted-foreground">
            Track warnings, notices, infractions, and day-to-day notes.
          </p>
        </div>
        <Button
          type="button"
          variant={isAddingEntry ? "outline" : "default"}
          className="w-full sm:w-auto"
          onClick={() => setIsAddingEntry((current) => !current)}
          title={isAddingEntry ? "Hide the activity form." : "Add a new activity entry."}
        >
          <Plus className="mr-2 h-4 w-4" />
          {isAddingEntry ? "Cancel" : "Add Entry"}
        </Button>
      </div>

      {isAddingEntry ? (
        <form
          ref={formRef}
          action={formAction}
          className="mt-4 space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4"
        >
          <input type="hidden" name="tenantProfileId" value={tenantProfileId} />
          <input type="hidden" name="propertyId" value={propertyId} />
          {unitId ? <input type="hidden" name="unitId" value={unitId} /> : null}
          {leaseId ? <input type="hidden" name="leaseId" value={leaseId} /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor={`tenant-activity-type-${tenantProfileId}`}>
                Type
              </label>
              <Select id={`tenant-activity-type-${tenantProfileId}`} name="activityType" defaultValue="note" required>
                <option value="infraction">Infraction</option>
                <option value="notice">Notice Sent</option>
                <option value="warning">Warning</option>
                <option value="note">Note</option>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-1">
              <label className="text-sm font-medium text-foreground" htmlFor={`tenant-activity-title-${tenantProfileId}`}>
                Title
              </label>
              <Input
                id={`tenant-activity-title-${tenantProfileId}`}
                name="title"
                maxLength={200}
                placeholder="Short summary"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor={`tenant-activity-description-${tenantProfileId}`}>
              Details
            </label>
            <Textarea
              id={`tenant-activity-description-${tenantProfileId}`}
              name="description"
              rows={4}
              placeholder="Add details if you need them."
            />
          </div>

          {formState && !formState.success ? (
            <Alert variant="error">{formState.error}</Alert>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAddingEntry(false)}
              title="Close the activity form."
            >
              Cancel
            </Button>
            <SubmitButton title="Save this activity entry.">Save Entry</SubmitButton>
          </div>
        </form>
      ) : null}

      {loadError ? (
        <Alert variant="error" className="mt-4">
          {loadError}
        </Alert>
      ) : null}

      <div className="mt-4 space-y-3">
        {isLoadingEntries ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading activity...
          </div>
        ) : timelineRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
            No activity recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {timelineRows.map((row) => {
              if (row.kind === "date") {
                return (
                  <div key={row.key} className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-border/70" />
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {row.label}
                    </p>
                    <div className="h-px flex-1 bg-border/70" />
                  </div>
                );
              }

              const entry = row.entry!;
              const config = activityTypeConfig[entry.activityType];
              const Icon = config.icon;

              return (
                <div key={row.key} className="rounded-2xl border border-border/80 bg-background px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-muted p-2 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={config.badgeClassName}>{config.label}</Badge>
                            <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                          </div>
                          {entry.description ? (
                            <p className="text-sm text-muted-foreground">{entry.description}</p>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground sm:text-right">
                          <p>Logged by {entry.authorName}</p>
                          <p>{timeFormatter.format(new Date(entry.createdAt))}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
