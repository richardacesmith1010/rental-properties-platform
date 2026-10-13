"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { OwnerWalletHomeResult, WalletHomeEntry } from "@/lib/owner-wallet-home";
import { passCardStyle } from "../owner-home/home-pass-card";

export function leaseEndLabel(date: string | null) {
  return date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
  }) : "Month to month";
}

function field(label: string, value: string) {
  return <div className="min-w-0"><dt className="text-xs text-white/80">{label}</dt>
    <dd className="num mt-1 truncate text-sm font-semibold">{value}</dd></div>;
}

function WalletCard({ home, index, onAddTenant }: {
  home: WalletHomeEntry; index: number; onAddTenant: (id: string) => void;
}) {
  const leased = home.activeLeases.length > 0;
  const names = [...new Set(home.activeLeases.flatMap((lease) => lease.tenantNames))].join(", ");
  const rent = home.activeLeases.reduce((sum, lease) => sum + lease.rentCents, 0);
  const chip = leased ? (home.isLate ? "Rent late" : "Rented") : "No lease yet";
  return <article className="overflow-hidden text-white" style={passCardStyle(index)}>
    <a href={`/owner/properties/${encodeURIComponent(home.id)}`} title={`Open ${home.name}`}
      className="block min-h-11 p-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h3 className="truncate text-[17px] font-bold">{home.name}</h3>
          <p className="mt-1 truncate text-[13px] text-white/80">{home.addressLine1} · {home.city}, {home.state}</p></div>
        <span className="shrink-0 rounded-full border border-white/80 px-2.5 py-1 text-xs font-semibold">{chip}</span>
      </div>
      {leased && <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 pb-2">
        {field("Tenant", names)}
        {field("Rent", `${formatCurrency(rent)} / mo`)}
        {field("Lease ends", leaseEndLabel(home.leaseEndDate))}
        {field("Paid this year", home.rentDueThisYear
          ? `${home.rentOnTimeThisYear} of ${home.rentDueThisYear} on time` : "No rent due yet")}
        {field("Deposit", home.depositReturned ? "Returned" : `${formatCurrency(home.depositCents)} held`)}
      </dl>}
    </a>
    {!leased && <button type="button" onClick={() => onAddTenant(home.id)}
      title={`Add tenant and lease to ${home.name}`}
      className="mx-5 mb-5 min-h-11 w-[calc(100%-2.5rem)] rounded-xl bg-white px-4 font-semibold"
      style={{ color: passCardStyle(index).backgroundColor }}>Add tenant and lease</button>}
  </article>;
}

export function HomesWallet({ wallet, onAddHome, onAddTenant, manageContent }: {
  wallet?: OwnerWalletHomeResult; onAddHome: () => void; onAddTenant: (id: string) => void;
  manageContent: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const groups = new Map<string, { name: string; type: "individual" | "llc"; homes: WalletHomeEntry[] }>();
  if (wallet?.ok) for (const home of wallet.homes) {
    const group = groups.get(home.accountId) ?? { name: home.accountName, type: home.accountType, homes: [] };
    group.homes.push(home);
    groups.set(home.accountId, group);
  }
  const ordered = [...groups.values()].sort((a, b) =>
    Number(a.type !== "individual") - Number(b.type !== "individual") || a.name.localeCompare(b.name));
  let index = 0;
  return <div className="mx-auto max-w-[720px] space-y-6 py-1">
    <header className="flex items-center justify-between gap-3">
      <h1 className="text-[34px] font-bold leading-tight">Homes</h1>
      <button type="button" aria-label="Add a home" title="Add a home" onClick={onAddHome}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)]
          text-2xl font-semibold text-[var(--accent-contrast)]">+</button>
    </header>
    {!wallet?.ok && <p className="text-sm text-[var(--muted)]">{"Couldn't load your homes. Pull down to try again."}</p>}
    {ordered.map((group) => <section key={`${group.type}-${group.name}`} className="space-y-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {group.name} · {group.type === "individual" ? "Personal" : "LLC"}</h2>
      {group.homes.map((home) => <WalletCard key={home.id} home={home} index={index++} onAddTenant={onAddTenant} />)}
    </section>)}
    <section><button type="button" title="Manage homes" aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}
      className="domus-card flex min-h-14 w-full items-center rounded-2xl px-4 text-left font-semibold">
      <span className="flex-1">Manage homes</span>
      <ChevronRight className={`h-4 w-4 ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
    </button>{expanded && <div className="mt-4">{manageContent}</div>}</section>
  </div>;
}
