"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClientDetail as Detail } from "@/lib/client-overview";
import type { StatefulAction } from "../types";
import { Button } from "@/components/ui/button";
import { UnifiedPropertyWizard } from "../unified-property-wizard";

interface Props {
  client: Detail;
  onCreatePropertyWithSetup: StatefulAction;
  onCreateClientAccount: StatefulAction;
}

function ClientAvatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <span className="flex size-14 items-center justify-center rounded-full bg-[var(--accent-weak)]
      text-lg font-semibold text-[var(--accent)]">
      {initials}
    </span>
  );
}

function HomeStatus({ home }: { home: Detail["homes"][number] }) {
  const label = home.status === "overdue" ? "Overdue" : home.status === "paid" ? "Paid"
    : home.status === "due" ? `Due ${home.dueLabel}` : "No tenant";
  const color = home.status === "overdue" ? "bg-[var(--warn-bg)] text-[var(--warn)]"
    : home.status === "paid" ? "bg-[var(--pos-bg)] text-[var(--pos)]"
      : "bg-[var(--surface-2)] text-[var(--muted)]";
  return <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${color}`}>{label}</span>;
}

export function ClientDetail({ client, onCreatePropertyWithSetup, onCreateClientAccount }: Props) {
  const [open, setOpen] = useState(false);
  const addButton = (
    <Button onClick={() => setOpen(true)} title="Add a home for this client" className="min-h-11 sm:min-h-0">
      Add a home
    </Button>
  );
  return (
    <div className="app-surface min-h-screen text-[var(--ink)]">
      <header className="flex min-h-14 items-center gap-4 border-b border-[var(--line)] bg-[var(--surface)] px-4">
        <Link href="/manager" aria-label="Go to home" title="Go to home"
          className="inline-flex min-h-11 items-center font-semibold text-[var(--accent)]">Domus</Link>
        <Link href="/manager?section=clients" title="Back to clients"
          className="inline-flex min-h-11 items-center text-[var(--accent)]">‹ Clients</Link>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 text-[var(--ink)]">
      <header className="flex items-center gap-4">
        <ClientAvatar name={client.name} />
        <div>
          <h1 className="text-2xl font-semibold">{client.name}</h1>
          <p className="text-sm text-[var(--muted)]">{client.accountType === "llc" ? "LLC" : "Person"}</p>
          {client.contactEmail && <p className="text-sm text-[var(--muted)]">{client.contactEmail}</p>}
        </div>
      </header>
      <p className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4 text-sm">
        Rent here is paid outside Domus. Mark it paid when it comes in.
      </p>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Homes</h2>{addButton}
        </div>
        {client.homes.length ? client.homes.map((home) => (
          <Link key={home.id} href={`/manager/properties/${home.id}`} title={`View ${home.name}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <span className="min-w-0">
              <strong className="block truncate">{home.name}</strong>
              <span className="block text-sm text-[var(--muted)]">{home.address}</span>
            </span>
            <HomeStatus home={home} />
          </Link>
        )) : <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6">
          <p>No homes yet.</p>
        </div>}
      </section>
      <UnifiedPropertyWizard open={open} accountId={client.id}
        managerClients={[{ ...client, homeCount: client.homes.length, summary: "" }]}
        onCreateClientAccount={onCreateClientAccount} onOpenChange={setOpen}
        onCreatePropertyWithSetup={onCreatePropertyWithSetup}
        returnToClientHref={`/manager/clients/${client.id}`} />
      </main>
    </div>
  );
}
