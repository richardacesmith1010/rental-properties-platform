import type { ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CreditCard,
  Home,
  Sparkles,
  Wrench
} from "lucide-react";
import type { DashboardData } from "@/lib/dashboard";
import { formatCurrency } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

interface DashboardHeaderProps {
  role: DashboardData["profileRole"];
  kpis: DashboardData["kpis"];
  occupancy: number;
  propertyCount?: number;
  userEmail: string;
  nickname?: string | null;
  fullName?: string | null;
  gamificationSummary?: ReactNode;
}

function getDisplayName({
  nickname,
  fullName,
  userEmail
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

function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

function formatHeaderDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function HeaderStat({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
}) {
  return (
    <div className="domus-kpi-pill flex min-w-[150px] flex-1 items-start gap-3">
      <div className="rounded-2xl bg-violet-500/10 p-2 text-violet-600">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-tabular text-base font-bold domus-heading">{value}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.16em] domus-muted">{label}</p>
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
  gamificationSummary
}: DashboardHeaderProps) {
  const displayName = getDisplayName({ nickname, fullName, userEmail });
  const now = new Date();

  const stats =
    role === "manager"
      ? [
          {
            icon: Building2,
            label: "Properties managed",
            value: propertyCount.toLocaleString()
          },
          {
            icon: Wrench,
            label: "Open tickets",
            value: kpis.openMaintenanceCount.toLocaleString()
          },
          {
            icon: AlertTriangle,
            label: "High priority",
            value: kpis.highPriorityMaintenanceCount.toLocaleString()
          },
          {
            icon: CreditCard,
            label: "Late accounts",
            value: kpis.lateAccountCount.toLocaleString()
          }
        ]
      : [
          {
            icon: Sparkles,
            label: "Monthly revenue",
            value: formatCurrency(kpis.monthlyGrossRentCents)
          },
          {
            icon: Home,
            label: "Occupancy",
            value: `${occupancy}%`
          },
          {
            icon: Wrench,
            label: "Open tickets",
            value: kpis.openMaintenanceCount.toLocaleString()
          },
          {
            icon: AlertTriangle,
            label: "Overdue charges",
            value: kpis.lateAccountCount.toLocaleString()
          }
        ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {role}
            </Badge>
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white/70 px-3 py-1 text-xs font-medium domus-muted shadow-sm backdrop-blur-sm">
              <CalendarClock className="h-3.5 w-3.5" />
              {formatHeaderDate(now)}
            </span>
          </div>
          <h1 className="domus-heading text-3xl font-bold tracking-tight">
            {getGreeting(now)}, {displayName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm domus-muted">
            Keep revenue, maintenance, and resident activity moving without leaving the dashboard.
          </p>
        </div>
        {gamificationSummary ? (
          <div className="w-full xl:max-w-md">{gamificationSummary}</div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {stats.map((stat) => (
          <HeaderStat key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} />
        ))}
      </div>
    </div>
  );
}
