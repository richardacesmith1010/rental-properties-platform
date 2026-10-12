import { formatCurrency } from "@/lib/format";
import { groupByCategory, type Entry } from "@/lib/home-money";

export function CategoryCard({ entries }: { entries: Entry[] }) {
  return <section className="domus-card divide-y divide-[var(--line)] overflow-hidden rounded-2xl" aria-label="Categories">
    {groupByCategory(entries).map((row) => <div key={`${row.direction}-${row.label}`}
      className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold
        ${row.direction === "in" ? "bg-[var(--pos-bg)] text-[var(--pos)]" : "bg-[var(--surface-2)] text-[var(--ink)]"}`}>
        {row.label.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.label}</span>
      <span className={`num text-sm font-semibold ${row.direction === "in" ? "text-[var(--pos)]" : "text-[var(--ink)]"}`}>
        {row.direction === "in" ? "+" : "−"}{formatCurrency(row.amountCents)}
      </span>
    </div>)}
  </section>;
}
