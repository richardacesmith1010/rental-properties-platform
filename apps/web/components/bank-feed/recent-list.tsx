import { formatCurrency, formatDate } from "@/lib/format";

export interface RecentItem { id: string; posted_on: string; description: string; amount_cents: number;
  direction: "in" | "out"; kind: "rent" | "expense" | "transfer"; propertyName: string }

export function RecentList({ items }: { items: RecentItem[] }) {
  return <section className="domus-card space-y-3 p-4 text-[var(--ink)]">
    <h2 className="text-lg font-semibold">Recent bank items</h2>
    {items.length ? <ul className="divide-y divide-[var(--line)]">{items.map((item) =>
      <li key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
        <div><p className="break-words font-medium">{item.description}</p>
          <p className="text-sm text-[var(--muted)]">{formatDate(item.posted_on)} · {item.propertyName} · {
            item.kind === "rent" ? "Rent" : item.kind === "expense" ? "Bill" : "Moving my money"}</p></div>
        <p className="font-semibold">{item.direction === "in" ? "+" : "−"}{formatCurrency(item.amount_cents)}</p>
      </li>)}</ul> : <p className="text-sm text-[var(--muted)]">No items filed yet.</p>}
  </section>;
}
