"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { groupByCategory, homeMoneyCsv, runningBalance, type Entry, type MoneyAlert } from "@/lib/home-money";

export interface HomeMoneyPageData {
  property: { id: string; name: string };
  entries: Entry[];
  totals: { inCents: number; outCents: number; leftCents: number };
  alerts: MoneyAlert[];
  properties: Array<{ id: string; name: string }>;
}
interface Props { data: HomeMoneyPageData; selectedMonth: string; months: string[]; }
interface HomeCardData { month: string; homes: Array<{ propertyId: string; name: string; inCents: number;
  outCents: number; leftCents: number; alertCount: number }>; moreCount: number; }

function monthLabel(month: string, style: "short" | "long" = "short") {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: style, timeZone: "UTC" });
}

function itemDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC"
  });
}

export function HomeMoneyCard() {
  const [data, setData] = useState<HomeCardData | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/owner/home-money", { signal: controller.signal, credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("home money")))
      .then(setData).catch((reason: unknown) => { if ((reason as { name?: string }).name !== "AbortError") setError(true); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  return <div className="domus-card flex min-h-[150px] flex-col gap-4 p-4">
    {loading ? <div className="animate-pulse space-y-3"><div className="h-5 w-36 rounded bg-[var(--surface-2)]" />
      <div className="h-12 rounded bg-[var(--surface-2)]" /></div>
      : error ? <p className="text-sm text-[var(--muted)]">Numbers are not ready. Try again later.</p> : <>
        <h2 className="font-semibold text-[var(--ink)]">This month</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(data?.homes ?? []).map((home) => <div key={home.propertyId}
          className="rounded-md border border-[var(--line)] p-3">
          <p className="font-medium">{home.name} · {monthLabel(data?.month ?? "", "long")}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm"><span className="text-[var(--ok)]">
            In {formatCurrency(home.inCents)}</span><span>Out {formatCurrency(home.outCents)}</span>
            <span className={home.leftCents < 0 ? "text-[var(--crit)]" : "text-[var(--ink)]"}>
              Left {formatCurrency(home.leftCents)}</span></div>{home.alertCount ? <p className="mt-2 text-xs text-[var(--warn)]">
                {home.alertCount} thing{home.alertCount === 1 ? "" : "s"} to check</p> : null}
          <Link href={`/owner/money?property=${home.propertyId}`} className="mt-2 inline-flex min-h-11 items-center
            text-sm text-[var(--accent)] underline"
            title={`See money details for ${home.name}.`}>Details</Link></div>)}</div>
        {data?.moreCount ? <p className="text-sm text-[var(--muted)]">+ {data.moreCount} more home
          {data.moreCount === 1 ? "" : "s"}</p> : null}</>}
    <div className="mt-auto border-t border-[var(--line)] pt-3"><Link href="/owner/bank" title="Open your bank activity."
      className="text-sm text-[var(--accent)] underline">Sort your bank file</Link></div>
  </div>;
}

export function HomeMoneyPage({ data, selectedMonth, months }: Props) {
  const entries = runningBalance(data.entries);
  const period = selectedMonth === "year" ? "year" : selectedMonth;
  const download = () => {
    const blob = new Blob([homeMoneyCsv(entries)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url;
    link.download = `${data.property.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${period}.csv`;
    link.click(); URL.revokeObjectURL(url);
  };
  return <div className="space-y-5">
    <header><h1 className="text-3xl font-semibold">{data.property.name} money</h1>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Month tabs">
        {months.map((month) => <Link key={month} href={`/owner/money?property=${data.property.id}&month=${month}`}
          className={`min-h-11 rounded-md border px-4 py-3 text-sm ${selectedMonth === month
            ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>{monthLabel(month)}</Link>)}
        <Link href={`/owner/money?property=${data.property.id}&month=year`}
          className={`min-h-11 rounded-md border px-4 py-3 text-sm ${selectedMonth === "year"
            ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>This year</Link>
      </div>
    </header>
    {data.properties.length > 1 ? <nav className="flex flex-wrap gap-2" aria-label="Homes">
      {data.properties.map((property) => <Link key={property.id}
        href={`/owner/money?property=${property.id}&month=${period}`}
        className="min-h-11 rounded-md border border-[var(--line)] px-4 py-3">{property.name}</Link>)}
    </nav> : null}
    <section className="domus-card p-5"><p className="text-sm text-[var(--muted)]">Left after bills</p>
      <p className={`mt-1 text-4xl font-semibold ${data.totals.leftCents < 0 ? "text-[var(--crit)]" : "text-[var(--ink)]"}`}>
        {formatCurrency(data.totals.leftCents)}</p>
      <div className="mt-5 space-y-2">{groupByCategory(data.entries).map((line) => <div
        key={`${line.direction}-${line.label}`} className={`flex justify-between ${line.direction === "in"
          ? "text-[var(--ok)]" : "text-[var(--ink)]"}`}><span>{line.label}</span>
          <span>{line.direction === "in" ? "+" : "−"}{formatCurrency(line.amountCents)}</span></div>)}</div>
    </section>
    <section aria-labelledby="heads-up-title"><h2 id="heads-up-title" className="text-xl font-semibold">Heads up</h2>
      {data.alerts.length ? <div className="mt-2 space-y-2">{data.alerts.map((alert) => <div
        key={`${alert.type}-${alert.title}`} className={`rounded-lg border p-4 ${alert.type === "higher-than-usual"
          ? "border-[var(--warn)] bg-[color:var(--warn)]/10" : "border-[var(--line)]"}`}>
          <p className="font-semibold">{alert.title}</p><p className="text-sm text-[var(--muted)]">{alert.detail}</p></div>)}</div>
        : <p className="mt-2 text-[var(--muted)]">Nothing unusual this month.</p>}
    </section>
    <section aria-labelledby="every-item-title"><div className="flex items-center justify-between gap-3">
      <h2 id="every-item-title" className="text-xl font-semibold">Every item</h2>
      <button type="button" onClick={download} title="Download this home's money for taxes."
        className="min-h-11 rounded-md bg-[var(--accent)] px-4 font-semibold text-white">Download for taxes</button>
    </div>{entries.length ? <>
      <div className="domus-card mt-3 divide-y divide-[var(--line)] sm:hidden" data-testid="stacked-money-rows">
        {entries.map((entry) => <div key={entry.id} className="space-y-2 p-4 text-sm">
          <div className="flex justify-between gap-3 font-medium"><span>{itemDate(entry.date)}</span><span>{entry.title}</span></div>
          <div className="text-[var(--muted)]">{entry.source}</div>
          <div className="flex justify-between gap-3"><span>{entry.direction === "in" ? "+" : "−"}
            {formatCurrency(entry.amountCents)}</span><span>Balance {formatCurrency(entry.balanceCents)}</span></div>
        </div>)}
      </div>
      <div className="domus-card mt-3 hidden overflow-x-auto sm:block"><table className="w-full text-left text-sm">
        <thead><tr className="border-b border-[var(--line)] text-[var(--muted)]">
          <th className="p-4">Date</th><th className="p-4">What</th><th className="p-4">Type</th>
          <th className="p-4">Amount</th><th className="p-4">Balance</th>
        </tr></thead>
        <tbody>{entries.map((entry) => <tr key={entry.id} className="border-b border-[var(--line)] last:border-0">
          <td className="p-4">{itemDate(entry.date)}</td>
          <td className="p-4"><span>{entry.title}</span><small className="block text-[var(--muted)]">{entry.source}</small></td>
          <td className="p-4">{entry.kind === "rent" ? "Rent" : "Bill"}</td>
          <td className="p-4">{entry.direction === "in" ? "+" : "−"}{formatCurrency(entry.amountCents)}</td>
          <td className="p-4">{formatCurrency(entry.balanceCents)}</td>
        </tr>)}</tbody>
      </table></div>
    </>
      : <div className="domus-card mt-3 p-5"><p>Nothing here yet. <Link className="text-[var(--accent)] underline"
        href="/owner/bank">Upload a bank file to fill this in.</Link></p></div>}
    </section>
  </div>;
}
