import { todayDenver } from "@/lib/denver-calendar";
import { MIN_ONLINE_PAYMENT_CENTS } from "@/lib/payment-fees";
import { isCollectedOutsideDomus } from "@/lib/lease-collection";
import { isRentOpenForTenant } from "@/lib/rent-urgency";

export type TenantPayState = "can_pay" | "not_ready" | "outside" | "paid" | "not_posted" | "no_lease";

export interface TenantPayStateInput {
  charge?: { amountCents: number; dueDate: string; status: "pending" | "late"; collectsOutsideDomus?: boolean } | null;
  ownerConnected: boolean;
  stripeConfigured: boolean;
  lease?: { monthlyRentCents: number; dueDayOfMonth: number; collectsOutsideDomus?: boolean } | null;
  lastPayment?: { paidAt: string } | null;
  today?: Date;
}

export function getTenantPayState(input: TenantPayStateInput): TenantPayState {
  if (!input.lease) return "no_lease";
  const charge = input.charge && isRentOpenForTenant(input.charge.dueDate, input.today)
    ? input.charge : null;
  const outside = isCollectedOutsideDomus(charge) || isCollectedOutsideDomus(input.lease);
  if (outside) return "outside";
  if (input.lastPayment && !charge) return "paid";
  if (!charge) return "not_posted";
  if (!input.stripeConfigured || !input.ownerConnected || charge.amountCents < MIN_ONLINE_PAYMENT_CENTS) {
    return "not_ready";
  }
  return "can_pay";
}

export function getNextRentDueDate(dueDayOfMonth: number, today = new Date(), leaseStartDate?: string): string {
  const [year, calendarMonth] = todayDenver(today).split("-").map(Number);
  const month = calendarMonth - 1;
  const daysInMonth = (candidateYear: number, candidateMonth: number) =>
    new Date(Date.UTC(candidateYear, candidateMonth + 1, 0)).getUTCDate();
  const buildCandidate = (candidateYear: number, candidateMonth: number) =>
    new Date(Date.UTC(candidateYear, candidateMonth, Math.min(dueDayOfMonth, daysInMonth(candidateYear, candidateMonth))));

  let candidate = buildCandidate(year, month);
  if (candidate.toISOString().slice(0, 10) < todayDenver(today)) {
    candidate = buildCandidate(year, month + 1);
  }

  if (leaseStartDate) {
    const start = new Date(`${leaseStartDate}T00:00:00.000Z`);
    if (candidate < start) candidate = start;
  }

  return candidate.toISOString().slice(0, 10);
}
