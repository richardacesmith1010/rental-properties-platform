"use client";

import { CashOnHandCard } from "./cash-on-hand-card";
import type { CashOnHand } from "@/lib/cash-on-hand";

import Link from "next/link";
import { homeMoneyCsv, runningBalance, type Entry, type MoneyAlert } from "@/lib/home-money";
import { MoneyHero } from "./money-hero";
import { PeriodSwitch, monthLabel } from "./period-switch";
import { CategoryCard } from "./category-card";
import { PartnersCard } from "./partners-card";
import type { PartnerReport } from "@/lib/partners";
import type { addPartner, renamePartner, deactivatePartner,
  addPartnerPayment, updatePartnerPayment, deletePartnerPayment } from "@/app/actions/partners";
import { EveryItem } from "./every-item";

export interface HomeMoneyPageData {
  property: { id: string; name: string } | null;
  entries: Entry[];
  totals: { inCents: number; outCents: number; leftCents: number };
  alerts: Array<MoneyAlert & { homeName?: string }>;
  properties: Array<{ id: string; name: string }>;
}
interface Props { cashAccounts?: CashOnHand[]; cashWarning?: string; data: HomeMoneyPageData; selectedMonth: string; months: string[];
  partnerWarning?: string;
  partnerData?: { accountId: string; report: PartnerReport; period: string; allTimeHref: string; periodHref: string;
    onAddPartner: typeof addPartner; onRenamePartner: typeof renamePartner;
    onDeactivatePartner: typeof deactivatePartner; onAddPayment: typeof addPartnerPayment;
    onUpdatePayment: typeof updatePartnerPayment; onDeletePayment: typeof deletePartnerPayment } }

export function HomeMoneyPage({ data, selectedMonth, months, partnerData, partnerWarning, cashAccounts = [], cashWarning }: Props) {
  const allHomes = !data.property;
  const propertyId = data.property?.id ?? null;
  const label = selectedMonth === "year" ? months[0]?.slice(0, 4) ?? "" : monthLabel(selectedMonth);
  const download = () => {
    const csv = homeMoneyCsv(allHomes ? data.entries : runningBalance(data.entries), allHomes);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const name = data.property?.name ?? "All-homes";
    link.href = url;
    link.download = `${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return <div className="space-y-5">
    <header className="flex items-center justify-between gap-3">
      <h1 className="text-[34px] font-bold leading-tight">Money</h1>
      <button type="button" onClick={download} title="Download current money for taxes"
        className="domus-card min-h-11 rounded-full px-5 text-sm font-semibold">For taxes</button>
    </header>
    {data.properties.length >= 2 && <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Homes">
      {[{ id: null, name: "All homes" }, ...data.properties].map((home) => <Link key={home.id ?? "all"}
        href={`/owner/money?${home.id ? `property=${encodeURIComponent(home.id)}&` : ""}month=${selectedMonth}`}
        title={`Show money for ${home.name}`}
        className={`flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold
          ${propertyId === home.id ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "domus-card"}`}>
        {home.name}
      </Link>)}
    </nav>}
    <PeriodSwitch months={months} selectedMonth={selectedMonth} propertyId={propertyId} />
    <MoneyHero label={label} totals={data.totals} />
    <CategoryCard entries={data.entries} />
    <CashOnHandCard accounts={cashAccounts} warning={cashWarning} />
    {partnerData && <PartnersCard {...partnerData} />}
    {partnerWarning && <section className="domus-card rounded-2xl p-4" aria-label="Partners">
      <h2 className="text-lg font-semibold">Partners</h2>
      <p className="text-sm text-[var(--muted)]">{partnerWarning}</p>
    </section>}
    {data.alerts.length > 0 && <section aria-labelledby="heads-up-title">
      <h2 id="heads-up-title" className="mb-2 text-lg font-semibold">Heads up</h2>
      <div className="space-y-2">{data.alerts.map((alert, index) => <div key={`${alert.type}-${index}`}
        className="rounded-2xl bg-[var(--warn-bg)] p-4 text-[var(--ink)]">
        <p className="font-semibold">{allHomes && data.properties.length >= 2 ? `${alert.homeName} · ` : ""}{alert.title}</p>
        <p className="mt-1 text-sm">{alert.detail}</p>
      </div>)}</div>
    </section>}
    <EveryItem entries={data.entries} allHomes={allHomes} />
  </div>;
}
