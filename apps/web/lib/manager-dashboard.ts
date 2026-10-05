import { isCollectedOutsideDomus, type LeaseCollectionPreference } from "@/lib/lease-collection";

interface ManagerCharge {
  id: string;
  leaseId: string;
  dueDate: string;
  amountCents: number;
  status: "pending" | "paid" | "late";
}

export function getManagerChargeStatus(
  status: ManagerCharge["status"],
  lease: LeaseCollectionPreference | null | undefined
): ManagerCharge["status"] {
  return status === "late" && isCollectedOutsideDomus(lease) ? "pending" : status;
}

export function summarizeManagerLateCharges(
  charges: Array<{ amount_cents: number; lease_id: string }>,
  leaseById: ReadonlyMap<string, LeaseCollectionPreference>
) {
  const lateCharges = charges.filter(
    (charge) => !isCollectedOutsideDomus(leaseById.get(charge.lease_id))
  );
  return {
    lateRentCents: lateCharges.reduce((sum, charge) => sum + charge.amount_cents, 0),
    lateAccountCount: new Set(lateCharges.map((charge) => charge.lease_id)).size
  };
}
