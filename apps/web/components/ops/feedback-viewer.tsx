"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bug, Check, ChevronDown, ChevronUp, Copy, ExternalLink, MessageCircleMore, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { StatefulAction } from "@/app/actions";
import { RelativeTime } from "@/components/ui/relative-time";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import {
  getFeedbackStatusBadgeVariant,
  getFeedbackStatusLabel,
  getFeedbackSubmitterLabel,
  getFeedbackTypeMeta,
  type FeedbackEntry,
  type FeedbackStatus,
  type FeedbackType
} from "@/lib/feedback";
import { cn, formatDateTime } from "@/lib/format";

interface FeedbackViewerProps {
  items: FeedbackEntry[];
  warning?: string | null;
  onUpdateStatus: StatefulAction;
}

function FeedbackStatusControl({
  entry,
  onUpdateStatus,
  onStatusSaved
}: {
  entry: FeedbackEntry;
  onUpdateStatus: StatefulAction;
  onStatusSaved: (status: FeedbackStatus) => void;
}) {
  const [status, setStatus] = useState<FeedbackStatus>(entry.status);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setStatus(entry.status);
  }, [entry.status]);

  const handleChange = (nextStatus: FeedbackStatus) => {
    const previousStatus = status;
    setStatus(nextStatus);

    const formData = new FormData();
    formData.set("feedbackId", entry.id);
    formData.set("status", nextStatus);

    startTransition(async () => {
      const result = await onUpdateStatus(null, formData);
      if (!result?.success) {
        setStatus(previousStatus);
        toast.error(result?.error ?? "Unable to update feedback status.");
        return;
      }

      onStatusSaved(nextStatus);
      toast.success(result.message ?? "Feedback status updated.");
    });
  };

  return (
    <Select
      value={status}
      disabled={isPending}
      className="w-[150px]"
      onChange={(event) => handleChange(event.target.value as FeedbackStatus)}
      title="Update feedback status."
    >
      <option value="new">New</option>
      <option value="reviewed">Reviewed</option>
      <option value="resolved">Resolved</option>
      <option value="wontfix">Won&apos;t fix</option>
    </Select>
  );
}

function FeedbackTypeIcon({ type }: { type: FeedbackType }) {
  if (type === "bug") {
    return <Bug className="h-4 w-4" />;
  }

  if (type === "feature") {
    return <Sparkles className="h-4 w-4" />;
  }

  return <MessageCircleMore className="h-4 w-4" />;
}

export function FeedbackViewer({ items, warning, onUpdateStatus }: FeedbackViewerProps) {
  const [entries, setEntries] = useState(items);
  const [typeFilter, setTypeFilter] = useState<"all" | FeedbackType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackStatus>("all");
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?.id ?? null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setEntries(items);
  }, [items]);

  useEffect(() => {
    if (expandedId && entries.some((item) => item.id === expandedId)) {
      return;
    }
    setExpandedId(entries[0]?.id ?? null);
  }, [entries, expandedId]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const copyMessage = async (id: string, message: string) => {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedId(id);

      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }

      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
        copyResetTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error("[feedback-viewer] copy message:", error);
      toast.error("Could not copy the feedback message.");
    }
  };

  const filteredItems = useMemo(() => {
    return entries.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) {
        return false;
      }
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [entries, statusFilter, typeFilter]);

  const newCount = entries.filter((item) => item.status === "new").length;

  return (
    <div className="space-y-4">
      {warning ? <Alert variant="warning">{warning}</Alert> : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">Feedback Inbox</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Review feedback from visitors, tenants, managers, and owners.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">{newCount} new</Badge>
            <Badge variant="outline">{entries.length} total</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_180px_1fr]">
            <div className="space-y-1.5">
              <label htmlFor="feedback-type-filter" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Type
              </label>
              <Select
                id="feedback-type-filter"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as "all" | FeedbackType)}
                title="Filter feedback by type."
              >
                <option value="all">All types</option>
                <option value="bug">Bug</option>
                <option value="feature">Feature</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="feedback-status-filter" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </label>
              <Select
                id="feedback-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | FeedbackStatus)}
                title="Filter feedback by status."
              >
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="reviewed">Reviewed</option>
                <option value="resolved">Resolved</option>
                <option value="wontfix">Won&apos;t fix</option>
              </Select>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {filteredItems.length} feedback entr{filteredItems.length === 1 ? "y" : "ies"} match the current filters.
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <EmptyState
              icon={MessageCircleMore}
              title="No feedback matches"
              description="Adjust the filters to see other feedback records."
              showDom={false}
            />
          ) : (
            <div className="space-y-3">
              {filteredItems.map((entry) => {
                const typeMeta = getFeedbackTypeMeta(entry.type);
                const expanded = expandedId === entry.id;

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "rounded-2xl border border-border/70 bg-card transition-shadow",
                      expanded ? "shadow-sm" : "hover:shadow-sm"
                    )}
                  >
                    <div className="flex items-start gap-3 px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                        className="min-w-0 flex-1 text-left"
                        title={`Open feedback from ${getFeedbackSubmitterLabel(entry)}.`}
                      >
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="inline-flex items-center gap-1">
                              <FeedbackTypeIcon type={entry.type} />
                              {typeMeta.label}
                            </Badge>
                            <Badge variant={getFeedbackStatusBadgeVariant(entry.status)}>
                              {getFeedbackStatusLabel(entry.status)}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">
                              {getFeedbackSubmitterLabel(entry)}
                              {entry.userRole ? (
                                <span className="ml-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  {entry.userRole}
                                </span>
                              ) : null}
                            </p>
                            <p className="select-text text-sm leading-6 text-foreground">
                              {expanded ? entry.message : `${entry.message.slice(0, 140)}${entry.message.length > 140 ? "..." : ""}`}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>{formatDateTime(entry.createdAt)}</span>
                            <RelativeTime
                              value={entry.createdAt}
                              fallback="dateTime"
                              title={formatDateTime(entry.createdAt)}
                            />
                            {entry.pageUrl ? (
                              <span className="max-w-full truncate">
                                Page: {entry.pageUrl.replace(/^https?:\/\/[^/]+/i, "") || "/"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                      <div className="flex flex-shrink-0 items-start gap-2">
                        <button
                          type="button"
                          onClick={() => void copyMessage(entry.id, entry.message)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
                          title="Copy feedback message"
                          aria-label={copiedId === entry.id ? "Copied feedback message" : "Copy feedback message"}
                        >
                          {copiedId === entry.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                              <span className="text-emerald-700">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : entry.id)}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background"
                          title={expanded ? "Collapse feedback details." : "Expand feedback details."}
                          aria-label={expanded ? "Collapse feedback details" : "Expand feedback details"}
                        >
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="space-y-4 border-t border-border/60 px-4 py-4">
                        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                          <div className="space-y-3 text-sm text-muted-foreground">
                            {entry.email ? (
                              <p>
                                <span className="font-medium text-foreground">Email:</span> {entry.email}
                              </p>
                            ) : null}
                            {entry.pageUrl ? (
                              <p className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">Page:</span>
                                <Link
                                  href={entry.pageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-violet-700 hover:text-violet-800"
                                >
                                  {entry.pageUrl}
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Link>
                              </p>
                            ) : null}
                            {entry.viewport ? (
                              <p>
                                <span className="font-medium text-foreground">Viewport:</span> {entry.viewport}
                              </p>
                            ) : null}
                            {entry.userAgent ? (
                              <p className="break-words">
                                <span className="font-medium text-foreground">User agent:</span> {entry.userAgent}
                              </p>
                            ) : null}
                          </div>
                          <FeedbackStatusControl
                            entry={entry}
                            onUpdateStatus={onUpdateStatus}
                            onStatusSaved={(nextStatus) => {
                              setEntries((current) =>
                                current.map((item) =>
                                  item.id === entry.id ? { ...item, status: nextStatus } : item
                                )
                              );
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
