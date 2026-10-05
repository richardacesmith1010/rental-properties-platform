"use client";

import { Home, Menu, Receipt, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";
import type { NavItem } from "./sidebar/nav-items";

interface OwnerBottomBarProps {
  items: NavItem[];
  activeItemId?: string;
  onSelectItem?: (id: string) => void;
  onOpenMore: () => void;
}

function BarButton({
  label,
  icon: Icon,
  active,
  badge,
  onClick
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "bg-[var(--accent-weak)] text-[var(--accent)]"
          : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
      )}
      title={`${label}.`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span>{label}</span>
      {badge ? (
        <span className="absolute right-1 top-0 rounded-full bg-[var(--warn-bg)] px-1.5 text-[9px] text-[var(--warn)] ring-1 ring-[var(--warn-line)]">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function OwnerBottomBar({ items, activeItemId, onSelectItem, onOpenMore }: OwnerBottomBarProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const lateCount = items.find((item) => item.id === "charges")?.badgeCount ?? 0;
  const buttons = [
    { id: "overview", label: "Home", icon: Home },
    { id: "charges", label: "Rent", icon: Receipt, badge: lateCount > 0 ? `${lateCount} late` : undefined },
    { id: "maintenance", label: "Repairs", icon: Wrench }
  ];

  if (!mounted) return null;

  return createPortal(
    <nav
      aria-label="Owner shortcuts"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 border-t border-[var(--line)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] px-2 pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] pt-2 shadow-[0_-8px_24px_color-mix(in_srgb,var(--ink)_10%,transparent)] backdrop-blur lg:hidden"
    >
      {buttons.map((button) => (
        <BarButton
          key={button.id}
          {...button}
          active={activeItemId === button.id}
          onClick={() => onSelectItem?.(button.id)}
        />
      ))}
      <BarButton label="More" icon={Menu} active={false} onClick={onOpenMore} />
    </nav>,
    document.body
  );
}
