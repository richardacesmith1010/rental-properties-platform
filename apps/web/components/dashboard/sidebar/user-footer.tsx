"use client";

import { UserMenuPopover } from "@/components/dashboard/user-menu-popover";

interface UserFooterProps {
  displayName: string;
  role: string;
  userEmail: string;
  avatarUrl?: string | null;
  stripeConnected?: boolean;
}

export function SidebarUserFooter({
  displayName,
  role,
  userEmail,
  avatarUrl,
  stripeConnected
}: UserFooterProps) {
  return (
    <div className="shrink-0 border-t border-white/[0.12] px-5 py-4">
      <UserMenuPopover
        displayName={displayName}
        role={role}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
        stripeConnected={stripeConnected}
        placement="top"
      />
    </div>
  );
}

export function MobileUserFooter({
  displayName,
  role,
  userEmail,
  avatarUrl,
  stripeConnected
}: UserFooterProps) {
  return (
    <UserMenuPopover
      displayName={displayName}
      role={role}
      userEmail={userEmail}
      avatarUrl={avatarUrl}
      stripeConnected={stripeConnected}
      placement="bottom"
      compact
    />
  );
}
