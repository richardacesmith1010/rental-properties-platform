"use client";

import type { ReactNode } from "react";
import { MobileTopBar, SidebarNav, type NavItem } from "./sidebar-nav";
import type { GlobalSearchItem } from "./global-search";
import type { FormAction } from "./types";

export interface DashboardLayoutProps {
  children: ReactNode;
  mainClassName: string;
  afterMain?: ReactNode;
  userEmail: string;
  role: string;
  fullName?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  stripeConnected?: boolean;
  onSignOut: FormAction;
  items?: NavItem[];
  activeItemId?: string;
  onSelectItem?: (id: string) => void;
  unreadNotificationCount?: number;
  searchItems?: GlobalSearchItem[];
  onOpenCommandPalette?: () => void;
  commandPaletteEnabled?: boolean;
  reportsHref?: string | null;
  accountSwitcher?: ReactNode;
}

export function DashboardLayout({
  children,
  mainClassName,
  afterMain,
  userEmail,
  role,
  fullName,
  nickname,
  avatarUrl,
  stripeConnected,
  onSignOut,
  items,
  activeItemId,
  onSelectItem,
  unreadNotificationCount = 0,
  searchItems = [],
  onOpenCommandPalette,
  commandPaletteEnabled = false,
  reportsHref = null,
  accountSwitcher
}: DashboardLayoutProps) {
  const navProps = {
    userEmail,
    role,
    fullName,
    nickname,
    avatarUrl,
    stripeConnected,
    onSignOut,
    items,
    activeItemId,
    onSelectItem,
    unreadNotificationCount,
    searchItems,
    onOpenCommandPalette,
    commandPaletteEnabled,
    reportsHref,
    accountSwitcher
  };

  return (
    <div className="app-surface flex min-h-screen flex-col lg:flex-row">
      <MobileTopBar {...navProps} />
      <SidebarNav {...navProps} />
      <main id="main-content" className={mainClassName}>
        {children}
      </main>
      {afterMain}
    </div>
  );
}
