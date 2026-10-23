"use client";

import { Search, Settings, LifeBuoy } from "lucide-react";
import { useDomusTheme } from "@/components/theme-provider";
import { navButtonClasses, themeOptions } from "./nav-items";
export const sidebarFocusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]";
export function CommandPaletteTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`sidebar-shell-panel flex w-full items-center justify-between px-3 py-2 text-left text-sm ${sidebarFocusRing}`}
      title="Open the command palette."
    >
      <span className="flex min-w-0 items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">Search navigation, properties, tenants...</span>
      </span>
      <span className="tabular-nums hidden rounded-md border border-border bg-background px-2 py-0.5 text-[11px]
        font-semibold text-muted-foreground sm:inline-flex">
        ⌘K
      </span>
    </button>
  );
}
export function WorkspaceFooterLinks() {
  return <div className="mt-4 border-t border-[var(--line)] pt-2">
    <a href="/settings" title="Open settings." className={`${navButtonClasses(false)} min-h-11 ${sidebarFocusRing}`}>
      <Settings className="h-4 w-4" />Settings
    </a>
    <a href="mailto:support@domusbase.com" title="Email Domus support." className={`${navButtonClasses(false)} min-h-11 ${sidebarFocusRing}`}>
      <LifeBuoy className="h-4 w-4" />Help
    </a>
  </div>;
}
export function ThemeToggleGroup() {
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
              aria-pressed={active}
              className={[
                "inline-flex items-center justify-center gap-2 rounded-xl px-2 py-2 text-[11px] font-semibold",
                active ? "sidebar-shell-button sidebar-shell-button-active" : "sidebar-shell-button"
              ].join(" ")}
              title={option.title}
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
