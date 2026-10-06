import { MIN_ONLINE_PAYMENT_CENTS } from "@/lib/payment-fees";
import { isCollectedOutsideDomus } from "@/lib/lease-collection";

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
  const outside = isCollectedOutsideDomus(input.charge) || isCollectedOutsideDomus(input.lease);
  if (outside) return "outside";
  if (input.lastPayment && !input.charge) return "paid";
  if (!input.charge) return "not_posted";
  if (!input.stripeConfigured || !input.ownerConnected || input.charge.amountCents < MIN_ONLINE_PAYMENT_CENTS) {
    return "not_ready";
  }
  return "can_pay";
}

export function getNextRentDueDate(dueDayOfMonth: number, today = new Date(), leaseStartDate?: string): string {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const daysInMonth = (candidateYear: number, candidateMonth: number) =>
    new Date(Date.UTC(candidateYear, candidateMonth + 1, 0)).getUTCDate();
  const buildCandidate = (candidateYear: number, candidateMonth: number) =>
    new Date(Date.UTC(candidateYear, candidateMonth, Math.min(dueDayOfMonth, daysInMonth(candidateYear, candidateMonth))));

  let candidate = buildCandidate(year, month);
  if (candidate < new Date(Date.UTC(year, month, today.getUTCDate()))) {
    candidate = buildCandidate(year, month + 1);
  }

  if (leaseStartDate) {
    const start = new Date(`${leaseStartDate}T00:00:00.000Z`);
    if (candidate < start) candidate = start;
  }

  return candidate.toISOString().slice(0, 10);
}
