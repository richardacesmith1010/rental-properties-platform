"use client";

import { formatCurrency } from "@/lib/format";
import { useTimeOfDayGreeting } from "./use-time-of-day-greeting";

interface ContextualGreetingProps {
  userName: string;
  tenantsBehindCount: number;
  lateRentCents: number;
  openTicketCount: number;
}

export function ContextualGreeting({
  userName,
  tenantsBehindCount,
  lateRentCents,
  openTicketCount
}: ContextualGreetingProps) {
  const greeting = useTimeOfDayGreeting();

  let summary = "Everything looks good - no action items today";
  if (tenantsBehindCount > 0) {
    summary = tenantsBehindCount === 1
      ? `1 tenant is behind on rent (${formatCurrency(lateRentCents)}).`
      : `${tenantsBehindCount} tenants are behind on rent (${formatCurrency(lateRentCents)}).`;
  } else if (openTicketCount > 0) {
    summary = `${openTicketCount} maintenance ticket${openTicketCount === 1 ? "" : "s"} need attention`;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        {greeting ? `${greeting}, ${userName}` : userName}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
    </div>
  );
}
