export interface ChargeLine {
  id: string;
  lease_id: string;
  charge_id: string | null;
  kind: "utility" | "credit";
  label: string;
  amount_cents: number;
  created_at?: string;
  waitingForBiggerBill?: boolean;
}
export interface ChargeAmount { id: string; amount_cents: number }
export interface ChargeParts {
  rentCents: number; utilityCents: number; creditCents: number; totalCents: number;
}

export function chargeBreakdown(charge: ChargeAmount, lines: Pick<ChargeLine, "kind" | "amount_cents">[]): ChargeParts {
  const utilityCents = lines.filter((line) => line.kind === "utility")
    .reduce((sum, line) => sum + line.amount_cents, 0);
  const creditCents = lines.filter((line) => line.kind === "credit")
    .reduce((sum, line) => sum + line.amount_cents, 0);
  const rentCents = charge.amount_cents - utilityCents - creditCents;
  if (!Number.isSafeInteger(rentCents) || rentCents < 0 ||
      rentCents + utilityCents + creditCents !== charge.amount_cents) {
    throw new Error("Charge lines do not reconcile.");
  }
  return { rentCents, utilityCents, creditCents, totalCents: charge.amount_cents };
}

export function splitChargePayment(parts: ChargeParts) {
  let credit = -parts.creditCents;
  const rentIncomeCents = Math.max(0, parts.rentCents - credit);
  credit = Math.max(0, credit - parts.rentCents);
  const waterPaidBackCents = Math.max(0, parts.utilityCents - credit);
  if (rentIncomeCents + waterPaidBackCents !== parts.totalCents) {
    throw new Error("Charge payment does not reconcile.");
  }
  return { rentIncomeCents, waterPaidBackCents };
}
