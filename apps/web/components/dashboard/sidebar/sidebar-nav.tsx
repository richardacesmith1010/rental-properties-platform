"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { Menu, Search, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlobalSearch, type GlobalSearchItem } from "@/components/dashboard/global-search";
import { NotificationBellMenu } from "@/components/dashboard/notification-bell-menu";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { useDomusTheme } from "@/components/theme-provider";
import type { NotificationDTO } from "@/lib/notifications";
import {
  getDisplayName,
  getNavTitle,
  injectReportsNavItem,
  navButtonClasses,
  resolveNavItems,
  themeOptions,
  type NavItem
} from "./nav-items";
import { MobileUserFooter, SidebarUserFooter } from "./user-footer";
import type { StatefulAction } from "../types";

interface SidebarNavProps {
  userEmail: string;
  role: string;
  fullName?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  stripeConnected?: boolean;
  navPreset?: "default" | "tenant";
  onSignOut: (formData: FormData) => Promise<void>;
  items?: NavItem[];
  activeItemId?: string;
  onSelectItem?: (id: string) => void;
  unreadNotificationCount?: number;
  notifications?: NotificationDTO[];
  onDismissNotification?: StatefulAction;
  onClearAllNotifications?: StatefulAction;
  onSendBatchPaymentReminder?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onMarkManagerPaymentPaid?: StatefulAction;
  searchItems?: GlobalSearchItem[];
  onOpenCommandPalette?: () => void;
  commandPaletteEnabled?: boolean;
  reportsHref?: string | null;
  accountSwitcher?: ReactNode;
}

function CommandPaletteTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="sidebar-shell-panel flex w-full items-center justify-between px-3 py-2 text-left text-sm shadow-sm transition hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
      title="Open the command palette."
    >
      <span className="flex min-w-0 items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-white/80" />
        <span className="truncate">Search navigation, properties, tenants...</span>
      </span>
      <span className="hidden rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/80 sm:inline-flex">
        ⌘K
      </span>
    </button>
  );
}

function ThemeToggleGroup() {
  const { theme, setTheme } = useDomusTheme();

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] sidebar-shell-muted">Theme</p>
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
                  : "border-white/[0.14] bg-white/[0.08] text-white/80 hover:bg-white/[0.14] hover:text-white"
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
        const Icon: LucideIcon = item.icon;
        const isActive = activeItemId === item.id;
        const className = `${navButtonClasses(isActive, mobile)} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900`;

        if (item.href) {
          const content = (
            <a
              key={item.id}
              href={item.href}
              className={className}
              title={getNavTitle(item)}
              aria-current={isActive ? "page" : undefined}
            >
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
              aria-current={isActive ? "page" : undefined}
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
          <a
            key={item.id}
            href={`#${item.id}`}
            className={className}
            title={getNavTitle(item)}
            aria-current={isActive ? "page" : undefined}
          >
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
  stripeConnected,
  navPreset = "default",
  items,
  activeItemId,
  onSelectItem,
  unreadNotificationCount: _unreadNotificationCount = 0,
  notifications = [],
  onDismissNotification,
  onClearAllNotifications,
  onSendBatchPaymentReminder,
  onWaiveCharge,
  onMarkManagerPaymentPaid,
  searchItems = [],
  onOpenCommandPalette,
  commandPaletteEnabled = false,
  reportsHref = null,
  accountSwitcher
}: SidebarNavProps) {
  const pathname = usePathname();
  const navItems = injectReportsNavItem(resolveNavItems(items, navPreset), reportsHref);
  const workspacePath = role === "owner" ? "/owner" : role === "manager" ? "/manager" : "/tenant";
  const displayName = getDisplayName({ nickname, fullName, userEmail });
  const showWorkspaceButton = pathname !== workspacePath;
  const notificationHref = role === "tenant" ? "/tenant?section=notifications" : `${workspacePath}#notifications`;

  const notificationButton = (
    <NotificationBellMenu
      notifications={notifications}
      role={role as "owner" | "manager" | "tenant"}
      onDismissNotification={onDismissNotification}
      onClearAllNotifications={onClearAllNotifications}
      onSendBatchPaymentReminder={onSendBatchPaymentReminder}
      onWaiveCharge={onWaiveCharge}
      onMarkManagerPaymentPaid={onMarkManagerPaymentPaid}
      onOpenNotifications={onSelectItem ? () => onSelectItem("notifications") : undefined}
      notificationsHref={notificationHref}
      triggerClassName="sidebar-shell-button relative flex items-center justify-center px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
      iconClassName="h-3.5 w-3.5"
      badgeClassName="absolute -right-1 -top-1 min-w-[1.1rem] px-1 text-[10px]"
      panelClassName="w-[20rem]"
    />
  );

  return (
    <aside className="gradient-sidebar hidden min-h-0 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[260px] lg:flex-shrink-0 lg:flex-col">
      <div className="shrink-0 flex items-center justify-between gap-3 px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.18] text-lg font-bold text-white shadow-lg shadow-violet-950/25 backdrop-blur-sm">
            D
          </div>
          <div>
            <div className="text-base font-bold text-white">Domus</div>
          </div>
        </div>
        {notificationButton}
      </div>

      <div className="shrink-0 space-y-3 px-4 pb-4">
        {commandPaletteEnabled && onOpenCommandPalette ? (
          <CommandPaletteTrigger onOpen={onOpenCommandPalette} />
        ) : searchItems.length > 0 ? (
          <GlobalSearch items={searchItems} />
        ) : null}
        {accountSwitcher}
        {showWorkspaceButton ? (
          <Link
            href={workspacePath}
            className="sidebar-shell-button block px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            title="Return to your main workspace for this role."
          >
            {role === "owner" ? "Owner Workspace" : role === "manager" ? "Manager Workspace" : "Tenant Workspace"}
          </Link>
        ) : null}
      </div>

      <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 pb-4 pt-1">
        <NavList navItems={navItems} activeItemId={activeItemId} onSelectItem={onSelectItem} />
      </nav>

      <SidebarUserFooter
        displayName={displayName}
        role={role}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
        stripeConnected={stripeConnected}
      />
    </aside>
  );
}

export function MobileTopBar({
  userEmail,
  role,
  fullName,
  nickname,
  avatarUrl,
  stripeConnected,
  navPreset = "default",
  items,
  activeItemId,
  onSignOut,
  onSelectItem,
  unreadNotificationCount = 0,
  notifications = [],
  onDismissNotification,
  onClearAllNotifications,
  onSendBatchPaymentReminder,
  onWaiveCharge,
  onMarkManagerPaymentPaid,
  searchItems = [],
  onOpenCommandPalette,
  commandPaletteEnabled = false,
  reportsHref = null,
  accountSwitcher
}: Pick<
  SidebarNavProps,
  | "userEmail"
  | "role"
  | "fullName"
  | "nickname"
  | "avatarUrl"
  | "stripeConnected"
  | "navPreset"
  | "items"
  | "activeItemId"
  | "onSignOut"
  | "onSelectItem"
  | "unreadNotificationCount"
  | "notifications"
  | "onDismissNotification"
  | "onClearAllNotifications"
  | "onSendBatchPaymentReminder"
  | "onWaiveCharge"
  | "onMarkManagerPaymentPaid"
  | "searchItems"
  | "onOpenCommandPalette"
  | "commandPaletteEnabled"
  | "reportsHref"
  | "accountSwitcher"
>) {
  const pathname = usePathname();
  const navItems = injectReportsNavItem(resolveNavItems(items, navPreset), reportsHref);
  const workspacePath = role === "owner" ? "/owner" : role === "manager" ? "/manager" : "/tenant";
  const displayName = getDisplayName({ nickname, fullName, userEmail });
  const showWorkspaceButton = pathname !== workspacePath;
  const notificationHref = role === "tenant" ? "/tenant?section=notifications" : `${workspacePath}#notifications`;

  return (
    <div className="gradient-sidebar sticky top-0 z-30 px-3 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] shadow-lg lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.18] text-sm font-bold text-white">D</div>
          <div>
            <span className="block text-sm font-bold text-white">Domus</span>
            <span className="block text-[10px] uppercase tracking-wide sidebar-shell-muted">{role}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {commandPaletteEnabled && onOpenCommandPalette ? (
            <button
              type="button"
              onClick={onOpenCommandPalette}
              className="sidebar-shell-button flex h-11 w-11 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              title="Search navigation, properties, and tenants."
              aria-label="Open search"
            >
              <Search className="h-5 w-5" />
            </button>
          ) : null}
          <NotificationBellMenu
            notifications={notifications}
            role={role as "owner" | "manager" | "tenant"}
            onDismissNotification={onDismissNotification}
            onClearAllNotifications={onClearAllNotifications}
            onSendBatchPaymentReminder={onSendBatchPaymentReminder}
            onWaiveCharge={onWaiveCharge}
            onMarkManagerPaymentPaid={onMarkManagerPaymentPaid}
            onOpenNotifications={onSelectItem ? () => onSelectItem("notifications") : undefined}
            notificationsHref={notificationHref}
            triggerClassName="sidebar-shell-button relative flex h-11 w-11 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            iconClassName="h-3.5 w-3.5"
            badgeClassName="absolute -right-1 -top-1 min-w-[1rem] px-1 text-[9px]"
            panelClassName="right-0 w-[min(22rem,calc(100vw-1rem))]"
          />

          <MobileUserFooter
            displayName={displayName}
            role={role}
            userEmail={userEmail}
            avatarUrl={avatarUrl}
            stripeConnected={stripeConnected}
            onSignOut={onSignOut}
          />

          <MobileDrawer
            className="gradient-sidebar border-r border-white/10 text-white"
            trigger={
              <button
                type="button"
                className="sidebar-shell-button flex h-11 w-11 items-center justify-center"
                aria-label="Open navigation menu"
                title="Open navigation menu."
              >
                <Menu className="h-5 w-5" />
              </button>
            }
          >
            <div className="flex max-h-[calc(100svh-2rem)] min-h-0 flex-col pr-1">
              <div className="shrink-0 flex items-center justify-between gap-3 pb-1">
                <div>
                  <p className="text-sm font-semibold text-white">{displayName}</p>
                  <p className="text-xs uppercase tracking-[0.18em] sidebar-shell-muted">{role}</p>
                </div>
                <Badge variant="outline" className="border-white/20 bg-white/[0.12] text-white">
                  {unreadNotificationCount} unread
                </Badge>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
                {commandPaletteEnabled && onOpenCommandPalette ? (
                  <CommandPaletteTrigger onOpen={onOpenCommandPalette} />
                ) : searchItems.length > 0 ? (
                  <GlobalSearch items={searchItems} />
                ) : null}
                {accountSwitcher}

                <div className="grid grid-cols-1 gap-2">
                  {showWorkspaceButton ? (
                    <Drawer.Close asChild>
                      <Link
                        href={workspacePath}
                        className="sidebar-shell-button rounded-xl px-3 py-2 text-sm font-semibold"
                        title="Return to your main workspace for this role."
                      >
                        {role === "owner" ? "Owner Workspace" : role === "manager" ? "Manager Workspace" : "Tenant Workspace"}
                      </Link>
                    </Drawer.Close>
                  ) : null}
                </div>

                <nav
                  aria-label="Main navigation"
                  className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-2xl border border-white/[0.12] bg-white/[0.07] p-2"
                >
                  <NavList navItems={navItems} activeItemId={activeItemId} onSelectItem={onSelectItem} mobile />
                </nav>

                <ThemeToggleGroup />
              </div>
            </div>
          </MobileDrawer>
        </div>
      </div>
    </div>
  );
}
