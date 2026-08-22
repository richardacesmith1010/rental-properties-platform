"use client";

import { LogOut } from "lucide-react";
import { SubmitButton } from "@/components/shared/submit-button";
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
  stripeConnected,
  onSignOut
}: UserFooterProps & { onSignOut: (formData: FormData) => Promise<void> }) {
  return (
    <>
      <UserMenuPopover
        displayName={displayName}
        role={role}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
        stripeConnected={stripeConnected}
        placement="bottom"
        compact
      />

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
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
    </>
  );
}
