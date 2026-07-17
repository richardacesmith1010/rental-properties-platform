"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CreditCard,
  Home,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { DashboardData } from "@/lib/dashboard";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/count-up";
import { useTimeOfDayGreeting } from "./use-time-of-day-greeting";

interface DashboardHeaderProps {
  role: DashboardData["profileRole"];
  kpis: DashboardData["kpis"];
  occupancy: number;
  propertyCount?: number;
  userEmail: string;
  nickname?: string | null;
  fullName?: string | null;
  gamificationSummary?: ReactNode;
  greetingContent?: ReactNode;
}

function getDisplayName({
  nickname,
  fullName,
  userEmail,
}: Pick<DashboardHeaderProps, "nickname" | "fullName" | "userEmail">) {
  const trimmedNickname = nickname?.trim();
  if (trimmedNickname) {
    return trimmedNickname;
  }

  const firstName = fullName?.trim().split(/\s+/)[0];
  if (firstName) {
    return firstName;
  }

  return userEmail;
}

function formatHeaderDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function HeaderStat({
  icon: Icon,
  label,
  target,
  prefix,
  suffix,
  decimals = 0,
}: {
  icon: typeof Sparkles;
  label: string;
  target: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  return (
    <div className="domus-card flex min-w-[150px] flex-1 items-start gap-3 px-4 py-4 shadow-sm">
      <div className="rounded-2xl bg-[var(--surface-2)] p-2 text-[var(--accent)]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <CountUp
          target={target}
          prefix={prefix}
          suffix={suffix}
          decimals={decimals}
          duration={1200}
          className="tabular-nums text-[25px] font-[660] tracking-[-0.025em] text-[var(--ink)]"
        />
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          {label}
        </p>
      </div>
    </div>
  );
}

export function DashboardHeader({
  role,
  kpis,
  occupancy,
  propertyCount = 0,
  userEmail,
  nickname,
  fullName,
  gamificationSummary,
  greetingContent,
}: DashboardHeaderProps) {
  const displayName = getDisplayName({ nickname, fullName, userEmail });
  const greeting = useTimeOfDayGreeting(18);
  const now = new Date();

  const stats =
    role === "manager"
      ? [
          {
            icon: Building2,
            label: "Properties managed",
            target: propertyCount,
          },
          {
            icon: Wrench,
            label: "Open tickets",
            target: kpis.openMaintenanceCount,
          },
          {
            icon: AlertTriangle,
            label: "High priority",
            target: kpis.highPriorityMaintenanceCount,
          },
          {
            icon: CreditCard,
            label: "Late accounts",
            target: kpis.lateAccountCount,
          },
        ]
      : [
          {
            icon: Sparkles,
            label: "Monthly revenue",
            target: kpis.monthlyGrossRentCents / 100,
            prefix: "$",
          },
          {
            icon: Home,
            label: "Occupancy",
            target: occupancy,
            suffix: "%",
          },
          {
            icon: Wrench,
            label: "Open tickets",
            target: kpis.openMaintenanceCount,
          },
          {
            icon: AlertTriangle,
            label: "Overdue charges",
            target: kpis.lateAccountCount,
          },
        ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {role}
            </Badge>
            <span
              suppressHydrationWarning
              className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--line)_84%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)] shadow-sm backdrop-blur-sm"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {formatHeaderDate(now)}
            </span>
          </div>
          {greetingContent ?? (
            <>
              <h1 className="text-[22px] font-[640] tracking-[-0.02em] text-[var(--ink)] sm:text-[28px]">
                {greeting ? `${greeting}, ${displayName}` : displayName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
                Keep revenue, maintenance, and resident activity moving without leaving the dashboard.
              </p>
            </>
          )}
        </div>
        {gamificationSummary ? <div className="w-full xl:max-w-md">{gamificationSummary}</div> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {stats.map((stat) => (
          <HeaderStat key={stat.label} {...stat} />
        ))}
      </div>
    </div>
  );
}
