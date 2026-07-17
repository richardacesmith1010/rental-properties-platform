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

function ToneIcon({ value, className }: { value: number; className: string }) {
  if (value > 0) {
    return <ArrowUpRight className={cn("h-4 w-4", className)} aria-hidden="true" />;
  }

  if (value < 0) {
    return <ArrowDownRight className={cn("h-4 w-4", className)} aria-hidden="true" />;
  }

  return <Minus className={cn("h-4 w-4", className)} aria-hidden="true" />;
}

function MetricTile({
  label,
  value,
  meta,
  tone = null,
  icon
}: {
  label: string;
  value: string;
  meta: string;
  tone?: ReturnType<typeof getStatusClasses> | null;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border px-4 py-4 shadow-sm",
        tone?.border ?? "border-[color:color-mix(in_srgb,var(--line)_80%,transparent)]",
        tone?.bg ?? "bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)]"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <div className="mt-3 flex items-start justify-between gap-3">
        <p className={cn("tabular-nums text-[25px] font-[660] tracking-[-0.025em] text-[var(--ink)]", tone?.text)}>
          {value}
        </p>
        {icon ? (
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-current/10 bg-[color:color-mix(in_srgb,var(--surface)_70%,transparent)]">
            {icon}
          </div>
        ) : null}
      </div>
      <p className={cn("mt-3 text-sm", tone?.text ?? "text-[var(--muted)]")}>{meta}</p>
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
  const collectionTone = getCollectionTone(collectionRate);
  const ytdNetCents = ytdIncomeCents - ytdExpensesCents;
  const ytdNetTone = getNetTone(ytdNetCents);

  return (
    <section className={cn("domus-card overflow-hidden p-5 shadow-sm", className)}>
      <div className="flex flex-col gap-2 border-b border-[color:color-mix(in_srgb,var(--line)_84%,transparent)] pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Financial snapshot
        </p>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-[22px] font-[640] tracking-[-0.02em] text-[var(--ink)]">
              Domus totals
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Live rent and expense totals from the records already in Domus.
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] lg:self-auto",
              collectionTone.bg,
              collectionTone.border,
              collectionTone.text
            )}
          >
            <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", collectionTone.dot)} />
            {Math.round(collectionRate)}% collected
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Collected this month"
          value={formatCurrency(monthlyCollectedCents)}
          meta="Payments already recorded"
        />
        <MetricTile
          label="Still outstanding"
          value={formatCurrency(monthlyOutstandingCents)}
          meta={
            monthlyOutstandingCents > 0 ? "Needs follow-up" : "Nothing outstanding"
          }
          tone={monthlyOutstandingCents > 0 ? getStatusClasses("late") : getStatusClasses("paid")}
        />
        <MetricTile
          label="Expenses this month"
          value={formatCurrency(monthlyExpensesCents)}
          meta="Tracked owner expenses"
        />
        <MetricTile
          label="Net income"
          value={formatCurrency(netIncomeCents)}
          meta={netIncomeCents >= 0 ? "After expenses" : "Below break-even"}
          tone={monthlyNetTone}
          icon={<ToneIcon value={netIncomeCents} className={monthlyNetTone.text} />}
        />
      </div>

      <div className="mt-5 grid gap-3 border-t border-[color:color-mix(in_srgb,var(--line)_84%,transparent)] pt-4 sm:grid-cols-3">
        <MetricTile label="Year-to-date income" value={formatCurrency(ytdIncomeCents)} meta="Rent and other income" />
        <MetricTile label="Year-to-date expenses" value={formatCurrency(ytdExpensesCents)} meta="Operating costs recorded" />
        <MetricTile
          label="Year-to-date net"
          value={formatCurrency(ytdNetCents)}
          meta={ytdNetCents >= 0 ? "Net positive so far" : "Net negative so far"}
          tone={ytdNetTone}
          icon={<ToneIcon value={ytdNetCents} className={ytdNetTone.text} />}
        />
      </div>
    </section>
  );
}
