"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { loadPlaidScript } from "./plaid-script";
import { clearLinkSession, finishLinkSession, saveLinkSession, type LinkSession } from "./link-session";

export interface ConnectionView {
  id: string; institution_name: string; status: string; last_synced_at: string | null;
  accounts: Array<{ id: string; nickname: string; institution: string;
    balance_cents?: number | null; balance_as_of?: string | null }>;
}
export interface MatchView {
  connectionId: string;
  plaidAccounts: Array<{ id: string; nickname: string; institution: string }>;
  uploadAccounts: Array<{ id: string; nickname: string; institution: string }>;
}

type Result = { success: boolean; error?: string; linkToken?: string; needsMatch?: boolean;
  connectionId?: string; plaidAccounts?: MatchView["plaidAccounts"];
  uploadAccounts?: MatchView["uploadAccounts"] };
type Actions = {
  start: (input: { ownerAccountId: string }) => Promise<Result>;
  finish: (input: { ownerAccountId: string; publicToken: string;
    selectedAccountIds: string[] }) => Promise<Result>;
  startRelink: (input: { connectionId: string }) => Promise<Result>;
  finishRelink: (input: { connectionId: string }) => Promise<Result>;
  refresh: (input: { connectionId: string }) => Promise<Result>;
  disconnect: (input: { connectionId: string }) => Promise<Result>;
  confirm: (input: { connectionId: string; pairs: Array<{
    plaidBankAccountId: string; uploadBankAccountId: string }> }) => Promise<Result>;
  skip: (input: { connectionId: string }) => Promise<Result>;
};

function statusText(connection: ConnectionView): string {
  if (connection.status === "needs_login") return "Sign in again";
  if (connection.status === "revoked") return "Disconnected";
  if (connection.status === "error") return "Something went wrong. Try again.";
  if (connection.status === "pending_account_match") return "Finish connecting";
  if (!connection.last_synced_at) return "Up to date · just now";
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(connection.last_synced_at)) / 3_600_000));
  return `Up to date · ${hours < 1 ? "just now" : `${hours}h ago`}`;
}

export function BankConnectionsCard({ ownerAccountId, connections, pendingMatch, actions, nativeApp = false }: {
  ownerAccountId: string; connections: ConnectionView[]; pendingMatch?: MatchView; actions: Actions; nativeApp?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [match, setMatch] = useState<MatchView | null>(pendingMatch || null);
  const [choices, setChoices] = useState<Record<string, string>>({});

  async function openLink(connectionId?: string) {
    setBusy(true); setError("");
    try {
      const started = connectionId ? await actions.startRelink({ connectionId })
        : await actions.start({ ownerAccountId });
      if (!started.success || !started.linkToken) {
        setError(started.error || "Try again."); setBusy(false); return;
      }
      const session: Omit<LinkSession, "expiresAt"> = { linkToken: started.linkToken,
        mode: connectionId ? "relink" : "create", ownerAccountId, connectionId, startedAt: Date.now() };
      if (!saveLinkSession(session)) { setError("Try again."); setBusy(false); return; }
      await loadPlaidScript();
      if (!window.Plaid) throw new Error("Plaid Link unavailable.");
      let handled = false;
      window.Plaid.create({ token: started.linkToken, onSuccess: async (publicToken, metadata) => {
        if (handled) return;
        handled = true;
        setBusy(true);
        try {
          const result = await finishLinkSession(session, publicToken, metadata, actions);
          if (!result.success) { setError(result.error || "Try again."); return; }
          if (result.needsMatch && result.connectionId) {
            setMatch({ connectionId: result.connectionId, plaidAccounts: result.plaidAccounts || [],
              uploadAccounts: result.uploadAccounts || [] });
          }
          router.refresh();
        } catch { setError("Try again."); }
        finally { clearLinkSession(); setBusy(false); }
      }, onExit: () => {
        if (handled) return;
        handled = true; clearLinkSession(); setBusy(false);
      } }).open();
    } catch { clearLinkSession(); setError("Try again."); setBusy(false); }
  }

  async function finishMatch(skip: boolean) {
    if (!match) return;
    setBusy(true); setError("");
    const pairs = Object.entries(choices).flatMap(([plaidBankAccountId, uploadBankAccountId]) =>
      uploadBankAccountId ? [{ plaidBankAccountId, uploadBankAccountId }] : []);
    const result = skip ? await actions.skip({ connectionId: match.connectionId })
      : await actions.confirm({ connectionId: match.connectionId, pairs });
    if (result.success) { setMatch(null); router.refresh(); }
    else setError(result.error || "Try again.");
    setBusy(false);
  }

  async function disconnect(connection: ConnectionView) {
    if (!window.confirm(`Disconnect ${connection.institution_name}? Items already filed stay in Domus.`)) return;
    setBusy(true); setError("");
    const result = await actions.disconnect({ connectionId: connection.id });
    if (result.success) router.refresh(); else setError(result.error || "Try again.");
    setBusy(false);
  }

  return <section className="domus-card space-y-4 p-4" aria-label="Your banks">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-xl font-semibold">Your banks</h2>
      {!nativeApp ? <button type="button" title="Connect a bank" disabled={busy} onClick={() => void openLink()}
        className="min-h-11 rounded-md bg-[var(--accent)] px-4 text-[var(--accent-contrast)]">Connect a bank</button> : null}
    </div>
    {nativeApp ? <p className="text-sm text-[var(--muted)]">
      To connect a bank, use Domus on a computer for now.</p> : null}
    {connections.map((connection) => <article key={connection.id} className="border-t border-[var(--line)] pt-3">
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-medium">{connection.institution_name}</p>
          {connection.accounts.map((account) => <p key={account.id} className="text-sm text-[var(--muted)]">
            {account.nickname}{account.balance_cents != null ? ` · ${formatCurrency(account.balance_cents)}` : ""}
            {account.balance_as_of ? ` · as of ${new Date(account.balance_as_of).toLocaleDateString("en-US")}` : ""}</p>)}
          <p className="text-sm text-[var(--muted)]">{nativeApp && connection.status === "needs_login" ? null : statusText(connection)}</p>
        </div>
        <details><summary title="Bank options" className="cursor-pointer px-3 py-2">⋯</summary>
          <button type="button" title="Disconnect" disabled={busy} onClick={() => void disconnect(connection)}
            className="min-h-11 text-[var(--crit)]">Disconnect</button></details>
      </div>
      <div className="mt-2 flex gap-3">
        {!nativeApp && connection.status === "needs_login" ? <button type="button" title="Sign in again"
          disabled={busy} onClick={() => void openLink(connection.id)} className="min-h-11 text-[var(--accent)]">
          Sign in again</button> : null}
        {connection.status === "error" ? <button type="button" title="Something went wrong. Try again."
          disabled={busy} onClick={async () => {
            setBusy(true); const result = await actions.refresh({ connectionId: connection.id });
            if (!result.success) setError(result.error || "Try again.");
            else router.refresh(); setBusy(false);
          }} className="min-h-11 text-[var(--accent)]">Something went wrong. Try again.</button> : null}
        {connection.status === "pending_account_match" ? <button type="button" title="Finish connecting"
          onClick={() => setMatch(pendingMatch || null)} className="min-h-11 text-[var(--accent)]">
          Finish connecting</button> : null}
        {["ok", "error"].includes(connection.status) ? <button type="button" title="Refresh"
          disabled={busy} onClick={async () => {
            setBusy(true); const result = await actions.refresh({ connectionId: connection.id });
            if (!result.success) setError(result.error || "Try again.");
            else router.refresh(); setBusy(false);
          }} className="min-h-11 text-[var(--accent)]">Refresh</button> : null}
      </div>
    </article>)}
    {match ? <div className="space-y-3 border-t border-[var(--line)] pt-4">
      <h3 className="font-semibold">Is this the same account as one you uploaded before?</h3>
      {match.plaidAccounts.map((account) => <label key={account.id} className="block text-sm">
        {account.nickname}<select title="Choose a matching uploaded account" className="domus-input mt-1 w-full"
          value={choices[account.id] || ""} onChange={(event) => setChoices((current) => ({
            ...current, [account.id]: event.target.value }))}>
          <option value="">No, it&apos;s new</option>
          {match.uploadAccounts.filter((upload) => upload.institution.toLowerCase() === account.institution.toLowerCase()
            && (!Object.entries(choices).some(([id, selected]) => id !== account.id && selected === upload.id)))
            .map((upload) => <option key={upload.id} value={upload.id}>{upload.nickname} · {upload.institution}</option>)}
        </select></label>)}
      <div className="flex gap-3">
        <button type="button" title="Finish connecting" disabled={busy} onClick={() => void finishMatch(false)}
          className="min-h-11 text-[var(--accent)]">Finish connecting</button>
        <button type="button" title="Skip for now" disabled={busy} onClick={() => void finishMatch(true)}
          className="min-h-11">Skip for now</button>
      </div>
    </div> : null}
    {error ? <p role="alert" className="text-sm text-[var(--crit)]">{error}</p> : null}
  </section>;
}
