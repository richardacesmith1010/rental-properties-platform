import { addDays, denverDateOf, denverYear } from "@/lib/denver-calendar";
import { getAuthenticatedUser, getCurrentUserRole } from "@/lib/auth";
import { rentOnlyReceivedByPropertyId } from "@/lib/rent-received";
import { getChargeLines } from "@/lib/charge-lines";
import { loadRentRowsForProperties } from "@/lib/owner-rent-rows";
import { getOwnershipAccountsForUser } from "@/lib/ownership";
import { getAdministeredProperties } from "@/lib/property-access";

export type OwnerYearRentResult = { ok: true; byPropertyId: Record<string, number> }
  | { ok: false; error: "load_failed" };

export async function loadOwnerYearRentReceived(accountId?: string | null): Promise<OwnerYearRentResult> {
  const user = await getAuthenticatedUser();
  try {
    if (await getCurrentUserRole(user.id) !== "owner") return { ok: true, byPropertyId: {} };
    const [administered, accounts] = await Promise.all([
      getAdministeredProperties(user.id), getOwnershipAccountsForUser(user.id)
    ]);
    if (accountId && !accounts.some((account) => account.id === accountId)) {
      return { ok: true, byPropertyId: {} };
    }
    const properties = administered.filter((property) => !accountId || property.ownerAccountId === accountId);
    if (!properties.length) return { ok: true, byPropertyId: {} };
    const year = denverYear();
    const from = `${year}-01-01`, to = `${year + 1}-01-01`;
    const { units, leases, charges, payments } = await loadRentRowsForProperties(
      properties.map((property) => property.id), addDays(from, -1), addDays(to, 1));
    const unitProperty = new Map(units.map((unit) => [unit.id, unit.property_id]));
    const leaseProperty = new Map(leases.map((lease) => [lease.id, unitProperty.get(lease.unit_id)]));
    const chargeProperty = new Map(charges.map((charge) => [charge.id, leaseProperty.get(charge.lease_id)]));
    const lines = await getChargeLines(charges.map((charge) => charge.id));
    const byPropertyId = rentOnlyReceivedByPropertyId(
      properties.map((property) => property.id), charges,
      payments.map((payment) => ({ ...payment,
        paid_at: payment.paid_at.includes("T") ? denverDateOf(payment.paid_at) : payment.paid_at })),
      chargeProperty, from, to, lines);
    return { ok: true, byPropertyId };
  } catch (error) {
    console.error("Owner year rent load failed", error);
    return { ok: false, error: "load_failed" };
  }
}
