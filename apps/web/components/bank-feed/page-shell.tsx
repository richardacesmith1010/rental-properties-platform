"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ParsedBankRow } from "@/lib/bank-feed/csv";
import type { BankChoice, Institution, Suggestion } from "@/lib/bank-feed/types";
import { UploadCard, type AccountOption } from "./upload-card";
import { ReviewCard, type ReviewItem, type HomeOption, type RentOption, type AnswerResult } from "./review-card";
import { MissedList } from "./missed-list";
import { RecentList, type RecentItem } from "./recent-list";

interface ImportResult { success: boolean; error?: string; filedCount?: number; transferCount?: number;
  alreadyCount?: number; skippedByRuleCount?: number; personalCount?: number;
  results?: Array<{ i: number; status: "filed" | "transfer" | "already" | "skipped" | "ask" | "personal";
    token?: string; suggestion?: Suggestion; ruleable?: boolean; alreadyRecorded?: boolean }> }

export function BankFeedShell({ ownerAccountId, accounts, bankAccounts, properties, charges, recent, actions }: {
  ownerAccountId: string; accounts: Array<{ id: string; display_name: string }>;
  bankAccounts: AccountOption[]; properties: HomeOption[]; charges: RentOption[]; recent: RecentItem[];
  actions: {
    createBankAccount: (input: { ownerAccountId: string; institution: Institution; nickname: string }) =>
      Promise<{ success: boolean; error?: string; bankAccountId?: string }>;
    importBankRows: (input: { bankAccountId: string; rows: Array<ParsedBankRow & { i: number }> }) => Promise<ImportResult>;
    answerBankItem: (input: { bankAccountId: string; token: string; decision: "yes" | "no";
      always: boolean; choice?: BankChoice }) => Promise<AnswerResult>;
    undoBankItem: (input: { bankTransactionId: string }) => Promise<{ success: boolean; error?: string }>;
    deleteBankAccount: (input: { bankAccountId: string }) => Promise<{ success: boolean; error?: string }>;
  };
}) {
  const router = useRouter();
  const [selectedAccount, setSelectedAccount] = useState<AccountOption | null>(bankAccounts[0] || null);
  const [importBankAccountId, setImportBankAccountId] = useState("");
  const [rows, setRows] = useState<ParsedBankRow[]>([]);
  const [ask, setAsk] = useState<ReviewItem[]>([]);
  const [personal, setPersonal] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const [recentItems, setRecentItems] = useState(recent);
  useEffect(() => setRecentItems(recent), [recent]);

  async function importRows(id: string, parsedRows: ParsedBankRow[]) {
    setImportBankAccountId(id); setRows(parsedRows); setError("");
    const result = await actions.importBankRows({ bankAccountId: id,
      rows: parsedRows.map((row, i) => ({ ...row, i })) });
    setSummary(result);
    setAsk((result.results || []).filter((item) => item.status === "ask" && item.token)
      .map((item) => ({ i: item.i, token: item.token!, suggestion: item.suggestion, ruleable: item.ruleable })));
    setPersonal((result.results || []).filter((item) => item.status === "personal" && item.token)
      .map((item) => ({ i: item.i, token: item.token!, ruleable: item.ruleable })));
    if (!result.success) setError(result.error || "Try again.");
    router.refresh();
  }
  async function answer(item: ReviewItem, decision: "yes" | "no", always: boolean,
    choice?: BankChoice): Promise<AnswerResult> {
    const result = await actions.answerBankItem({ bankAccountId: importBankAccountId,
      token: item.token, decision, always, choice });
    if (result.success) {
      if (result.recentItem) {
        const item = result.recentItem;
        setRecentItems((current) => [{ id: item.id, posted_on: item.postedOn,
          description: item.description, propertyName: item.propertyName, kind: item.kind,
          amount_cents: item.amountCents, direction: item.direction },
        ...current.filter((entry) => entry.id !== item.id)].slice(0, 20));
      }
      router.refresh();
    }
    return result;
  }
  async function undo(id: string) {
    const result = await actions.undoBankItem({ bankTransactionId: id });
    if (result.success) { setRecentItems((current) => current.filter((item) => item.id !== id)); router.refresh(); }
    return result;
  }
  async function remove() {
    if (!selectedAccount || !window.confirm(`Remove ${selectedAccount.nickname}? Filed rent and bills stay.`)) return;
    setRemoving(true); setError("");
    try {
      const result = await actions.deleteBankAccount({ bankAccountId: selectedAccount.id });
      if (!result.success) { setError(result.error || "Try again."); return; }
      setRows([]); setAsk([]); setPersonal([]); setSummary(null);
      setSelectedAccount(null); setImportBankAccountId("");
      router.refresh();
    } catch { setError("Try again."); } finally { setRemoving(false); }
  }
  return <main className="app-surface min-h-screen px-4 py-5 text-[var(--ink)]">
    <div className="mx-auto max-w-3xl space-y-5">
      <header><h1 className="text-2xl font-semibold">Bank activity</h1>
        <p className="mt-1 text-[var(--muted)]">Domus sorts rent and bills for your homes.</p>
        <Link href="/owner/money" className="mt-3 inline-flex min-h-11 items-center text-sm text-[var(--accent)] underline"
          title="See how your homes are doing.">See how your homes are doing</Link></header>
      {accounts.length > 1 ? <nav aria-label="Home accounts" className="flex flex-wrap gap-2">
        {accounts.map((item) => <Link key={item.id} href={`/owner/bank?account=${item.id}`}
          title={`Open bank activity for ${item.display_name}.`}
          className={`min-h-11 rounded-md border px-4 py-3 ${item.id === ownerAccountId
            ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>
          {item.display_name}</Link>)}
      </nav> : null}
      <UploadCard key={bankAccounts.map((item) => item.id).join(",")} accounts={bankAccounts}
        ownerAccountId={ownerAccountId} onCreate={actions.createBankAccount}
        onImport={importRows} onSelected={setSelectedAccount} />
      {summary ? <section className="domus-card p-4" aria-label="File results">
        <p className="font-medium">{summary.filedCount || 0} filed for you · {summary.transferCount || 0} moves skipped</p>
        <p className="text-sm text-[var(--muted)]">{summary.personalCount || 0} personal items skipped (not saved)</p>
        {(summary.results || []).some((item) => item.alreadyRecorded) ?
          <p className="text-sm text-[var(--muted)]">Already recorded: {
            summary.results?.filter((item) => item.alreadyRecorded).length}</p> : null}
        {(summary.alreadyCount || 0) > 0 ? <p className="text-sm text-[var(--muted)]">{summary.alreadyCount} already seen</p> : null}
      </section> : null}
      {error ? <p role="alert" className="text-sm text-[var(--crit)]">{error}</p> : null}
      {ask.length ? <section className="space-y-3" aria-labelledby="money-check-title">
        <h2 id="money-check-title" className="text-xl font-semibold">Money to check</h2>
        {ask.map((item) => rows[item.i] ? <ReviewCard key={item.token} item={item} row={rows[item.i]}
          properties={properties} charges={charges} onAnswer={answer} onUndo={undo} /> : null)}
      </section> : null}
      {personal.length ? <MissedList key={personal.map((item) => item.token).join(",")} items={personal}
        rows={rows} onMove={(item) => {
        setPersonal((current) => current.filter((entry) => entry.i !== item.i));
        setAsk((current) => [...current, item]);
      }} /> : null}
      <RecentList items={recentItems} />
      <p className="text-sm text-[var(--muted)]">
        Domus only keeps rental items. It can only read your files. It can never move money.
      </p>
      {selectedAccount ? <details className="domus-card p-4">
        <summary title="Remove saved bank activity." className="flex min-h-11 cursor-pointer items-center">
          Remove {selectedAccount?.nickname || "this account"}</summary>
        <p className="text-sm text-[var(--muted)]">Saved bank items and rules will be removed. Filed rent and bills stay.</p>
        <button type="button" title="Remove this bank account." onClick={remove} disabled={removing || !selectedAccount}
          className="mt-3 min-h-11 rounded-md border border-[var(--line)] px-4">
          Remove {selectedAccount?.nickname || "this account"}</button>
      </details> : null}
    </div>
  </main>;
}
