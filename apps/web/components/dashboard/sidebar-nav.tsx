"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "vaul";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  FileSignature,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Settings,
  SunMedium,
  UserPlus,
  Wrench,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { UserMenuPopover } from "@/components/dashboard/user-menu-popover";
import { GlobalSearch, type GlobalSearchItem } from "@/components/dashboard/global-search";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { useDomusTheme } from "@/components/theme-provider";
import type { DomusTheme } from "@/lib/theme";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
  href?: string;
  description?: string;
  clickHint?: string;
}

interface SidebarNavProps {
  userEmail: string;
  role: string;
  fullName?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  navPreset?: "default" | "tenant";
  onSignOut: (formData: FormData) => Promise<void>;
  items?: NavItem[];
  activeItemId?: string;
  onSelectItem?: (id: string) => void;
  unreadNotificationCount?: number;
  searchItems?: GlobalSearchItem[];
  reportsHref?: string | null;
}

const defaultNavItems: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    description: "High-level property and lease snapshot.",
    clickHint: "open the dashboard summary",
  },
  {
    id: "charges",
    label: "Charges",
    icon: Receipt,
    description: "Rent charges and due-date tracking.",
    clickHint: "open billing charges",
  },
  {
    id: "payments",
    label: "Payments",
    icon: CreditCard,
    description: "Recent payment history and status.",
    clickHint: "open payment records",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    description: "Maintenance tickets and progress.",
    clickHint: "open maintenance workflow",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    description: "System alerts and unread activity.",
    clickHint: "open notifications",
  },
  {
    id: "ownership",
    label: "Ownership",
    icon: UserPlus,
    description: "LLC accounts and co-owner membership.",
    clickHint: "open ownership settings",
  },
  {
    id: "invitations",
    label: "Invitations",
    icon: UserPlus,
    description: "Tenant, manager, and owner invites.",
    clickHint: "open invitation tools",
  },
  {
    id: "documents",
    label: "Documents",
    icon: FileSignature,
    description: "Lease packets and property file vault.",
    clickHint: "open document tools",
  },
  {
    id: "vendors",
    label: "Vendors",
    icon: BriefcaseBusiness,
    description: "Vendor directory and assignment options.",
    clickHint: "open vendor management",
  },
  {
    id: "operations",
    label: "Operations",
    icon: Settings,
    description: "Create properties, units, and leases.",
    clickHint: "open operations forms",
  },
  {
    id: "portfolio",
    label: "Portfolio",
    icon: Building2,
    description: "Property list and property-level edits.",
    clickHint: "open portfolio list",
  },
  {
    id: "units",
    label: "Units",
    icon: Building2,
    description: "Unit inventory and rent defaults.",
    clickHint: "open unit management",
  },
  {
    id: "leases",
    label: "Leases",
    icon: FileText,
    description: "Lease terms and lease lifecycle.",
    clickHint: "open lease management",
  },
];

const tenantNavItems: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    href: "/tenant?section=overview",
    description: "Summary of rent, tickets, and alerts.",
    clickHint: "open overview",
  },
  {
    id: "charges",
    label: "Charges",
    icon: Receipt,
    href: "/tenant?section=charges",
    description: "Outstanding and late rent charges.",
    clickHint: "open charges",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    href: "/tenant?section=maintenance",
    description: "Maintenance requests and status.",
    clickHint: "open maintenance",
  },
  {
    id: "documents",
    label: "Documents",
    icon: FileSignature,
    href: "/tenant?section=documents",
    description: "Lease packets and shared files.",
    clickHint: "open documents",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    href: "/tenant?section=notifications",
    description: "Unread and historical alerts.",
    clickHint: "open notifications",
  },
];

const themeOptions: Array<{ value: DomusTheme; label: string; icon: typeof SunMedium }> = [
  { value: "atlas-light", label: "Atlas", icon: SunMedium },
  { value: "noctis-neon", label: "Noctis", icon: Moon },
  { value: "imperium-night", label: "Imperium", icon: Moon },
];

function getNavTitle(item: NavItem) {
  const description = item.description ?? `${item.label} section.`;
  const clickHint = item.clickHint ?? (item.href ? `open ${item.label}.` : `show the ${item.label} section.`);
  return `${description} Click to ${clickHint}`;
}

function getDisplayName({
  nickname,
  fullName,
  userEmail,
}: {
  nickname?: string | null;
  fullName?: string | null;
  userEmail: string;
}) {
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

function resolveNavItems(items: NavItem[] | undefined, navPreset: "default" | "tenant") {
  return items ?? (navPreset === "tenant" ? tenantNavItems : defaultNavItems);
}

function navButtonClasses(isActive: boolean, mobile = false) {
  return [
    "flex w-full items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[13px] transition-all",
    mobile ? "justify-start" : "",
    isActive
      ? "bg-white/20 text-white shadow-sm"
      : "text-white/60 hover:bg-white/15 hover:text-white",
  ].join(" ");
}

function ThemeToggleGroup() {
  const { theme, setTheme } = useDomusTheme();

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Theme</p>
      <div className="grid grid-cols-3 gap-2">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const active = option.value === theme;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={[
                "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition",
                active
                  ? "border-white/30 bg-white/20 text-white"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
              ].join(" ")}
              title={`Apply ${option.label} theme.`}
            >
              <Icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface NavListProps {
  navItems: NavItem[];
  activeItemId?: string;
  onSelectItem?: (id: string) => void;
  mobile?: boolean;
}

function NavList({ navItems, activeItemId, onSelectItem, mobile = false }: NavListProps) {
  return (
    <>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeItemId === item.id;
        const className = `${navButtonClasses(isActive, mobile)} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900`;

        if (item.href) {
          const content = (
            <a key={item.id} href={item.href} className={className} title={getNavTitle(item)}>
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
              {typeof item.badgeCount === "number" && item.badgeCount > 0 ? (
                <Badge variant="warning" className="ml-auto min-w-[1.5rem] justify-center rounded-full px-1.5 py-0 text-[10px]">
                  {item.badgeCount}
                </Badge>
              ) : null}
            </a>
          );
          return mobile ? <Drawer.Close asChild key={item.id}>{content}</Drawer.Close> : content;
        }

        if (onSelectItem) {
          const content = (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(item.id)}
              className={className}
              title={getNavTitle(item)}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
              {typeof item.badgeCount === "number" && item.badgeCount > 0 ? (
                <Badge variant="warning" className="ml-auto min-w-[1.5rem] justify-center rounded-full px-1.5 py-0 text-[10px]">
                  {item.badgeCount}
                </Badge>
              ) : null}
            </button>
          );
          return mobile ? <Drawer.Close asChild key={item.id}>{content}</Drawer.Close> : content;
        }

        const content = (
          <a key={item.id} href={`#${item.id}`} className={className} title={getNavTitle(item)}>
            <Icon className="h-4 w-4" />
            <span className="truncate">{item.label}</span>
            {typeof item.badgeCount === "number" && item.badgeCount > 0 ? (
              <Badge variant="warning" className="ml-auto min-w-[1.5rem] justify-center rounded-full px-1.5 py-0 text-[10px]">
                {item.badgeCount}
              </Badge>
            ) : null}
          </a>
        );
        return mobile ? <Drawer.Close asChild key={item.id}>{content}</Drawer.Close> : content;
      })}
    </>
  );
}

export function SidebarNav({
  userEmail,
  role,
  fullName,
  nickname,
  avatarUrl,
  navPreset = "default",
  items,
  activeItemId,
  onSelectItem,
  unreadNotificationCount = 0,
  searchItems = [],
  reportsHref = null,
}: SidebarNavProps) {
  const pathname = usePathname();
  const navItems = resolveNavItems(items, navPreset);
  const workspacePath = role === "owner" ? "/owner" : role === "manager" ? "/manager" : "/tenant";
  const displayName = getDisplayName({ nickname, fullName, userEmail });
  const showWorkspaceButton = pathname !== workspacePath;
  const notificationHref = role === "tenant" ? "/tenant?section=notifications" : `${workspacePath}#notifications`;

  const notificationButton = onSelectItem ? (
    <button
      type="button"
      onClick={() => onSelectItem("notifications")}
      className="relative flex items-center justify-center rounded-[10px] border border-white/15 bg-white/10 px-3 py-2 text-white/85 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
      title="Open notifications."
      aria-label="Open notifications"
    >
      <Bell className="h-4 w-4" />
      {unreadNotificationCount > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
          {unreadNotificationCount}
        </span>
      ) : null}
    </button>
  ) : (
    <a
      href={notificationHref}
      className="relative flex items-center justify-center rounded-[10px] border border-white/15 bg-white/10 px-3 py-2 text-white/85 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
      title="Open notifications."
      aria-label="Open notifications"
    >
      <Bell className="h-4 w-4" />
      {unreadNotificationCount > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
          {unreadNotificationCount}
        </span>
      ) : null}
    </a>
  );

  return (
    <aside className="gradient-sidebar hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[260px] lg:flex-shrink-0 lg:flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/15 text-lg font-bold text-white shadow-lg shadow-violet-950/25 backdrop-blur-sm">
          D
        </div>
        <div>
          <div className="text-base font-bold text-white">Domus</div>
        </div>
      </div>

      <div className="space-y-2 px-3 pb-3">
        {searchItems.length > 0 ? <GlobalSearch items={searchItems} /> : null}
        <Link
          href="/settings"
          className="block rounded-[10px] border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          title="Open full settings page."
        >
          Settings
        </Link>
        {reportsHref ? (
          <Link
            href={reportsHref}
            className="flex items-center gap-2 rounded-[10px] border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            title="Open financial reports."
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Reports
          </Link>
        ) : null}
        {showWorkspaceButton ? (
          <Link
            href={workspacePath}
            className="block rounded-[10px] border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            title="Return to your main workspace for this role."
          >
            {role === "owner" ? "Owner Workspace" : role === "manager" ? "Manager Workspace" : "Tenant Workspace"}
          </Link>
        ) : null}
        <div className="flex justify-end">{notificationButton}</div>
      </div>

      <nav aria-label="Main navigation" className="flex-1 min-h-0 space-y-1 overflow-y-auto px-3 pb-4">
        <NavList navItems={navItems} activeItemId={activeItemId} onSelectItem={onSelectItem} />
      </nav>

      <div className="shrink-0 border-t border-white/[0.12] px-5 py-4">
        <UserMenuPopover
          displayName={displayName}
          role={role}
          userEmail={userEmail}
          avatarUrl={avatarUrl}
          placement="top"
        />
      </div>
    </aside>
  );
}

export function MobileTopBar({
  userEmail,
  role,
  fullName,
  nickname,
  avatarUrl,
  navPreset = "default",
  items,
  activeItemId,
  onSignOut,
  onSelectItem,
  unreadNotificationCount = 0,
  searchItems = [],
  reportsHref = null,
}: Pick<
  SidebarNavProps,
  | "userEmail"
  | "role"
  | "fullName"
  | "nickname"
  | "avatarUrl"
  | "navPreset"
  | "items"
  | "activeItemId"
  | "onSignOut"
  | "onSelectItem"
  | "unreadNotificationCount"
  | "searchItems"
  | "reportsHref"
>) {
  const pathname = usePathname();
  const navItems = resolveNavItems(items, navPreset);
  const workspacePath = role === "owner" ? "/owner" : role === "manager" ? "/manager" : "/tenant";
  const displayName = getDisplayName({ nickname, fullName, userEmail });
  const showWorkspaceButton = pathname !== workspacePath;
  const notificationHref = role === "tenant" ? "/tenant?section=notifications" : `${workspacePath}#notifications`;

  return (
    <div className="gradient-sidebar px-4 py-3 shadow-lg lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white">D</div>
          <div>
            <span className="block text-sm font-bold text-white">Domus</span>
            <span className="block text-[10px] uppercase tracking-wide text-white/60">{role}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSelectItem ? (
            <button
              type="button"
              onClick={() => onSelectItem("notifications")}
              className="relative rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              title="Open notifications."
              aria-label="Open notifications"
            >
              <Bell className="h-3.5 w-3.5" />
              {unreadNotificationCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                  {unreadNotificationCount}
                </span>
              ) : null}
            </button>
          ) : (
            <a
              href={notificationHref}
              className="relative rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              title="Open notifications."
              aria-label="Open notifications"
            >
              <Bell className="h-3.5 w-3.5" />
              {unreadNotificationCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                  {unreadNotificationCount}
                </span>
              ) : null}
            </a>
          )}

          <UserMenuPopover
            displayName={displayName}
            role={role}
            userEmail={userEmail}
            avatarUrl={avatarUrl}
            placement="bottom"
            compact
          />

          <MobileDrawer
            className="gradient-sidebar border-t border-white/10 text-white"
            trigger={
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/80 transition-colors hover:bg-white/10"
                aria-label="Open navigation menu"
                title="Open navigation menu."
              >
                <Menu className="h-5 w-5" />
              </button>
            }
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 pb-1">
                <div>
                  <p className="text-sm font-semibold text-white">{displayName}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">{role}</p>
                </div>
                <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                  {unreadNotificationCount} unread
                </Badge>
              </div>

              {searchItems.length > 0 ? <GlobalSearch items={searchItems} /> : null}

              <div className="grid grid-cols-1 gap-2">
                <Drawer.Close asChild>
                  <Link
                    href="/settings"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                    title="Open full settings page."
                  >
                    Settings
                  </Link>
                </Drawer.Close>
                {reportsHref ? (
                  <Drawer.Close asChild>
                    <Link
                      href={reportsHref}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                      title="Open financial reports."
                    >
                      <BarChart3 className="h-4 w-4" />
                      Reports
                    </Link>
                  </Drawer.Close>
                ) : null}
                {showWorkspaceButton ? (
                  <Drawer.Close asChild>
                    <Link
                      href={workspacePath}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                      title="Return to your main workspace for this role."
                    >
                      {role === "owner" ? "Owner Workspace" : role === "manager" ? "Manager Workspace" : "Tenant Workspace"}
                    </Link>
                  </Drawer.Close>
                ) : null}
              </div>

              <nav aria-label="Main navigation" className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-2">
                <NavList navItems={navItems} activeItemId={activeItemId} onSelectItem={onSelectItem} mobile />
              </nav>

              <ThemeToggleGroup />

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Signed in as</p>
                    <p className="text-xs text-white/60">{userEmail}</p>
                  </div>
                  <LogOut className="h-4 w-4 text-white/60" />
                </div>
                <form action={onSignOut} className="mt-3">
                  <SubmitButton className="w-full" variant="outline" title="Sign out of Domus.">
                    Sign out
                  </SubmitButton>
                </form>
              </div>
            </div>
          </MobileDrawer>
        </div>
      </div>
    </div>
  );
}
