import { MIN_ONLINE_PAYMENT_CENTS } from "@/lib/payment-fees";
import { isCollectedOutsideDomus } from "@/lib/lease-collection";

export type TenantPayState = "can_pay" | "not_ready" | "outside" | "paid" | "not_posted";

export interface TenantPayStateInput {
  charge?: { amountCents: number; dueDate: string; status: "pending" | "late"; collectsOutsideDomus?: boolean } | null;
  ownerConnected: boolean;
  stripeConfigured: boolean;
  lease?: { monthlyRentCents: number; dueDayOfMonth: number; collectsOutsideDomus?: boolean } | null;
  lastPayment?: { paidAt: string } | null;
  today?: Date;
}

export function getTenantPayState(input: TenantPayStateInput): TenantPayState {
  const outside = isCollectedOutsideDomus(input.charge) || isCollectedOutsideDomus(input.lease);
  if (outside) return "outside";
  if (input.lastPayment && !input.charge) return "paid";
  if (!input.charge) return input.lease ? "not_posted" : "not_posted";
  if (!input.stripeConfigured || !input.ownerConnected || input.charge.amountCents < MIN_ONLINE_PAYMENT_CENTS) {
    return "not_ready";
  }
  return "can_pay";
}

export function getNextRentDueDate(dueDayOfMonth: number, today = new Date()): string {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const candidate = new Date(Date.UTC(year, month, Math.min(dueDayOfMonth, 28)));
  if (candidate.getUTCDate() < today.getUTCDate()) candidate.setUTCMonth(month + 1);
  return candidate.toISOString().slice(0, 10);
}
