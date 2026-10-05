"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { InviteManagerForm } from "./invitations/invite-manager-form";
import type { StatefulAction } from "./types";

export function OwnerAddMenu({ onAddHome, onAddTenant, onAddUnit, onInviteManager, properties, role = "owner" }: {
  onAddHome: () => void;
  onAddTenant: () => void;
  onAddUnit?: () => void;
  onInviteManager?: StatefulAction;
  properties: Array<{ id: string; name: string }>;
  role?: "owner" | "manager";
}) {
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const actions = [
    { label: "Add a home", run: onAddHome },
    ...(role === "owner" && onAddUnit ? [{ label: "Add a unit", run: onAddUnit }] : []),
    { label: "Add a tenant", run: onAddTenant },
    ...(role === "owner" ? [{ label: "Add a manager", run: () => setManagerOpen(true) }] : [])
  ];
  return (
    <div ref={container} className="relative">
      <Button ref={trigger} type="button" className="min-h-11" title={role === "owner" ? "Add a home, tenant, or manager." : "Add a home or tenant."}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>Add</Button>
      {open ? <div ref={menu} role="menu" aria-label="Add" className="absolute right-0 z-40 mt-2 w-48 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1 shadow-lg"
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); close(); }
          if (event.key === "Tab") setOpen(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
          }
        }}>
        {actions.map(action => <button key={action.label} role="menuitem" type="button" title={action.label}
          className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-[var(--ink)] hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          onClick={() => { close(); action.run(); }}>{action.label}</button>)}
      </div> : null}
      {role === "owner" ? <ModalOverlay open={managerOpen} onClose={() => { setManagerOpen(false); trigger.current?.focus(); }}>
        <div className="domus-card w-full max-w-xl space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Add a manager</h2>
            <Button type="button" variant="outline" className="min-h-11" title="Close manager invite."
              onClick={() => { setManagerOpen(false); trigger.current?.focus(); }}>Close</Button>
          </div>
          {onInviteManager ? <InviteManagerForm properties={properties} onInviteManager={onInviteManager} />
            : <p>Manager invites are unavailable.</p>}
        </div>
      </ModalOverlay> : null}
    </div>
  );
}
