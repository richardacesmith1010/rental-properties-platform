"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LifeBuoy, LogOut, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/format";

interface UserMenuPopoverProps {
  displayName: string;
  role: string;
  userEmail: string;
  avatarUrl?: string | null;
  stripeConnected?: boolean;
  placement?: "top" | "bottom";
  compact?: boolean;
}

function Avatar({
  avatarUrl,
  displayName,
  className
}: {
  avatarUrl?: string | null;
  displayName: string;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt="Profile"
        width={32}
        height={32}
        sizes="32px"
        className={cn("h-8 w-8 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-emerald-400 text-xs font-semibold text-white",
        className
      )}
    >
      {displayName.charAt(0).toUpperCase()}
    </div>
  );
}

export function UserMenuPopover({
  displayName,
  role,
  userEmail,
  avatarUrl,
  stripeConnected,
  placement = "top",
  compact = false
}: UserMenuPopoverProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  const panelClassName =
    placement === "top"
      ? "bottom-full mb-2 left-0"
      : "top-full mt-2 right-0";

  return (
    <div ref={containerRef} className={cn("relative", compact ? "shrink-0" : "w-full")}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex items-center gap-2.5 rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
          compact
            ? "border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-white hover:bg-white/10 focus-visible:ring-offset-slate-900"
            : "w-full border-white/15 bg-white/5 px-3 py-2.5 text-left text-white/85 hover:bg-white/12 focus-visible:ring-offset-slate-900"
        )}
        title="Open user menu."
      >
        <Avatar avatarUrl={avatarUrl} displayName={displayName} />
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium", compact ? "text-xs text-white" : "text-[13px] text-white")}>
            <span className="flex items-center gap-1.5">
              <span className="truncate">{displayName}</span>
              {typeof stripeConnected === "boolean" ? (
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    stripeConnected ? "bg-emerald-400" : "bg-rose-400"
                  )}
                  title={stripeConnected ? "Bank connected" : "Bank not connected"}
                />
              ) : null}
            </span>
          </p>
          <p
            className={cn(
              "truncate capitalize",
              compact ? "text-[10px] text-white/60" : "text-[11px] text-white/45"
            )}
          >
            {role}
          </p>
        </div>
      </button>

      {open ? (
        <div
          className={cn(
            "absolute z-50 min-w-[220px] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg",
            panelClassName
          )}
        >
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-900">{displayName}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{userEmail}</p>
          </div>

          <div className="p-2">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
              title="Open your account settings."
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>

            <a
              href="mailto:support@domusbase.com"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
              title="Email Domus support."
            >
              <LifeBuoy className="h-4 w-4" />
              Help &amp; Support
            </a>

            <div className="my-2 h-px bg-zinc-100" />

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
              title="Sign out and return to the login page."
            >
              <LogOut className="h-4 w-4" />
              {signingOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
