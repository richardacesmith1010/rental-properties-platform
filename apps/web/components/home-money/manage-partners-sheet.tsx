"use client";

import { useState } from "react";
import type { Partner } from "@/lib/partners";
import type { addPartner, renamePartner, deactivatePartner } from "@/app/actions/partners";

export function ManagePartnersSheet({ accountId, partners, onClose, onAdd, onRename, onDeactivate }: {
  accountId: string; partners: Partner[]; onClose: () => void; onAdd: typeof addPartner;
  onRename: typeof renamePartner; onDeactivate: typeof deactivatePartner
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  async function add() {
    setPending(true);
    const result = await onAdd(accountId, name);
    setPending(false);
    if (!result.ok) { setError(result.error); return; }
    setName("");
    onClose();
  }
  async function rename(partner: Partner) {
    const result = await onRename(accountId, partner.id, editingName);
    if (!result.ok) setError(result.error);
    else onClose();
  }
  async function deactivate(partner: Partner) {
    const result = await onDeactivate(accountId, partner.id);
    if (!result.ok) setError(result.error);
    else onClose();
  }
  return <div role="dialog" aria-modal="true" aria-label="Manage partners" className="domus-card space-y-3 rounded-2xl p-4">
    <h3 className="text-lg font-semibold">Manage partners</h3>
    <div className="space-y-2">{partners.map((partner) => <div key={partner.id}
      className="flex min-h-11 items-center justify-between gap-2 border-b border-[var(--line)]">
      {editingId === partner.id ? <label className="text-sm">Name
        <input className="domus-input ml-2 min-h-11" maxLength={80} value={editingName}
          onChange={(event) => setEditingName(event.target.value)} /></label>
        : <span>{partner.displayName}{!partner.active ? " (inactive)" : ""}</span>}
      {partner.active && <span className="flex gap-2">
        {editingId === partner.id ? <button type="button" className="min-h-11 px-2"
          title={`Save name for ${partner.displayName}`} onClick={() => rename(partner)}>Save</button>
          : <button type="button" className="min-h-11 px-2" title={`Rename ${partner.displayName}`}
            onClick={() => { setEditingId(partner.id); setEditingName(partner.displayName); }}>Rename</button>}
        <button type="button" className="min-h-11 px-2" title={`Remove ${partner.displayName}`}
          onClick={() => deactivate(partner)}>Remove</button>
      </span>}
    </div>)}</div>
    <label className="block text-sm font-medium">Name
      <input className="domus-input mt-1 min-h-11 w-full" maxLength={80} value={name}
        onChange={(event) => setName(event.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-[var(--crit)]">{error}</p>}
    <div className="flex gap-2"><button className="domus-card min-h-11 rounded-xl px-4" type="button"
      title="Close partner list" onClick={onClose}>Close</button>
      <button className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-[var(--accent-contrast)]"
        type="button" title="Add person" disabled={pending} onClick={add}>+ Add a person</button></div>
  </div>;
}
