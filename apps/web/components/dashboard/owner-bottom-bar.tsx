"use client";

import { BarChart3, Building2, Home, Menu, MessageCircle, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useDomusTheme } from "@/components/theme-provider";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { ownerMenuGroups } from "./dashboard-config";
import type { NavItem } from "./sidebar/nav-items";

interface OwnerBottomBarProps {
  items?: NavItem[];
  activeItemId?: string;
  onSelectItem?: (id: string) => void;
  onOpenMore?: () => void;
  unreadNotificationCount?: number;
}

type OwnerTab = "Home" | "Money" | "Homes" | "Messages" | "More";

export function resolveOwnerTab(pathname: string, section?: string | null): OwnerTab {
  if (pathname === "/owner/money" || pathname === "/owner/bank") return "Money";
  if (pathname.startsWith("/owner/properties/")) return "Homes";
  if (pathname !== "/owner") return "More";
  if (!section || section === "overview" || section === "daily-ops-home") return "Home";
  if (["portfolio", "units", "leases", "tenants"].includes(section)) return "Homes";
  if (section === "inbox") return "Messages";
  return "More";
}

function tabHref(tab: OwnerTab, search: string) {
  const current = new URLSearchParams(search);
  const params = new URLSearchParams();
  for (const key of ["account", "property"]) {
    const value = current.get(key);
    if (value) params.set(key, value);
  }
  if (tab === "Homes") params.set("section", "portfolio");
  if (tab === "Messages") params.set("section", "inbox");
  const pathname = tab === "Money" ? "/owner/money" : "/owner";
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

function StandaloneDrawer({ open, onOpenChange, search }: {
  open: boolean; onOpenChange: (open: boolean) => void; search: string;
}) {
  const { theme, setTheme } = useDomusTheme();
  return <MobileDrawer open={open} onOpenChange={onOpenChange}>
    <div className="space-y-5">
      {ownerMenuGroups.map((group) => <div key={group.label}>
        <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{group.label}</p>
        {group.items.filter(([id]) => id !== "members" && id !== "manager-payments").map(([id, label]) => {
          const params = new URLSearchParams(search);
          params.set("section", id);
          const account = new URLSearchParams(search).get("account");
          return <div key={id}>
            <a href={`/owner?${params}`} title={`Open ${label}.`}
              className="sidebar-shell-button block min-h-11 px-3 py-3 text-sm">{label}</a>
            {id === "analytics" ? <a href={`/owner/reports${account !== null ? `?account=${encodeURIComponent(account)}` : ""}`}
              title="Open Reports." className="sidebar-shell-button block min-h-11 px-3 py-3 text-sm">Reports</a> : null}
          </div>;
        })}
      </div>)}
      <a href="/settings" title="Open settings." className="sidebar-shell-button block min-h-11 px-3 py-3 text-sm">Settings</a>
      <div className="flex gap-2" aria-label="Theme">
        {(["light", "dark", "system"] as const).map((value) => <button key={value} type="button"
          aria-pressed={theme === value} title={`Use ${value} theme.`} onClick={() => setTheme(value)}
          className="sidebar-shell-button min-h-11 flex-1 px-2 text-xs capitalize">{value}</button>)}
      </div>
    </div>
  </MobileDrawer>;
}

export function OwnerBottomBar({ items = [], activeItemId, onSelectItem, onOpenMore,
  unreadNotificationCount = 0 }: OwnerBottomBarProps) {
  const pathname = usePathname();
  const [location, setLocation] = useState<{ pathname: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<OwnerTab | null>(null);
  useEffect(() => setSelectedTab(null), [activeItemId, pathname]);
  useEffect(() => {
    setLocation({ pathname: pathname ?? window.location.pathname });
  }, [pathname]);
  if (!location) return null;
  const search = window.location.search;

  const section = location.pathname === "/owner"
    ? activeItemId ?? new URLSearchParams(search).get("section") : undefined;
  const active = selectedTab ?? resolveOwnerTab(location.pathname, section);
  const lateCount = items.find((item) => item.id === "charges")?.badgeCount ?? 0;
  const inboxCount = items.find((item) => item.id === "inbox")?.badgeCount ?? 0;
  const tabs: Array<{ label: OwnerTab; icon: LucideIcon; count?: number }> = [
    { label: "Home", icon: Home, count: lateCount },
    { label: "Money", icon: BarChart3 },
    { label: "Homes", icon: Building2 },
    { label: "Messages", icon: MessageCircle, count: inboxCount },
    { label: "More", icon: Menu, count: unreadNotificationCount }
  ];
  const bar = <>
    <nav aria-label="Owner shortcuts" className="fixed inset-x-0 bottom-0 z-40 grid h-[84px] grid-cols-5
      border-t border-[var(--ink)] bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)]
      px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-[20px] lg:hidden">
      {tabs.map(({ label, icon: Icon, count }) => {
        const selected = active === label;
        const badgeLabel = label === "Home" ? `${count} late rent payments` :
          label === "More" ? `${count} unread notifications` : `${count} unread`;
        const common = `relative flex min-h-11 flex-col items-center justify-center gap-0.5 px-1
          text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-[var(--accent)]
          ${selected ? "text-[var(--ink)]" : "text-[var(--faint)] hover:text-[var(--ink)]"}`;
        const children = <><Icon size={24} strokeWidth={2} aria-hidden="true" />
          <span aria-hidden={Boolean(count)}>{label}</span>
          {count ? <span aria-hidden="true" className="absolute right-2 top-1 min-w-4 rounded-full
            bg-[var(--crit)] px-1 text-center text-[10px] leading-4 text-white">{count}</span> : null}</>;
        return label === "More" ? <button key={label} type="button" title="Open more navigation."
          aria-label={count ? `More, ${badgeLabel}` : "More"}
          aria-current={selected ? "page" : undefined} className={common}
          onClick={() => onOpenMore ? onOpenMore() : setDrawerOpen(true)}>{children}</button>
          : label === "Money" ? <Link key={label} href={tabHref(label, search)} prefetch title={`Open ${label}.`}
            aria-label={label} aria-current={selected ? "page" : undefined} className={common}>{children}</Link>
          : <a key={label} href={tabHref(label, search)} title={`Open ${label}.`}
            onClick={(event) => {
              event.currentTarget.href = tabHref(label, window.location.search);
              if (!onSelectItem || location.pathname !== "/owner" || event.button !== 0 ||
                event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              const id = label === "Home" ? "overview" : label === "Homes" ? "portfolio" : "inbox";
              setSelectedTab(label);
              onSelectItem(id);
            }}
            aria-label={count ? `${label}, ${badgeLabel}` : label}
            aria-current={selected ? "page" : undefined} className={common}>{children}</a>;
      })}
    </nav>
    {!onOpenMore ? <StandaloneDrawer open={drawerOpen} onOpenChange={setDrawerOpen} search={search} /> : null}
  </>;
  return createPortal(bar, document.body);
}
