"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { runningBalance, type Entry } from "@/lib/home-money";

function itemDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC"
  });
}

export function EveryItem({ entries, allHomes }: { entries: Entry[]; allHomes: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const rows = allHomes ? entries : runningBalance(entries);
  return <section>
    <button type="button" title="Show every money item" aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}
      className="domus-card flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left">
      <span className="flex-1 font-semibold">Every item</span>
      <span className="text-sm text-[var(--muted)]">{entries.length} {entries.length === 1 ? "item" : "items"}</span>
      <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
    </button>
    {expanded && (rows.length ? <>
      <div data-testid="stacked-money-rows" className="domus-card mt-3 divide-y divide-[var(--line)] sm:hidden">
        {rows.map((entry) => <div key={entry.id} className="flex min-h-16 items-center gap-3 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{entry.title}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{itemDate(entry.date)}
              {allHomes ? ` · ${entry.homeName}` : ""} · {entry.source}</p></div>
          <span className="num font-semibold">{entry.direction === "in" ? "+" : "−"}{formatCurrency(entry.amountCents)}</span>
        </div>)}
      </div>
      <div className="domus-card mt-3 hidden overflow-x-auto sm:block"><table className="w-full text-left text-sm">
        <thead><tr className="border-b border-[var(--line)] text-[var(--muted)]">
          <th className="p-4">Date</th><th className="p-4">What</th>{allHomes && <th className="p-4">Home</th>}
          <th className="p-4">Type</th><th className="p-4">Amount</th>{!allHomes && <th className="p-4">Balance</th>}
        </tr></thead>
        <tbody>{rows.map((entry) => <tr key={entry.id} className="border-b border-[var(--line)] last:border-0">
          <td className="p-4">{itemDate(entry.date)}</td>
          <td className="p-4">{entry.title}<small className="block text-[var(--muted)]">{entry.source}</small></td>
          {allHomes && <td className="p-4">{entry.homeName}</td>}
          <td className="p-4">{entry.kind === "rent" ? "Rent" : "Bill"}</td>
          <td className="num p-4">{entry.direction === "in" ? "+" : "−"}{formatCurrency(entry.amountCents)}</td>
          {!allHomes && <td className="num p-4">{formatCurrency("balanceCents" in entry ? entry.balanceCents as number : 0)}</td>}
        </tr>)}</tbody>
      </table></div>
    </> : <div className="domus-card mt-3 p-5">Nothing here yet. <Link href="/owner/bank"
      className="text-[var(--accent)] underline">Upload a bank file to fill this in.</Link></div>)}
    {!expanded && !rows.length && <p className="mt-3 text-sm text-[var(--muted)]">Nothing here yet. <Link
      href="/owner/bank" className="text-[var(--accent)] underline">Upload a bank file to fill this in.</Link></p>}
  </section>;
}
