"use client";

import { Bell, Home, Receipt, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

const items = [
  ["overview", "Home", Home],
  ["charges", "Rent", Receipt],
  ["maintenance", "Problems", Wrench],
  ["notifications", "Messages", Bell]
] as const;

export function TenantBottomBar({ activeItemId }: { activeItemId: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <nav aria-label="Tenant shortcuts" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 border-t border-[var(--line)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] px-2 pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] pt-2 shadow-[0_-8px_24px_color-mix(in_srgb,var(--ink)_10%,transparent)] backdrop-blur lg:hidden">
      {items.map(([id, label, Icon]) => <Link key={id} href={`/tenant?section=${id}`} aria-current={activeItemId === id ? "page" : undefined} className={`flex min-h-11 flex-col items-center justify-center rounded-xl text-[11px] font-semibold ${activeItemId === id ? "bg-[var(--accent-weak)] text-[var(--accent)]" : "text-[var(--muted)]"}`} title={`Open ${label}.`}><Icon className="h-5 w-5" /><span>{label}</span></Link>)}
    </nav>,
    document.body
  );
}
