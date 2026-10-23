import { addDays, denverDayStartUtc, todayDenver } from "@/lib/denver-calendar";
import {
  getAdministeredPropertyIds,
  getAdministeredPropertyIdsForAccount
} from "@/lib/property-access";
import { createAdminClient } from "@/lib/supabase/admin";

interface AiRecentPayment {
  tenantName: string;
  amountCents: number;
  paidAt: string;
}

export async function getRecentPaymentsForAi(userId: string, accountId?: string) {
  const admin = createAdminClient();
  const propertyIds = accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId, admin)
    : await getAdministeredPropertyIds(userId, admin);

  if (propertyIds.length === 0) {
    return [] as AiRecentPayment[];
  }

  const { data: units, error: unitsError } = await admin
    .from("units")
    .select("id, property_id")
    .in("property_id", propertyIds);
  if (unitsError) throw unitsError;

  const unitIds = (units ?? []).map((unit) => unit.id);
  if (unitIds.length === 0) {
    return [] as AiRecentPayment[];
  }

  const { data: leases, error: leasesError } = await admin
    .from("leases")
    .select("id, unit_id, tenant_profile_id")
    .in("unit_id", unitIds);
  if (leasesError) throw leasesError;

  const leaseRows =
    (leases ?? []) as Array<{
      id: string;
      unit_id: string;
      tenant_profile_id: string | null;
    }>;
  const leaseIds = leaseRows.map((lease) => lease.id);
  if (leaseIds.length === 0) {
    return [] as AiRecentPayment[];
  }

  const { data: charges, error: chargesError } = await admin
    .from("rent_charges")
    .select("id, lease_id")
    .in("lease_id", leaseIds);
  if (chargesError) throw chargesError;

  const chargeRows =
    (charges ?? []) as Array<{
      id: string;
      lease_id: string;
    }>;
  const chargeIds = chargeRows.map((charge) => charge.id);
  if (chargeIds.length === 0) {
    return [] as AiRecentPayment[];
  }

  const thirtyDaysAgo = denverDayStartUtc(addDays(todayDenver(), -30));

  const { data: payments, error: paymentsError } = await admin
    .from("payments")
    .select("rent_charge_id, amount_cents, paid_at")
    .in("rent_charge_id", chargeIds)
    .gte("paid_at", thirtyDaysAgo)
    .is("reversed_at", null)
    .order("paid_at", { ascending: false })
    .limit(10);
  if (paymentsError) throw paymentsError;

  const paymentRows =
    (payments ?? []) as Array<{
      rent_charge_id: string;
      amount_cents: number;
      paid_at: string;
    }>;
  if (paymentRows.length === 0) {
    return [] as AiRecentPayment[];
  }

  const tenantIds = Array.from(
    new Set(
      leaseRows
        .map((lease) => lease.tenant_profile_id)
        .filter((tenantId): tenantId is string => Boolean(tenantId))
    )
  );

  const { data: tenantProfiles, error: tenantProfilesError } = tenantIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", tenantIds)
    : {
        data: [] as Array<{
          id: string;
          full_name: string | null;
          email: string | null;
        }>,
        error: null
      };
  if (tenantProfilesError) throw tenantProfilesError;

  const leaseById = new Map(leaseRows.map((lease) => [lease.id, lease]));
  const chargeById = new Map(chargeRows.map((charge) => [charge.id, charge]));
  const tenantNameById = new Map(
    (tenantProfiles ?? []).map((profile) => [
      profile.id,
      profile.full_name ?? profile.email ?? "Unknown tenant"
    ])
  );

  return paymentRows
    .map((payment) => {
      const charge = chargeById.get(payment.rent_charge_id);
      const lease = charge ? leaseById.get(charge.lease_id) : null;
      const tenantName = lease?.tenant_profile_id
        ? tenantNameById.get(lease.tenant_profile_id) ?? "Unknown tenant"
        : "Unknown tenant";

      return {
        tenantName,
        amountCents: payment.amount_cents,
        paidAt: payment.paid_at
      };
    })
    .filter((payment) => Boolean(payment.tenantName));
}

