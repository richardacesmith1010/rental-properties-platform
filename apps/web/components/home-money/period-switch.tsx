import Link from "next/link";

export function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

export function PeriodSwitch({ months, selectedMonth, propertyId }: {
  months: string[]; selectedMonth: string; propertyId: string | null;
}) {
  const choices = [...months.slice(0, 2).map((month) => ({ value: month, label: monthLabel(month) })),
    { value: "year", label: months[0]?.slice(0, 4) ?? new Date().getUTCFullYear().toString() }];
  return <div role="tablist" aria-label="Period" className="grid grid-cols-3 rounded-xl bg-[var(--surface-2)] p-1">
    {choices.map((choice) => <Link key={choice.value} role="tab" aria-selected={selectedMonth === choice.value}
      href={`/owner/money?${propertyId ? `property=${encodeURIComponent(propertyId)}&` : ""}month=${choice.value}`}
      title={`Show money for ${choice.label}`}
      className={`flex min-h-11 items-center justify-center rounded-lg px-2 text-sm font-semibold text-[var(--ink)]
        ${selectedMonth === choice.value ? `bg-[var(--surface)] shadow-sm [html[data-theme=dark]_&]:bg-[var(--accent)]
          [html[data-theme=dark]_&]:text-[var(--accent-contrast)]
          [@media(prefers-color-scheme:dark)]:bg-[var(--accent)]
          [@media(prefers-color-scheme:dark)]:text-[var(--accent-contrast)]
          [html[data-theme=light]_&]:bg-[var(--surface)] [html[data-theme=light]_&]:text-[var(--ink)]` : ""}`}>
      {choice.label}
    </Link>)}
  </div>;
}
