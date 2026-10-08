"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClientOverview } from "@/lib/client-overview";
import type { StatefulAction } from "../types";
import { Button } from "@/components/ui/button";
import { AddClientSheet } from "./add-client-sheet";

interface Props { clients: ClientOverview[]; onCreateClientAccount: StatefulAction }

function ClientRow({ client }: { client: ClientOverview }) {
  const initials = client.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const color = client.summary.includes("overdue") ? "text-[var(--warn)]"
    : client.summary === "All rent paid this month" ? "text-[var(--pos)]" : "text-[var(--muted)]";
  return (
    <Link href={`/manager/clients/${client.id}`} title={`View ${client.name}`}
      className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[var(--ink)]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-weak)]
        font-semibold text-[var(--accent)]">
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{client.name}</span>
        <span className="block text-sm text-[var(--muted)]">
          {client.accountType === "llc" ? "LLC" : "Person"} · {client.homeCount} {client.homeCount === 1 ? "home" : "homes"}
        </span>
        <span className={`block text-sm ${color}`}>{client.summary}</span>
      </span>
      <span aria-hidden="true">›</span>
    </Link>
  );
}

export function ClientsSection({ clients, onCreateClientAccount }: Props) {
  const [items, setItems] = useState(clients);
  const [open, setOpen] = useState(false);
  const addButton = (
    <Button onClick={() => setOpen(true)} title="Add a client" className="min-h-11 sm:min-h-0">Add client</Button>
  );
  return (
    <div className="space-y-5">
      {items.length ? <>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Clients</h2>{addButton}
        </div>
        <div className="space-y-2">{items.map((client) => <ClientRow key={client.id} client={client} />)}</div>
        <p className="text-sm text-[var(--muted)]">
          Rent for client homes is paid outside Domus. You mark it paid when it comes in.
        </p>
      </> : <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
        <h2 className="text-xl font-semibold">Add your first client</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--muted)]">
          A client is an owner whose homes you run. They don&apos;t need a Domus account.
        </p>
        <div className="mt-4">{addButton}</div>
      </div>}
      <AddClientSheet open={open} onClose={() => setOpen(false)} onCreateClientAccount={onCreateClientAccount}
        onAdded={(client) => setItems((current) => [...current, {
          ...client, contactEmail: null, homeCount: 0, summary: "No tenants yet"
        }])} />
    </div>
  );
}
