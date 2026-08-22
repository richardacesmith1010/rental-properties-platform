"use client";

import { ArrowUpRight, DollarSign, Receipt, Settings2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatShortDateTime } from "@/lib/format";
import type { FinancialActivityEvent } from "@/lib/distributions";

interface FinancialActivityFeedProps {
  events: FinancialActivityEvent[];
}

function formatCurrency(amountCents: number | null) {
  if (amountCents === null) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amountCents / 100);
}

function formatTimestamp(value: string) {
  return formatShortDateTime(value);
}

function iconForEvent(type: FinancialActivityEvent["type"]) {
  switch (type) {
    case "distribution":
      return DollarSign;
    case "config_change":
      return Settings2;
    case "withdrawal":
      return ArrowUpRight;
    default:
      return Receipt;
  }
}

function badgeVariant(status: string | null) {
  if (status === "approved" || status === "completed") {
    return "success" as const;
  }
  if (status === "rejected" || status === "failed") {
    return "destructive" as const;
  }
  if (status === "pending") {
    return "warning" as const;
  }
  return "outline" as const;
}

export function FinancialActivityFeed({ events }: FinancialActivityFeedProps) {
  const visibleEvents = events.slice(0, 50);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {visibleEvents.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="No financial activity yet"
            description="Distributions, config changes, withdrawals, and expenses will appear here."
          />
        ) : (
          <div className="space-y-3">
            {visibleEvents.map((event) => {
              const Icon = iconForEvent(event.type);
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
                >
                  <div className="rounded-lg bg-[var(--accent-weak)] p-2 text-[var(--accent)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900">{event.title}</p>
                      {event.status ? (
                        <Badge variant={badgeVariant(event.status)} className="capitalize">
                          {event.status}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">{event.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                      <span>{formatTimestamp(event.createdAt)}</span>
                      {event.amountCents !== null ? (
                        <span className="font-semibold text-zinc-700">{formatCurrency(event.amountCents)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
