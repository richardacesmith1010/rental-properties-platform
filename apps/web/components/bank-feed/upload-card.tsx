"use client";

import { useState } from "react";
import { parseBankCsv, type ParsedBankRow } from "@/lib/bank-feed/csv";
import type { Institution } from "@/lib/bank-feed/types";

export interface AccountOption { id: string; nickname: string; institution: Institution }
const institutions: Array<{ value: Institution; label: string }> = [
  { value: "fidelity", label: "Fidelity" }, { value: "navy_federal", label: "Navy Federal" },
  { value: "other", label: "Other" }
];

export function UploadCard({ accounts, ownerAccountId, onCreate, onImport, onSelected }: {
  accounts: AccountOption[]; ownerAccountId: string;
  onCreate: (input: { ownerAccountId: string; institution: Institution; nickname: string }) =>
    Promise<{ success: boolean; error?: string; bankAccountId?: string }>;
  onImport: (bankAccountId: string, rows: ParsedBankRow[]) => Promise<void>;
  onSelected?: (account: AccountOption | null) => void;
}) {
  const [selectedId, setSelectedId] = useState(accounts[0]?.id || "add");
  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [nickname, setNickname] = useState("");
  const [institution, setInstitution] = useState<Institution>("fidelity");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = localAccounts.find((item) => item.id === selectedId);
  const [detected, setDetected] = useState<Institution | null>(null);

  async function chooseFile(chosen: File | null) {
    setFile(chosen); setDetected(null); setError("");
    if (!chosen || chosen.size > 2 * 1024 * 1024) return;
    try {
      const parsed = parseBankCsv(await chosen.text());
      if (parsed.success) setDetected(parsed.institution);
    } catch { setError("We could not open this file. Try again."); }
  }

  async function openFile() {
    if (!file) { setError("Choose a bank file first."); return; }
    setBusy(true); setError("");
    try {
      if (file.size > 2 * 1024 * 1024) { setError("This file is too large."); return; }
      const parsed = parseBankCsv(await file.text());
      if (!parsed.success) {
        setError(({ too_large: "This file is too large.", too_many_rows: "This file has too many lines.",
          no_header: "We could not read this bank file.", no_rows: "This bank file has no activity." })[parsed.error]);
        return;
      }
      setDetected(parsed.institution);
      let bankAccountId = selected?.id;
      if (!bankAccountId) {
        const created = await onCreate({ ownerAccountId, institution, nickname });
        if (!created.success || !created.bankAccountId) { setError(created.error || "Check the account name."); return; }
        bankAccountId = created.bankAccountId;
        const account = { id: bankAccountId, institution, nickname };
        setLocalAccounts((current) => [...current, account]);
        onSelected?.(account);
        setSelectedId(bankAccountId);
      }
      await onImport(bankAccountId, parsed.rows);
    } catch { setError("We could not open this file. Try again."); } finally { setBusy(false); }
  }

  return <section className="domus-card space-y-4 p-4" aria-label="Upload a bank file">
    <h2 className="text-lg font-semibold text-[var(--ink)]">Choose your bank file</h2>
    <label className="block text-sm text-[var(--ink)]">Which account is this file from?
      <select title="Pick the account for this file." className="domus-input mt-2 min-h-11 w-full" value={selectedId}
        onChange={(event) => { setSelectedId(event.target.value);
          onSelected?.(localAccounts.find((item) => item.id === event.target.value) || null); }}>
        {localAccounts.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}
        <option value="add">Add an account</option>
      </select>
    </label>
    {selectedId === "add" ? <div className="grid gap-3">
      <label className="text-sm text-[var(--ink)]">Account name<input title="Name this account."
        className="domus-input mt-1 min-h-11 w-full" value={nickname} maxLength={60}
        onChange={(event) => setNickname(event.target.value)} placeholder="My checking" /></label>
      <label className="text-sm text-[var(--ink)]">Bank<select title="Pick your bank."
        className="domus-input mt-1 min-h-11 w-full" value={institution}
        onChange={(event) => setInstitution(event.target.value as Institution)}>
        {institutions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select></label>
    </div> : null}
    <label className="block text-sm text-[var(--ink)]">Choose file
      <input title="Choose a bank file." type="file" accept=".csv,text/csv" className="mt-2 block min-h-11 w-full"
        onChange={(event) => void chooseFile(event.target.files?.[0] || null)} />
    </label>
    {detected && detected !== (selected?.institution || institution) ?
      <p className="text-sm text-[var(--muted)]">This file looks like it came from another bank. You can still use it.</p> : null}
    <button type="button" title="Sort the items in this file." onClick={openFile}
      disabled={busy || (selectedId === "add" && !nickname.trim()) || !file}
      className="min-h-11 rounded-md bg-[var(--accent)] px-4 font-semibold text-white disabled:opacity-50">
      {busy ? "Reading file…" : "Sort this file"}
    </button>
    {error ? <p role="alert" className="text-sm text-[var(--crit)]">{error}</p> : null}
    <p className="text-sm text-[var(--muted)]">Your file stays on this device. Domus only sees the items inside.</p>
  </section>;
}
