import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { generateMonthlyChargesForPropertyIdsWithClient } from "@/lib/charge-generation";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { getOwnerStripeAccountForProperty } from "@/lib/stripe-connect";
import { createOffSessionPaymentIntent } from "@/lib/stripe-autopay";

export {
  createOffSessionPaymentIntent,
  createStripeCustomer,
  createSetupCheckoutSession,
  retrieveSetupIntent,
  getPaymentMethod
} from "@/lib/stripe-autopay";

interface AutopayEnrollmentRow {
  id: string;
  lease_id: string;
  tenant_profile_id: string;
  stripe_payment_method_id: string;
  retry_count: number;
  last_failed_at: string | null;
}

interface LeaseRow {
  id: string;
  unit_id: string;
  active: boolean;
}

function retryWindowOpen(lastFailedAt: string | null) {
  if (!lastFailedAt) {
    return true;
  }

  const retryAt = new Date(lastFailedAt);
  retryAt.setUTCDate(retryAt.getUTCDate() + 3);
  return retryAt.getTime() <= Date.now();
}

async function processInBatches<T>(items: T[], fn: (item: T) => Promise<void>, concurrency = 5) {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(fn));
  }
}

export async function processAutopayCharges(
  supabase: SupabaseClient
): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
  const { data: enrollments, error: enrollmentError } = await supabase
    .from("autopay_enrollments")
    .select("id, lease_id, tenant_profile_id, stripe_payment_method_id, retry_count, last_failed_at")
    .eq("enabled", true);
  if (enrollmentError) {
    throw enrollmentError;
  }

  const enrollmentRows = (enrollments ?? []) as AutopayEnrollmentRow[];
  if (enrollmentRows.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const leaseIds = Array.from(new Set(enrollmentRows.map((row) => row.lease_id)));
  const { data: leases, error: leasesError } = await supabase
    .from("leases")
    .select("id, unit_id, active")
    .in("id", leaseIds);
  if (leasesError) throw leasesError;

  const activeLeases = ((leases ?? []) as LeaseRow[]).filter((lease) => lease.active);
  if (activeLeases.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const activeLeaseIds = activeLeases.map((lease) => lease.id);
  const activeLeaseIdSet = new Set(activeLeaseIds);
  const activeEnrollments = enrollmentRows.filter((row) => activeLeaseIdSet.has(row.lease_id));
  if (activeEnrollments.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const userIds = Array.from(new Set(activeEnrollments.map((row) => row.tenant_profile_id)));

  const [chargesResult, profilesResult, paymentsResult] = await Promise.all([
    supabase
      .from("rent_charges")
      .select("id, lease_id, due_date, amount_cents, status")
      .in("lease_id", activeLeaseIds)
      .eq("category", "rent")
      .in("status", ["pending", "late"])
      .lte("due_date", todayIso)
      .is("deleted_at", null)
      .order("due_date", { ascending: true }),
    supabase.from("profiles").select("id, stripe_customer_id").in("id", userIds),
    supabase.from("payments").select("id, rent_charge_id")
  ]);

  if (chargesResult.error) throw chargesResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (paymentsResult.error) throw paymentsResult.error;

  const leaseUnitIds = Array.from(new Set(activeLeases.map((lease) => lease.unit_id)));
  const { data: units, error: unitsError } = leaseUnitIds.length
    ? await supabase.from("units").select("id, property_id").in("id", leaseUnitIds)
    : { data: [] as Array<{ id: string; property_id: string }>, error: null };
  if (unitsError) {
    throw unitsError;
  }

  const existingPaymentChargeIds = new Set((paymentsResult.data ?? []).map((payment) => payment.rent_charge_id));
  const chargesByLease = new Map<string, Array<{ id: string; amount_cents: number }>>();
  for (const charge of chargesResult.data ?? []) {
    if (existingPaymentChargeIds.has(charge.id)) {
      continue;
    }
    const current = chargesByLease.get(charge.lease_id) ?? [];
    current.push({ id: charge.id, amount_cents: charge.amount_cents });
    chargesByLease.set(charge.lease_id, current);
  }

  const profileMap = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const leaseMap = new Map(activeLeases.map((lease) => [lease.id, lease]));
  const unitMap = new Map(((units ?? []) as Array<{ id: string; property_id: string }>).map((unit) => [unit.id, unit]));

  const ownerStripeAccountByProperty = new Map<string, string | null>();
  await processInBatches(
    Array.from(new Set((units ?? []).map((unit) => unit.property_id))),
    async (propertyId) => {
      ownerStripeAccountByProperty.set(propertyId, await getOwnerStripeAccountForProperty(propertyId));
    },
    5
  );

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const enrollment of activeEnrollments) {
    try {
      if (enrollment.retry_count > 0 && !retryWindowOpen(enrollment.last_failed_at)) {
        skipped += 1;
        continue;
      }

      const dueCharges = chargesByLease.get(enrollment.lease_id) ?? [];
      if (dueCharges.length === 0) {
        continue;
      }

      const profile = profileMap.get(enrollment.tenant_profile_id);
      const lease = leaseMap.get(enrollment.lease_id);
      const unit = lease ? unitMap.get(lease.unit_id) : null;
      const ownerStripeAccount = unit ? ownerStripeAccountByProperty.get(unit.property_id) : null;

      if (!profile?.stripe_customer_id || !lease?.unit_id || !unit?.property_id || !ownerStripeAccount) {
        skipped += dueCharges.length;
        continue;
      }

      for (const charge of dueCharges) {
        try {
          const { data: currentCharge, error: recheckError } = await supabase
            .from("rent_charges")
            .select("status, deleted_at")
            .eq("id", charge.id)
            .maybeSingle();

          if (recheckError) {
            console.error(`[autopay] re-check failed for charge ${charge.id}:`, recheckError);
            skipped += 1;
            continue;
          }

          if (!currentCharge || currentCharge.deleted_at !== null) {
            console.log(`[autopay] charge ${charge.id} no longer exists or was deleted; skipping autopay`);
            skipped += 1;
            continue;
          }

          if (currentCharge.status !== "pending" && currentCharge.status !== "late") {
            console.log(`[autopay] charge ${charge.id} status is now '${currentCharge.status}'; skipping autopay`);
            skipped += 1;
            continue;
          }

          processed += 1;
          const paymentIntent = await createOffSessionPaymentIntent({
            customerId: profile.stripe_customer_id,
            paymentMethodId: enrollment.stripe_payment_method_id,
            amountCents: charge.amount_cents,
            metadata: {
              charge_id: charge.id,
              user_id: enrollment.tenant_profile_id,
              lease_id: enrollment.lease_id,
              autopay: "true"
            },
            transferGroup: `charge_${charge.id}`
          });

          if (paymentIntent.status === "succeeded") {
            succeeded += 1;
          }
        } catch (chargeError) {
          console.error(`[autopay] Failed to process charge ${charge.id}:`, chargeError);
          failed += 1;
          break;
        }
      }
    } catch (enrollmentError) {
      console.error(`[autopay] Failed to process enrollment ${enrollment.id}:`, enrollmentError);
      failed += 1;
    }
  }

  return { processed, succeeded, failed, skipped };
}

export async function generateMonthlyChargesForAllOwnersWithClient(supabase: SupabaseClient): Promise<string> {
  const { data: profiles, error } = await supabase.from("profiles").select("id").in("role", ["owner", "manager"]);
  if (error) {
    throw error;
  }

  const propertyIds = new Set<string>();
  await Promise.all(
    ((profiles ?? []) as Array<{ id: string }>).map(async (profile) => {
      const ids = await getAdministeredPropertyIds(profile.id, supabase);
      ids.forEach((propertyId) => propertyIds.add(propertyId));
    })
  );

  if (propertyIds.size === 0) {
    return "No operators found.";
  }

  let generatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;

  await processInBatches(
    Array.from(propertyIds),
    async (propertyId) => {
      try {
        const message = await generateMonthlyChargesForPropertyIdsWithClient(supabase, [propertyId]);
        if (message.startsWith("Generated")) {
          generatedCount += 1;
        } else if (message.startsWith("No new charges generated")) {
          unchangedCount += 1;
        } else {
          skippedCount += 1;
        }
      } catch (generationError) {
        console.error(`[charges] Charge generation failed for property ${propertyId}:`, generationError);
        skippedCount += 1;
      }
    },
    5
  );

  return `Properties processed: ${propertyIds.size}. Generated: ${generatedCount}. Unchanged: ${unchangedCount}. Skipped: ${skippedCount}.`;
}

export async function generateMonthlyChargesForAllOwners(): Promise<string> {
  return generateMonthlyChargesForAllOwnersWithClient(createClient());
}
