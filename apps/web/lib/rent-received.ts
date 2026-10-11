export interface RentChargeRow {
  id: string; category: string; deleted_at: string | null;
}
export interface RentPaymentRow {
  id: string; rent_charge_id: string; amount_cents: number;
  paid_at: string; reversed_at: string | null;
}

export const dateOnly = (value: string) => value.includes("T") ? value.slice(0, 10) : value;

/** Money's "This year" range is [Jan 1 UTC, next Jan 1 UTC); monthly ranges use the
 * same exclusive end. Payment paid_at controls the period, regardless of charge due
 * date or current day. Reversals and deleted charges do not count; every charge category
 * (rent, late fees, other) counts, as Money always has.
 * Each partial or additional payment contributes its own integer cents. */
export function receivedRentPayments<T extends RentPaymentRow>(
  charges: RentChargeRow[], payments: T[], from: string, to: string
): T[] {
  const eligibleChargeIds = new Set(charges.filter((charge) =>
    !charge.deleted_at).map((charge) => charge.id));
  return payments.filter((payment) => !payment.reversed_at && eligibleChargeIds.has(payment.rent_charge_id)
    && dateOnly(payment.paid_at) >= from && dateOnly(payment.paid_at) < to);
}

export function rentReceivedCents(charges: RentChargeRow[], payments: RentPaymentRow[], from: string, to: string): number {
  return receivedRentPayments(charges, payments, from, to)
    .reduce((sum, payment) => sum + payment.amount_cents, 0);
}

export function rentReceivedByPropertyId(
  propertyIds: string[], charges: RentChargeRow[], payments: RentPaymentRow[],
  chargeProperty: Map<string, string | undefined>, from: string, to: string
): Record<string, number> {
  const chargesByProperty = new Map<string, RentChargeRow[]>();
  const paymentsByProperty = new Map<string, RentPaymentRow[]>();
  for (const charge of charges) {
    const propertyId = chargeProperty.get(charge.id);
    if (propertyId) {
      const group = chargesByProperty.get(propertyId) ?? [];
      group.push(charge);
      chargesByProperty.set(propertyId, group);
    }
  }
  for (const payment of payments) {
    const propertyId = chargeProperty.get(payment.rent_charge_id);
    if (propertyId) {
      const group = paymentsByProperty.get(propertyId) ?? [];
      group.push(payment);
      paymentsByProperty.set(propertyId, group);
    }
  }
  return Object.fromEntries(propertyIds.map((id) => [id,
    rentReceivedCents(chargesByProperty.get(id) ?? [], paymentsByProperty.get(id) ?? [], from, to)]));
}

export function selectedRentReceivedCents(byPropertyId: Record<string, number>, selectedIds?: Set<string> | null) {
  return Object.entries(byPropertyId).reduce((sum, [id, cents]) =>
    sum + (!selectedIds || selectedIds.has(id) ? cents : 0), 0);
}
