"use client";

import type { ParsedBankRow } from "@/lib/bank-feed/csv";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ReviewItem } from "./review-card";

export function MissedList({ items, rows, onMove }: {
  items: ReviewItem[]; rows: ParsedBankRow[]; onMove: (item: ReviewItem) => void;
}) {
  return <details className="domus-card p-4 text-[var(--ink)]">
    <summary title="Check items Domus skipped." className="flex min-h-11 cursor-pointer items-center font-semibold">
      Missed a bill? ({items.length})</summary>
    <p className="mb-3 text-sm text-[var(--muted)]">These are not saved.</p>
    <div className="space-y-3">{items.map((item) => {
      const row = rows[item.i];
      if (!row) return null;
      return <div key={item.i} className="border-t border-[var(--line)] pt-3">
        <p className="break-words">{row.description}</p>
        <p className="text-sm text-[var(--muted)]">{formatDate(row.postedOn)} · {formatCurrency(row.amountCents)}</p>
        <button type="button" title="Move this item into Money to check."
          className="min-h-11 text-[var(--accent)] underline" onClick={() => onMove(item)}>This is for a home</button>
      </div>;
    })}</div>
  </details>;
}
