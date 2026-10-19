import { formatCurrency } from "@/lib/format";
import type { OwnerHomeMoneyResult } from "@/lib/owner-recent-activity";

export function RecentActivity({ money }: { money?: OwnerHomeMoneyResult }) {
  const items = money?.ok ? [...money.items].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 5) : [];
  return <section aria-labelledby="recent-activity-title">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id="recent-activity-title" className="font-display text-[18px] font-semibold text-[var(--ink)]">Recent activity</h2>
      <a
        href="/owner/money"
        title="See all money activity"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent)]"
      >
        See all
      </a>
    </div>
    {!money?.ok ? <p className="text-sm text-[var(--muted)]">Couldn&apos;t load</p>
      : items.length === 0 ? <p className="text-sm text-[var(--muted)]">No recent money activity.</p>
        : <div className="domus-card divide-y divide-[var(--line)] overflow-hidden rounded-2xl">
          {items.map((item) => (
            <div
              key={`${item.direction}-${item.id}`}
              className="flex min-h-16 items-center justify-between gap-3 px-4 py-2"
            >
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--ink)]">{item.title}</p>
              <p className="truncate text-xs text-[var(--muted)]">{new Date(`${item.date}T00:00:00Z`).toLocaleDateString("en-US", {
                month: "short", day: "numeric", timeZone: "UTC"
              })} · {item.propertyName}</p>
            </div>
            <span className={`num shrink-0 font-semibold ${item.direction === "in" ? "text-[var(--pos)]" : "text-[var(--ink)]"}`}>
              {item.direction === "in" ? "+" : "−"}{formatCurrency(item.amountCents)}</span>
            </div>
          ))}
        </div>}
  </section>;
}
