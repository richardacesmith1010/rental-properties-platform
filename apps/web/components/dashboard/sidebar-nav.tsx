"use client";

import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Receipt,
  CreditCard,
  Wrench,
  Bell,
  UserPlus,
  Settings,
  Building2,
  FileText,
  FileSignature,
  BriefcaseBusiness,
  LogOut,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  description?: string;
  clickHint?: string;
}

interface SidebarNavProps {
  userEmail: string;
  occupancy: number;
  activeLeaseCount: number;
  role: string;
  navPreset?: "default" | "tenant";
  showTesterLink?: boolean;
  onSignOut: (formData: FormData) => Promise<void>;
  items?: NavItem[];
  activeItemId?: string;
  onSelectItem?: (id: string) => void;
  snapshot?: {
    label: string;
    value: string;
    note: string;
  };
}

const defaultNavItems: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    description: "High-level property and lease snapshot.",
    clickHint: "open the dashboard summary"
  },
  {
    id: "charges",
    label: "Charges",
    icon: Receipt,
    description: "Rent charges and due-date tracking.",
    clickHint: "open billing charges"
  },
  {
    id: "payments",
    label: "Payments",
    icon: CreditCard,
    description: "Recent payment history and status.",
    clickHint: "open payment records"
  },
  {
    id: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    description: "Maintenance tickets and progress.",
    clickHint: "open maintenance workflow"
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    description: "System alerts and unread activity.",
    clickHint: "open notifications"
  },
  {
    id: "ownership",
    label: "Ownership",
    icon: UserPlus,
    description: "LLC accounts and co-owner membership.",
    clickHint: "open ownership settings"
  },
  {
    id: "invitations",
    label: "Invitations",
    icon: UserPlus,
    description: "Tenant, manager, and owner invites.",
    clickHint: "open invitation tools"
  },
  {
    id: "documents",
    label: "Documents",
    icon: FileSignature,
    description: "Lease packets and property file vault.",
    clickHint: "open document tools"
  },
  {
    id: "vendors",
    label: "Vendors",
    icon: BriefcaseBusiness,
    description: "Vendor directory and assignment options.",
    clickHint: "open vendor management"
  },
  {
    id: "operations",
    label: "Operations",
    icon: Settings,
    description: "Create properties, units, and leases.",
    clickHint: "open operations forms"
  },
  {
    id: "portfolio",
    label: "Portfolio",
    icon: Building2,
    description: "Property list and property-level edits.",
    clickHint: "open portfolio list"
  },
  {
    id: "units",
    label: "Units",
    icon: Building2,
    description: "Unit inventory and rent defaults.",
    clickHint: "open unit management"
  },
  {
    id: "leases",
    label: "Leases",
    icon: FileText,
    description: "Lease terms and lease lifecycle.",
    clickHint: "open lease management"
  },
];

function getNavTitle(item: NavItem) {
  const description = item.description ?? `${item.label} section.`;
  const clickHint =
    item.clickHint ?? (item.href ? `open ${item.label}.` : `show the ${item.label} section.`);
  return `${description} Click to ${clickHint}`;
}

export function SidebarNav({
  userEmail,
  occupancy,
  activeLeaseCount,
  role,
  navPreset = "default",
  showTesterLink = false,
  onSignOut,
  items,
  activeItemId,
  onSelectItem,
  snapshot,
}: SidebarNavProps) {
  const [tenantPreviewParam, setTenantPreviewParam] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("testerPreview") === "true") {
      setTenantPreviewParam("&testerPreview=true");
    }
  }, []);

  const navItems =
    items ??
    (navPreset === "tenant"
      ? [
          {
            id: "overview",
            label: "Overview",
            icon: LayoutDashboard,
            href: `/tenant?section=overview${tenantPreviewParam}`,
            description: "Summary of rent, tickets, and alerts.",
            clickHint: "open overview"
          },
          {
            id: "charges",
            label: "Charges",
            icon: Receipt,
            href: `/tenant?section=charges${tenantPreviewParam}`,
            description: "Outstanding and late rent charges.",
            clickHint: "open charges"
          },
          {
            id: "maintenance",
            label: "Maintenance",
            icon: Wrench,
            href: `/tenant?section=maintenance${tenantPreviewParam}`,
            description: "Maintenance requests and status.",
            clickHint: "open maintenance"
          },
          {
            id: "documents",
            label: "Documents",
            icon: FileSignature,
            href: `/tenant?section=documents${tenantPreviewParam}`,
            description: "Lease packets and shared files.",
            clickHint: "open documents"
          },
          {
            id: "notifications",
            label: "Notifications",
            icon: Bell,
            href: `/tenant?section=notifications${tenantPreviewParam}`,
            description: "Unread and historical alerts.",
            clickHint: "open notifications"
          }
        ]
      : defaultNavItems);
  const renderedNavItems = showTesterLink
    ? [
        ...navItems,
        {
          id: "tester",
          label: "Tester",
          icon: FlaskConical,
          href: "/tester",
          description: "Diagnostics workspace and feature checks.",
          clickHint: "open tester tools"
        }
      ]
    : navItems;
  const summary = snapshot ?? {
    label: "Snapshot",
    value: `${occupancy}% occupied`,
    note: `${activeLeaseCount} active leases`
  };
  const workspacePath = role === "owner" ? "/owner" : role === "manager" ? "/manager" : "/tenant";

  return (
    <aside className="gradient-sidebar hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[260px] lg:flex-shrink-0 lg:flex-col lg:overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/15 text-lg font-bold text-white shadow-lg shadow-indigo-950/25 backdrop-blur-sm">
          D
        </div>
        <div>
          <div className="text-base font-bold text-white">Domus</div>
          <div className="text-[11px] text-white/60">Property Management</div>
        </div>
      </div>

      <div className="space-y-2 px-3 pb-3">
        <a
          href="/settings"
          className="block rounded-[10px] border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/20"
          title="Open full settings page."
        >
          Settings
        </a>
        <a
          href="/portal"
          className="block rounded-[10px] border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/20"
          title="Go to the role home screen while staying signed in."
        >
          Portal Home
        </a>
        <a
          href={workspacePath}
          className="block rounded-[10px] border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/20"
          title="Return to your main workspace for this role."
        >
          {role === "owner" ? "Owner Workspace" : role === "manager" ? "Manager Workspace" : "Tenant Workspace"}
        </a>
        {showTesterLink && (
          <a
            href="/tester"
            className="block rounded-[10px] border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/20"
            title="Open tester diagnostics mode."
          >
            Tester Mode
          </a>
        )}
      </div>

      <nav className="flex-1 min-h-0 space-y-1 overflow-y-auto px-3 pb-4">
        {renderedNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItemId === item.id;
          const itemClassName = [
            "flex w-full items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[13px] transition-all",
            isActive
              ? "bg-white/20 text-white shadow-sm"
              : "text-white/60 hover:bg-white/15 hover:text-white"
          ].join(" ");

          if (item.href) {
            return (
              <a key={item.id} href={item.href} className={itemClassName} title={getNavTitle(item)}>
                <Icon className="h-4 w-4" />
                {item.label}
              </a>
            );
          }

          if (onSelectItem) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item.id)}
                className={itemClassName}
                title={getNavTitle(item)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          }

          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={itemClassName}
              title={getNavTitle(item)}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="mx-4 mb-3 shrink-0 rounded-xl border border-white/15 bg-white/10 p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
          {summary.label}
        </p>
        <p className="mt-1 text-xl font-extrabold text-white">{summary.value}</p>
        <p className="text-xs text-white/50">{summary.note}</p>
      </div>

      <div className="shrink-0 border-t border-white/[0.12] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-xs font-semibold text-white">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">{userEmail}</p>
            <p className="text-[11px] text-white/40 capitalize">{role}</p>
          </div>
        </div>
        <form action={onSignOut} className="mt-3">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/15 hover:text-white"
            title="Sign out and return to login."
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function MobileTopBar({
  userEmail,
  role,
  showTesterLink = false,
  onSignOut,
}: Pick<SidebarNavProps, "userEmail" | "role" | "showTesterLink" | "onSignOut">) {
  const workspacePath = role === "owner" ? "/owner" : role === "manager" ? "/manager" : "/tenant";

  return (
    <div className="gradient-sidebar px-4 py-3 shadow-lg lg:hidden">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white">
          D
        </div>
        <div>
          <span className="block text-sm font-bold text-white">Domus</span>
          <span className="block text-[10px] uppercase tracking-wide text-white/60">
            {role}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <a
          href="/settings"
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-white/80 hover:bg-white/10"
          title="Open full settings page."
        >
          Settings
        </a>
        <a
          href={workspacePath}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-white/80 hover:bg-white/10"
          title="Open your role workspace."
        >
          Workspace
        </a>
        <a
          href="/portal"
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-white/80 hover:bg-white/10"
          title="Go to role home screen."
        >
          Home
        </a>
        {showTesterLink && (
          <a
            href="/tester"
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-white/80 hover:bg-white/10"
            title="Open tester diagnostics workspace."
          >
            Tester
          </a>
        )}
        <span className="max-w-[120px] truncate text-xs text-white/60">{userEmail}</span>
        <form action={onSignOut}>
          <button
            type="submit"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
            title="Sign out and return to login."
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
