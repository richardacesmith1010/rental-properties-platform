export const STATEMENT_ZONE = "America/Denver";

export function denverDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STATEMENT_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
}

export function latestStatementMonth(now = new Date()): string {
  return denverDate(now).slice(0, 7);
}

export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function statementMonthOptions(now = new Date()): string[] {
  const current = latestStatementMonth(now);
  return Array.from({ length: 12 }, (_, index) => shiftMonth(current, -index));
}

export function defaultStatementMonth(now = new Date()): string {
  const current = latestStatementMonth(now);
  return Number(denverDate(now).slice(8)) <= 10 ? shiftMonth(current, -1) : current;
}

export function isStatementMonth(month: string, now = new Date()): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return false;
  const latest = latestStatementMonth(now);
  return month <= latest && month >= shiftMonth(latest, -36);
}

function midnightUtc(date: string): string {
  const noon = new Date(`${date}T07:00:00Z`);
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: STATEMENT_ZONE, timeZoneName: "shortOffset" })
    .formatToParts(noon).find((part) => part.type === "timeZoneName")?.value ?? "GMT-7";
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone);
  if (!match) throw new Error("Could not read Denver time.");
  const minutes = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === "+" ? 1 : -1);
  return new Date(Date.parse(`${date}T00:00:00Z`) - minutes * 60_000).toISOString();
}

export function statementMonthWindow(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month.");
  const next = shiftMonth(month, 1);
  const endDate = new Date(Date.parse(`${next}-01T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return { start: midnightUtc(`${month}-01`), next: midnightUtc(`${next}-01`),
    startDate: `${month}-01`, nextDate: `${next}-01`, endDate };
}

export function statementMonthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T12:00:00Z`));
}

export function statementPeriodLabel(month: string): string {
  const end = Number(statementMonthWindow(month).endDate.slice(8));
  const label = statementMonthLabel(month);
  return `${label.replace(/ \d{4}$/, "")} 1 – ${end}, ${month.slice(0, 4)}`;
}

export function denverDateFromTimestamp(value: string): string { return denverDate(new Date(value)); }
export function madeDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: STATEMENT_ZONE })
    .format(new Date(value));
}
