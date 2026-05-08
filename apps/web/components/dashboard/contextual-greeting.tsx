"use client";

import { formatCurrency } from "@/lib/format";
import { useTimeOfDayGreeting } from "./use-time-of-day-greeting";

interface ContextualGreetingProps {
  userName: string;
  overdueChargeCount: number;
  overdueAmountCents: number;
  openTicketCount: number;
}

export function ContextualGreeting({
  userName,
  overdueChargeCount,
  overdueAmountCents,
  openTicketCount
}: ContextualGreetingProps) {
  const greeting = useTimeOfDayGreeting();

  let summary = "Everything looks good - no action items today";
  if (overdueChargeCount > 0) {
    summary = `You have ${overdueChargeCount} overdue charge${overdueChargeCount === 1 ? "" : "s"} totaling ${formatCurrency(overdueAmountCents)}`;
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
