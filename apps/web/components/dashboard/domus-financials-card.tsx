"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn, formatCurrency } from "@/lib/format";
import { getStatusClasses } from "@/lib/status-colors";

export interface DomusFinancialsCardProps {
  monthlyCollectedCents: number;
  monthlyOutstandingCents: number;
  monthlyExpensesCents: number;
  netIncomeCents: number;
  ytdIncomeCents: number;
  ytdExpensesCents: number;
  collectionRate: number;
  className?: string;
}

function getNetTone(value: number) {
  if (value > 0) {
    return getStatusClasses("paid");
  }
  if (value < 0) {
    return getStatusClasses("late");
  }
  return getStatusClasses("waived");
}

function getCollectionTone(collectionRate: number) {
  if (collectionRate >= 95) {
    return getStatusClasses("paid");
  }
  if (collectionRate >= 80) {
    return getStatusClasses("pending");
  }
  return getStatusClasses("late");
}

function MetricRow({
  label,
  value,
  emphasized = false,
  valueClassName
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-sm text-muted-foreground", emphasized && "font-semibold text-foreground")}>
        {label}
      </span>
      <span className={cn("text-sm font-medium text-foreground", emphasized && "text-base font-semibold", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

export function DomusFinancialsCard({
  monthlyCollectedCents,
  monthlyOutstandingCents,
  monthlyExpensesCents,
  netIncomeCents,
  ytdIncomeCents,
  ytdExpensesCents,
  collectionRate,
  className
}: DomusFinancialsCardProps) {
  const monthlyNetTone = getNetTone(netIncomeCents);
  const ytdNetCents = ytdIncomeCents - ytdExpensesCents;
  const collectionTone = getCollectionTone(collectionRate);

  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 shadow-sm", className)}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <section className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              This Month
            </p>
            <div className="mt-3 space-y-2.5">
              <MetricRow label="Collected" value={formatCurrency(monthlyCollectedCents)} />
              <MetricRow label="Outstanding" value={formatCurrency(monthlyOutstandingCents)} />
              <MetricRow label="Expenses" value={formatCurrency(monthlyExpensesCents)} />
            </div>
          </div>

          <div className="border-t border-border/60 pt-3">
            <div
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border px-3 py-3",
                monthlyNetTone.bg,
                monthlyNetTone.border
              )}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Net Income
                </p>
                <p className={cn("mt-1 text-xl font-bold", monthlyNetTone.text)}>
                  {formatCurrency(netIncomeCents)}
                </p>
              </div>
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border",
                  monthlyNetTone.bg,
                  monthlyNetTone.border
                )}
                aria-hidden="true"
              >
                {netIncomeCents > 0 ? (
                  <ArrowUpRight className={cn("h-5 w-5", monthlyNetTone.text)} />
                ) : netIncomeCents < 0 ? (
                  <ArrowDownRight className={cn("h-5 w-5", monthlyNetTone.text)} />
                ) : (
                  <Minus className={cn("h-5 w-5", monthlyNetTone.text)} />
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3 border-t border-border/60 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Year to Date
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Traceable from charges and expenses already recorded in Domus.
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                collectionTone.bg,
                collectionTone.border,
                collectionTone.text
              )}
            >
              {Math.round(collectionRate)}% collected
            </span>
          </div>

          <div className="space-y-2.5">
            <MetricRow label="Total income" value={formatCurrency(ytdIncomeCents)} />
            <MetricRow label="Total expenses" value={formatCurrency(ytdExpensesCents)} />
            <MetricRow
              label="Net YTD"
              value={formatCurrency(ytdNetCents)}
              emphasized
              valueClassName={getNetTone(ytdNetCents).text}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
