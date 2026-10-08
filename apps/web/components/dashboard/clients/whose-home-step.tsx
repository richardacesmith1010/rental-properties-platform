"use client";

import { useState } from "react";
import type { ClientOverview } from "@/lib/client-overview";
import type { StatefulAction } from "../types";
import { AddClientSheet } from "./add-client-sheet";

interface Props {
  clients: ClientOverview[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreateClientAccount: StatefulAction;
  onClientAdded?: (client: ClientOverview) => void;
}

export function WhoseHomeStep({ clients, selectedId, onSelect, onCreateClientAccount, onClientAdded }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold text-[var(--ink)]">Whose home is this?</h2>
      <div role="radiogroup" aria-label="Client" className="space-y-2">
        {clients.map((client) => (
          <button key={client.id} type="button" role="radio" aria-checked={selectedId === client.id}
            onClick={() => onSelect(client.id)} title={`Choose ${client.name}`}
            className={`flex min-h-11 w-full items-center justify-between rounded-lg border p-3 text-left text-[var(--ink)] ${
              selectedId === client.id
                ? "border-[var(--accent)] bg-[var(--accent-weak)]"
                : "border-[var(--line)] bg-[var(--surface)]"
            }`}>
            <span>{client.name}</span>
            <span className="text-sm text-[var(--muted)]">
              {client.homeCount} {client.homeCount === 1 ? "home" : "homes"}
            </span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setOpen(true)} title="Add a new client"
        className="min-h-11 w-full rounded-lg border border-dashed border-[var(--line)] p-3 text-[var(--accent)]">
        New client
      </button>
      <p className="text-sm text-[var(--muted)]">
        Is the owner on Domus already? Ask them to invite you instead.
      </p>
      <AddClientSheet open={open} onClose={() => setOpen(false)} onCreateClientAccount={onCreateClientAccount}
        onAdded={(client) => {
          onSelect(client.id);
          onClientAdded?.({ ...client, contactEmail: null, homeCount: 0, summary: "No tenants yet" });
        }} />
    </div>
  );
}
