"use client";

import { useRouter } from "next/navigation";
import { ReviewCard, type HomeOption, type RentOption } from "./review-card";
import type { BankChoice, Suggestion } from "@/lib/bank-feed/types";

export interface QueuedItem {
  id: string; bank_account_id: string; updated_at: string; posted_on: string;
  amount_cents: number; direction: "in" | "out"; description: string;
  suggestion: Suggestion | null; possible_duplicate: boolean;
}
export interface ChangedItem {
  id: string; description: string; bank_change: "modified" | "removed";
}

export function QueuedReviewList({ items, changed, properties, charges, actions }: {
  items: QueuedItem[]; changed: ChangedItem[]; properties: HomeOption[]; charges: RentOption[];
  actions: {
    answer: (input: { itemId: string; expectedUpdatedAt: string; decision: "yes" | "no";
      choice?: BankChoice; always: boolean }) => Promise<{ success: boolean; error?: string; message?: string }>;
    keep: (input: { bankTransactionId: string }) => Promise<{ success: boolean; error?: string }>;
    undo: (input: { bankTransactionId: string }) => Promise<{ success: boolean; error?: string }>;
  };
}) {
  const router = useRouter();
  return <>
    {items.length ? <section className="space-y-3" aria-label="Money to check">
      <h2 className="text-xl font-semibold">Money to check</h2>
      {items.map((row) => <div key={row.id}>
        {row.possible_duplicate ? <p className="mb-2 text-sm text-[var(--muted)]">
          Maybe already added from a statement file.</p> : null}
        <ReviewCard item={{ i: 0, token: row.id, suggestion: row.suggestion || undefined, ruleable: true }}
          row={{ postedOn: row.posted_on, amountCents: row.amount_cents,
            direction: row.direction, description: row.description }}
          properties={properties} charges={charges}
          onAnswer={async (_item, decision, always, choice) => {
            const result = await actions.answer({ itemId: row.id, expectedUpdatedAt: row.updated_at,
              decision, always, choice });
            if (result.success) router.refresh();
            return result;
          }} onUndo={(id) => actions.undo({ bankTransactionId: id })} />
      </div>)}
    </section> : null}
    {changed.length ? <section className="space-y-3" aria-label="Bank changed this">
      <h2 className="text-xl font-semibold">Bank changed this</h2>
      {changed.map((item) => <article key={item.id} className="domus-card space-y-2 p-4">
        <p className="font-medium">{item.description}</p>
        <p className="text-sm text-[var(--muted)]">{item.bank_change === "modified"
          ? "The bank changed this after it was filed."
          : "The bank removed this after it was filed."}</p>
        <div className="flex gap-4">
          <button type="button" title="Keep as is" className="min-h-11 text-[var(--accent)]"
            onClick={async () => { if ((await actions.keep({ bankTransactionId: item.id })).success) router.refresh(); }}>
            Keep as is</button>
          <button type="button" title="Undo" className="min-h-11 text-[var(--accent)]"
            onClick={async () => { if ((await actions.undo({ bankTransactionId: item.id })).success) router.refresh(); }}>
            Undo</button>
        </div>
      </article>)}
    </section> : null}
  </>;
}
