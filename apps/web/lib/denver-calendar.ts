import { DISPLAY_TIME_ZONE } from "@/lib/format";

export const STATEMENT_ZONE = DISPLAY_TIME_ZONE;

/** A timestamp's Denver calendar date. Date-only strings should stay date-only. */
export function todayDenver(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STATEMENT_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
}

export function denverDateOf(ts: string | Date): string {
  return todayDenver(typeof ts === "string" ? new Date(ts) : ts);
}

export function addDays(iso: string, n: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export function denverMonth(now = new Date()): string { return todayDenver(now).slice(0, 7); }
export function denverYear(now = new Date()): number { return Number(todayDenver(now).slice(0, 4)); }

export function denverDayStartUtc(iso: string): string {
  const noon = new Date(`${iso}T07:00:00Z`);
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: STATEMENT_ZONE, timeZoneName: "shortOffset" })
    .formatToParts(noon).find((part) => part.type === "timeZoneName")?.value ?? "GMT-7";
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone);
  if (!match) throw new Error("Could not read Denver time.");
  const minutes = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === "+" ? 1 : -1);
  return new Date(Date.parse(`${iso}T00:00:00Z`) - minutes * 60_000).toISOString();
}
