"use client";

import { todayDenver } from "@/lib/denver-calendar";
import Link from "next/link";
import { useState } from "react";
import type { addPartnerPayment } from "@/app/actions/partners";
import { formatCurrency } from "@/lib/format";
import type { PartnerLine } from "@/lib/partners";
import { suggestEvenSettleUp, type SettleUpSuggestion } from "@/lib/partner-settle";

export function SettleUpSection({ accountId, rows, period, allTimeHref, onAddPayment }: {
  accountId: string; rows: PartnerLine[]; period: string; allTimeHref: string;
  onAddPayment: typeof addPartnerPayment;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const activeCount = rows.filter((row) => row.id !== null && row.active).length;
  if (activeCount < 2) return null;
  if (period !== "All time") return <Link href={allTimeHref} title="See how to even things out in All time."
    className="flex min-h-11 items-center text-sm text-[var(--muted)] underline">
    See how to even things out in All time.</Link>;

  const suggestions = suggestEvenSettleUp(rows);
  async function add(suggestion: SettleUpSuggestion) {
    const result = await onAddPayment({ accountId, fromPartnerId: suggestion.fromPartnerId,
      toPartnerId: suggestion.toPartnerId, amountCents: suggestion.amountCents,
      paidOn: todayDenver(), kind: "settle_up", status: "planned", note: "Even it out" });
    if (!result.ok) { setError(result.error); return false; }
    return true;
  }
  async function addSuggestions(items: SettleUpSuggestion[]) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      for (const suggestion of items) if (!await add(suggestion)) break;
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setPending(false);
    }
  }
  return <section className="space-y-2 border-t border-[var(--line)] pt-3" aria-label="Even it out">
    <h3 className="font-semibold">Even it out</h3>
    <p className="text-sm text-[var(--muted)]">So everyone has put in the same amount.</p>
    {suggestions.length === 0 ? <p className="text-sm text-[var(--muted)]">Everyone has put in about the same.</p>
      : suggestions.map((suggestion) => <div key={`${suggestion.fromPartnerId}-${suggestion.toPartnerId}`}
        className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] py-2">
        <span>{suggestion.fromName} pays {suggestion.toName} · <span className="num">
          {formatCurrency(suggestion.amountCents)}</span></span>
        <button type="button" title={`Add ${suggestion.fromName} pays ${suggestion.toName} as planned`}
          disabled={pending} onClick={() => void addSuggestions([suggestion])}
          className="min-h-11 rounded-xl bg-[var(--action)] hover:bg-[var(--action-strong)] px-4 text-[var(--action-contrast)]">
          Add as planned</button>
      </div>)}
    {suggestions.length >= 2 && <button type="button" title="Add all as planned" disabled={pending}
      onClick={() => void addSuggestions(suggestions)}
      className="min-h-11 rounded-xl bg-[var(--action)] hover:bg-[var(--action-strong)] px-4 text-[var(--action-contrast)]">
      Add all as planned</button>}
    {error && <p role="alert" className="text-sm text-[var(--crit)]">{error}</p>}
  </section>;
}
