"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import type { BankChoice, ExpenseCategory, Suggestion } from "@/lib/bank-feed/types";
import type { NewRecentItem } from "./recent-list";
import type { ParsedBankRow } from "@/lib/bank-feed/csv";

export interface ReviewItem { i: number; token: string; suggestion?: Suggestion; ruleable?: boolean }
export interface HomeOption { id: string; name: string }
export interface RentOption { id: string; propertyId: string; dueDate: string; amountCents: number; status?: string }
export interface AnswerResult { success: boolean; error?: string; bankTransactionId?: string;
  createdRecord?: boolean; alreadyRecorded?: boolean; ruleSkipped?: boolean; ruleError?: boolean;
  recentItem?: NewRecentItem }

const billTypes: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "mortgage", label: "Mortgage" }, { value: "insurance", label: "Insurance" },
  { value: "property_tax", label: "Property tax" }, { value: "hoa", label: "HOA" },
  { value: "repair", label: "Repair" }, { value: "maintenance", label: "Maintenance" },
  { value: "utility", label: "Utility" }, { value: "management_fee", label: "Management fee" },
  { value: "legal", label: "Legal" }, { value: "other", label: "Other" }
];

export function ReviewCard({ item, row, properties, charges, onAnswer, onUndo }: {
  item: ReviewItem; row: ParsedBankRow; properties: HomeOption[]; charges: RentOption[];
  onAnswer: (item: ReviewItem, decision: "yes" | "no", always: boolean, choice?: BankChoice) => Promise<AnswerResult>;
  onUndo: (id: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const suggestion = item.suggestion;
  const [changing, setChanging] = useState(!suggestion || (suggestion.kind === "expense" && !suggestion.propertyId));
  const [kind, setKind] = useState<BankChoice["kind"]>(suggestion?.kind || (row.direction === "in" ? "rent" : "expense"));
  const [propertyId, setPropertyId] = useState(suggestion && "propertyId" in suggestion ? suggestion.propertyId || "" : "");
  const [chargeId, setChargeId] = useState(suggestion?.kind === "rent" ? suggestion.rentChargeId : "");
  const [category, setCategory] = useState<ExpenseCategory>(suggestion?.kind === "expense" ? suggestion.category : "other");
  const [label, setLabel] = useState(suggestion?.kind === "expense" ? suggestion.label : "Bill");
  const [always, setAlways] = useState(!!item.ruleable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"filed" | "skipped" | null>(null);
  const [filedId, setFiledId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const homeCharges = charges.filter((charge) => charge.propertyId === propertyId
    && charge.status !== "waived"
    && charge.amountCents === row.amountCents
    && Math.abs(Date.parse(charge.dueDate + "T00:00:00Z") - Date.parse(row.postedOn + "T00:00:00Z"))
      <= 7 * 86_400_000);
  const effectiveChargeId = chargeId || (homeCharges.length === 1 ? homeCharges[0].id : "");
  const choice: BankChoice | undefined = kind === "transfer" ? { kind: "transfer" }
    : kind === "expense" && propertyId && label.trim() ? { kind: "expense", propertyId, category, label }
      : kind === "rent" && effectiveChargeId ? { kind: "rent", rentChargeId: effectiveChargeId } : undefined;
  const needsHome = kind !== "transfer" && !propertyId;

  async function answer(decision: "yes" | "no") {
    setBusy(true); setError("");
    try {
      const result = await onAnswer(item, decision, always, decision === "yes" ? choice : undefined);
      if (!result.success) { setError(result.error || "Try again."); return; }
      setDone(decision === "yes" ? "filed" : "skipped");
      setFiledId(result.bankTransactionId || null);
      if (result.ruleSkipped && decision === "yes") setNotice("Filed. Domus will ask again next time for this one.");
      if (result.ruleError) setNotice("Saved this item. Domus could not save your rule.");
      if (result.alreadyRecorded) setNotice("Already recorded");
    } catch { setError("Try again."); } finally { setBusy(false); }
  }
  async function undo() {
    if (!filedId) return;
    setBusy(true); setError("");
    try {
      const result = await onUndo(filedId);
      if (!result.success) { setError(result.error || "Try again."); return; }
      setDone(null); setFiledId(null); setNotice("");
    } catch { setError("Try again."); } finally { setBusy(false); }
  }
  if (done) return <article className="domus-card p-4 text-[var(--ink)]">
    <p>{done === "filed" ? `Filed: ${row.description}` : "Skipped. Domus will not ask again."}</p>
    {notice ? <p className="mt-2 text-sm text-[var(--muted)]">{notice}</p> : null}
    {done === "filed" && filedId ? <button type="button" title="Undo this item."
      className="mt-2 min-h-11 text-[var(--accent)] underline" onClick={undo} disabled={busy}>Undo</button> : null}
    {error ? <p role="alert" className="text-[var(--crit)]">{error}</p> : null}
  </article>;

  return <article className="domus-card space-y-3 p-4 text-[var(--ink)]">
    <div className="flex items-start justify-between gap-3">
      <div><p className="font-semibold break-words">{row.description}</p>
        <p className="text-sm text-[var(--muted)]">{formatDate(row.postedOn)}</p></div>
      <p className={row.direction === "in" ? "font-semibold text-[var(--pos)]" : "font-semibold text-[var(--ink)]"}>
        {row.direction === "in" ? "+" : "−"}{formatCurrency(row.amountCents)}
      </p>
    </div>
    {suggestion ? <p className="text-sm text-[var(--accent)]">Looks like: {suggestion.text}</p> : null}
    {changing ? <div className="grid gap-3">
      <label className="text-sm">Type<select title="Pick a type." value={kind}
        onChange={(event) => { setKind(event.target.value as BankChoice["kind"]); setChargeId(""); }}
        className="domus-input mt-1 min-h-11 w-full">
        {row.direction === "in" ? <option value="rent">Rent</option> : <option value="expense">Bill</option>}
        <option value="transfer">Moving my money</option>
      </select></label>
      {kind !== "transfer" ? <label className="text-sm">Home<select title="Pick a home." value={propertyId}
        onChange={(event) => { setPropertyId(event.target.value); setChargeId(""); }}
        className="domus-input mt-1 min-h-11 w-full">
        <option value="">Pick a home</option>{properties.map((home) => <option key={home.id} value={home.id}>{home.name}</option>)}
      </select></label> : null}
      {kind === "rent" ? <label className="text-sm">Rent due<select title="Pick the rent to file." value={effectiveChargeId}
        onChange={(event) => setChargeId(event.target.value)} className="domus-input mt-1 min-h-11 w-full">
        <option value="">Pick rent</option>{homeCharges.map((charge) => <option key={charge.id} value={charge.id}>
          {formatDate(charge.dueDate)} · {formatCurrency(charge.amountCents)}</option>)}
      </select></label> : null}
      {kind === "expense" ? <label className="text-sm">Bill type<select title="Pick a bill type." value={category}
        onChange={(event) => setCategory(event.target.value as ExpenseCategory)} className="domus-input mt-1 min-h-11 w-full">
        {billTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select></label> : null}
      {kind === "expense" ? <label className="text-sm">Name<input title="Name this bill." value={label}
        maxLength={80} onChange={(event) => setLabel(event.target.value)} className="domus-input mt-1 min-h-11 w-full" />
      </label> : null}
    </div> : <button type="button" title="Change where this goes." className="min-h-11 text-sm text-[var(--accent)] underline"
      onClick={() => setChanging(true)}>Change</button>}
    {item.ruleable ? <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" checked={always} onChange={(event) => setAlways(event.target.checked)} />
      Always do this for this payee</label> : null}
    <div className="flex flex-col gap-2 sm:flex-row">
      <button type="button" title="Skip this as personal." className="min-h-11 rounded-md border border-[var(--line)] px-4"
        onClick={() => answer("no")} disabled={busy}>Not rental</button>
      <button type="button" title="File this for your home."
        className="min-h-11 rounded-md bg-[var(--accent)] px-4 font-semibold text-white"
        onClick={() => answer("yes")} disabled={busy || needsHome || !choice}>Yes, that&apos;s right</button>
    </div>
    {error ? <p role="alert" className="text-sm text-[var(--crit)]">{error}</p> : null}
  </article>;
}
