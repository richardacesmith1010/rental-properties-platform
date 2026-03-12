import { createClient } from "@/lib/supabase/server";
import { createNotificationWithDelivery, notifyOwnerMembersForProperty } from "@/lib/notifications";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { formatCurrency, formatDate } from "@/lib/format";
import { createOffSessionPaymentIntent } from "@/lib/autopay";
import { getOwnerStripeAccountForProperty } from "@/lib/stripe-connect";

type SupabaseLikeClient = Pick<ReturnType<typeof createClient>, "from">;

interface UnitRow {
  id: string;
  property_id: string;
}

interface LeaseRow {
  id: string;
  start_date: string;
  end_date: string;
  due_day_of_month: number;
  monthly_rent_cents: number;
  grace_period_days?: number | null;
  late_fee_cents?: number | null;
  lease_status?: "active" | "expiring_soon" | "expired" | "terminated" | "renewed" | null;
  unit_id?: string;
  tenant_profile_id?: string | null;
}

interface ExistingChargeRow {
  lease_id: string;
  due_date: string;
  category?: "rent" | "late_fee" | null;
}

interface LateChargeRow {
  id: string;
  lease_id: string;
  due_date: string;
  category?: "rent" | "late_fee" | null;
  status?: "pending" | "paid" | "late";
  parent_charge_id?: string | null;
}

interface LateLeaseRow {
  id: string;
  tenant_profile_id: string | null;
  unit_id: string;
  grace_period_days: number | null;
  late_fee_cents: number | null;
  lease_status: "active" | "expiring_soon" | "expired" | "terminated" | "renewed" | null;
}

interface ProfileEmailRow {
  id: string;
  email: string | null;
}

interface PropertyIdRow {
  id: string;
}

interface PropertyManagerAssignmentRow {
  property_id: string;
}

interface OwnershipMembershipRow {
  account_id: string;
}

interface ProfileIdRow {
  id: string;
}

interface AutopayEnrollmentRow {
  id: string;
  lease_id: string;
  tenant_profile_id: string;
  stripe_payment_method_id: string;
  retry_count: number;
  last_failed_at: string | null;
}

function getCandidateMonths() {
  const today = new Date();
  const baseYear = today.getUTCFullYear();
  const baseMonth = today.getUTCMonth();

  return [
    { year: baseYear, month: baseMonth },
    { year: baseMonth === 11 ? baseYear + 1 : baseYear, month: (baseMonth + 1) % 12 },
    { year: baseMonth >= 10 ? baseYear + 1 : baseYear, month: (baseMonth + 2) % 12 }
  ];
}

function nextDueDateOnOrAfterToday(dueDayOfMonth: number, todayIso: string) {
  const today = new Date();
  const baseYear = today.getUTCFullYear();
  const baseMonth = today.getUTCMonth();
  const monthStart = new Date(Date.UTC(baseYear, baseMonth, 1));

  for (let i = 0; i < 12; i += 1) {
    const year = monthStart.getUTCFullYear() + Math.floor((monthStart.getUTCMonth() + i) / 12);
    const month = (monthStart.getUTCMonth() + i) % 12;
    const dueDate = new Date(Date.UTC(year, month, dueDayOfMonth));
    const dueDateIso = dueDate.toISOString().slice(0, 10);
    if (dueDateIso >= todayIso) {
      return dueDateIso;
    }
  }

  return todayIso;
}

function buildDueDatesByLeaseId(leases: LeaseRow[], todayIso: string) {
  const candidateMonths = getCandidateMonths();
  const dueDatesByLeaseId = new Map<string, string[]>();

  for (const lease of leases) {
    const dueDates: string[] = [];

    for (const candidate of candidateMonths) {
      const dueDate = new Date(Date.UTC(candidate.year, candidate.month, lease.due_day_of_month));
      const dueDateIso = dueDate.toISOString().slice(0, 10);
      if (dueDateIso >= lease.start_date && dueDateIso <= lease.end_date) {
        dueDates.push(dueDateIso);
      }
    }

    if (dueDates.length > 0) {
      dueDatesByLeaseId.set(lease.id, dueDates);
      continue;
    }

    if (todayIso > lease.end_date) {
      continue;
    }

    const fallbackDueDate = nextDueDateOnOrAfterToday(lease.due_day_of_month, todayIso);
    if (fallbackDueDate >= lease.start_date && fallbackDueDate <= lease.end_date) {
      dueDatesByLeaseId.set(lease.id, [fallbackDueDate]);
      continue;
    }

    if (todayIso >= lease.start_date && todayIso <= lease.end_date) {
      dueDatesByLeaseId.set(lease.id, [todayIso]);
    }
  }

  return dueDatesByLeaseId;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function isPastGraceWindow(dueDateIso: string, gracePeriodDays: number, today: Date) {
  const dueDate = new Date(`${dueDateIso}T00:00:00.000Z`);
  dueDate.setUTCDate(dueDate.getUTCDate() + gracePeriodDays);
  return startOfUtcDay(today).getTime() > dueDate.getTime();
}

async function updateLeaseStatuses(
  supabase: SupabaseLikeClient,
  propertyIds: string[]
): Promise<void> {
  if (propertyIds.length === 0) {
    return;
  }

  const today = startOfUtcDay(new Date());
  const sixtyDaysFromNow = new Date(today);
  sixtyDaysFromNow.setUTCDate(sixtyDaysFromNow.getUTCDate() + 60);

  const { data: propertyUnits } = await supabase
    .from("units")
    .select("id")
    .in("property_id", propertyIds);

  const unitIds = (propertyUnits ?? []).map((unit) => unit.id);
  if (unitIds.length === 0) {
    return;
  }

  const { data: activeLeases } = await supabase
    .from("leases")
    .select("id, end_date, lease_status, active")
    .in("unit_id", unitIds)
    .eq("active", true);

  const activeLeaseRows = (activeLeases ?? []) as Array<{
    id: string;
    end_date: string;
    lease_status: "active" | "expiring_soon" | "expired" | "terminated" | "renewed" | null;
    active: boolean;
  }>;

  if (activeLeaseRows.length === 0) {
    return;
  }

  const expiringSoonLeaseIds: string[] = [];
  const expiredLeaseIds: string[] = [];

  for (const lease of activeLeaseRows) {
    const status = lease.lease_status ?? "active";
    if (status === "terminated" || status === "renewed") {
      continue;
    }

    const endDate = new Date(`${lease.end_date}T00:00:00.000Z`);
    if (endDate.getTime() < today.getTime()) {
      expiredLeaseIds.push(lease.id);
      continue;
    }

    if (
      status === "active" &&
      endDate.getTime() >= today.getTime() &&
      endDate.getTime() <= sixtyDaysFromNow.getTime()
    ) {
      expiringSoonLeaseIds.push(lease.id);
    }
  }

  if (expiringSoonLeaseIds.length > 0) {
    await supabase
      .from("leases")
      .update({ lease_status: "expiring_soon" })
      .in("id", expiringSoonLeaseIds)
      .eq("active", true);
  }

  if (expiredLeaseIds.length > 0) {
    await supabase
      .from("leases")
      .update({ lease_status: "expired", active: false })
      .in("id", expiredLeaseIds)
      .eq("active", true);
  }
}

async function generateMonthlyChargesForPropertyIdsWithClient(
  supabase: SupabaseLikeClient,
  propertyIds: string[]
): Promise<string> {
  const todayIso = new Date().toISOString().slice(0, 10);

  if (propertyIds.length === 0) {
    return "No properties found for your account.";
  }

  const { data: units } = await supabase
    .from("units")
    .select("id, property_id")
    .in("property_id", propertyIds);

  const unitRows = (units ?? []) as UnitRow[];
  const unitIds = unitRows.map((unit) => unit.id);
  if (unitIds.length === 0) {
    await updateLeaseStatuses(supabase, propertyIds);
    return "No units found. Add a unit first.";
  }

  const { data: leases } = await supabase
    .from("leases")
    .select(
      "id, unit_id, tenant_profile_id, start_date, end_date, due_day_of_month, monthly_rent_cents, grace_period_days, late_fee_cents, lease_status"
    )
    .in("unit_id", unitIds)
    .eq("active", true);

  const leaseRows = (leases ?? []) as LeaseRow[];
  if (leaseRows.length === 0) {
    await updateLeaseStatuses(supabase, propertyIds);
    return "No active leases found. Create an active lease first.";
  }

  const leaseIds = leaseRows.map((lease) => lease.id);
  const dueDatesByLeaseId = buildDueDatesByLeaseId(leaseRows, todayIso);

  if (dueDatesByLeaseId.size === 0) {
    await updateLeaseStatuses(supabase, propertyIds);
    return "No billable dates available for active leases.";
  }

  const targetDueDates = Array.from(new Set(Array.from(dueDatesByLeaseId.values()).flat()));
  const { data: existingCharges } = await supabase
    .from("rent_charges")
    .select("lease_id, due_date, category")
    .in("lease_id", Array.from(dueDatesByLeaseId.keys()))
    .in("due_date", targetDueDates)
    .eq("category", "rent");

  const existingKey = new Set(
    ((existingCharges ?? []) as ExistingChargeRow[]).map((charge) => `${charge.lease_id}::${charge.due_date}`)
  );

  const inserts = leaseRows.flatMap((lease) => {
    const dueDates = dueDatesByLeaseId.get(lease.id) ?? [];
    return dueDates
      .map((dueDate) => {
        const key = `${lease.id}::${dueDate}`;
        if (existingKey.has(key)) {
          return null;
        }
        return {
          lease_id: lease.id,
          due_date: dueDate,
          amount_cents: lease.monthly_rent_cents,
          status: "pending" as const,
          category: "rent" as const
        };
      })
      .filter(
        (row): row is {
          lease_id: string;
          due_date: string;
          amount_cents: number;
          status: "pending";
          category: "rent";
        } => row !== null
      );
  });

  if (inserts.length > 0) {
    await supabase.from("rent_charges").insert(inserts);
  }

  const { data: lateCandidates } = await supabase
    .from("rent_charges")
    .select("id, lease_id, due_date, status, category")
    .in("lease_id", leaseIds)
    .eq("status", "pending")
    .eq("category", "rent")
    .lt("due_date", todayIso);

  let lateChargeRows: LateChargeRow[] = [];
  if ((lateCandidates ?? []).length > 0) {
    const candidateRows = (lateCandidates ?? []) as LateChargeRow[];
    const candidateLeaseIds = Array.from(new Set(candidateRows.map((charge) => charge.lease_id)));

    const { data: lateLeases } = await supabase
      .from("leases")
      .select("id, tenant_profile_id, unit_id, grace_period_days, late_fee_cents, lease_status")
      .in("id", candidateLeaseIds);

    const lateLeaseRows = (lateLeases ?? []) as LateLeaseRow[];
    const leaseById = new Map(lateLeaseRows.map((lease) => [lease.id, lease]));
    const today = new Date();

    lateChargeRows = candidateRows.filter((charge) => {
      const lease = leaseById.get(charge.lease_id);
      if (!lease) {
        return false;
      }
      const graceDays = lease.grace_period_days ?? 5;
      return isPastGraceWindow(charge.due_date, graceDays, today);
    });

    const lateChargeIds = lateChargeRows.map((charge) => charge.id);
    if (lateChargeIds.length > 0) {
      await supabase
        .from("rent_charges")
        .update({ status: "late" })
        .in("id", lateChargeIds);

      const lateFeesByParentChargeId = new Map<string, string>();
      const { data: existingLateFeeCharges } = await supabase
        .from("rent_charges")
        .select("id, parent_charge_id")
        .in("parent_charge_id", lateChargeIds)
        .eq("category", "late_fee");

      for (const row of (existingLateFeeCharges ?? []) as Array<{ id: string; parent_charge_id: string | null }>) {
        if (row.parent_charge_id) {
          lateFeesByParentChargeId.set(row.parent_charge_id, row.id);
        }
      }

      const lateFeeInserts = lateChargeRows
        .map((charge) => {
          const lease = leaseById.get(charge.lease_id);
          if (!lease) {
            return null;
          }
          const lateFeeCents = lease.late_fee_cents ?? 0;
          if (lateFeeCents <= 0) {
            return null;
          }
          if (lateFeesByParentChargeId.has(charge.id)) {
            return null;
          }

          return {
            lease_id: charge.lease_id,
            due_date: charge.due_date,
            amount_cents: lateFeeCents,
            status: "pending" as const,
            category: "late_fee" as const,
            parent_charge_id: charge.id
          };
        })
        .filter(
          (row): row is {
            lease_id: string;
            due_date: string;
            amount_cents: number;
            status: "pending";
            category: "late_fee";
            parent_charge_id: string;
          } => row !== null
        );

      if (lateFeeInserts.length > 0) {
        await supabase.from("rent_charges").insert(lateFeeInserts);
      }
    }

    if (lateChargeRows.length > 0) {
      const lateUnitIds = Array.from(new Set(lateLeaseRows.map((lease) => lease.unit_id)));

      const { data: lateUnits } = lateUnitIds.length
        ? await supabase
            .from("units")
            .select("id, property_id")
            .in("id", lateUnitIds)
        : { data: [] as UnitRow[] };

      const lateUnitRows = (lateUnits ?? []) as UnitRow[];
      const propertyIdByUnitId = new Map(lateUnitRows.map((unit) => [unit.id, unit.property_id]));
      const tenantIds = Array.from(
        new Set(
          lateLeaseRows
            .map((lease) => lease.tenant_profile_id)
            .filter((id): id is string => !!id)
        )
      );

      let emailByTenantId = new Map<string, string | null>();
      if (tenantIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", tenantIds);

        emailByTenantId = new Map(
          ((profiles ?? []) as ProfileEmailRow[]).map((profile) => [profile.id, profile.email ?? null])
        );
      }

      for (const charge of lateChargeRows) {
        const lease = leaseById.get(charge.lease_id);
        const tenantId = lease?.tenant_profile_id ?? null;
        const propertyId = lease?.unit_id ? propertyIdByUnitId.get(lease.unit_id) ?? null : null;

        if (tenantId) {
          await createNotificationWithDelivery({
            recipientProfileId: tenantId,
            recipientEmail: emailByTenantId.get(tenantId) ?? null,
            type: "late_rent",
            title: "Rent payment overdue",
            body: `Your rent charge due on ${charge.due_date} is now marked late.`,
            entityType: "rent_charge",
            entityId: charge.id
          });
        }

        if (propertyId) {
          await notifyOwnerMembersForProperty({
            propertyId,
            type: "late_rent",
            title: "Rent charge marked late",
            body: `A rent charge due on ${charge.due_date} is now late.`,
            entityType: "rent_charge",
            entityId: charge.id
          });
        }
      }
    }
  }

  await updateLeaseStatuses(supabase, propertyIds);

  return inserts.length > 0
    ? `Generated ${inserts.length} new charge${inserts.length === 1 ? "" : "s"}.`
    : "No new charges generated (already up to date).";
}

async function getPropertyIdsForUserWithClient(
  supabase: SupabaseLikeClient,
  userId: string
): Promise<string[]> {
  const propertyIds = new Set<string>();

  const { data: legacyOwnedProperties } = await supabase
    .from("properties")
    .select("id")
    .eq("owner_profile_id", userId);

  for (const property of (legacyOwnedProperties ?? []) as PropertyIdRow[]) {
    propertyIds.add(property.id);
  }

  const { data: managerAssignments } = await supabase
    .from("property_managers")
    .select("property_id")
    .eq("manager_profile_id", userId)
    .eq("active", true);

  for (const assignment of (managerAssignments ?? []) as PropertyManagerAssignmentRow[]) {
    propertyIds.add(assignment.property_id);
  }

  const { data: ownerAccountMemberships } = await supabase
    .from("ownership_account_members")
    .select("account_id")
    .eq("profile_id", userId)
    .eq("member_role", "owner")
    .eq("active", true);

  const ownerAccountIds = ((ownerAccountMemberships ?? []) as OwnershipMembershipRow[]).map((row) => row.account_id);
  if (ownerAccountIds.length > 0) {
    const { data: accountProperties } = await supabase
      .from("properties")
      .select("id")
      .in("owner_account_id", ownerAccountIds);

    for (const property of (accountProperties ?? []) as PropertyIdRow[]) {
      propertyIds.add(property.id);
    }
  }

  return Array.from(propertyIds);
}

export async function generateMonthlyChargesForOwner(ownerUserId: string): Promise<string> {
  const supabase = createClient();

  const propertyIds = await getAdministeredPropertyIds(ownerUserId);
  return generateMonthlyChargesForPropertyIdsWithClient(supabase, propertyIds);
}

export async function generateMonthlyChargesForAllOwners(): Promise<string> {
  const supabase = createClient();
  return generateMonthlyChargesForAllOwnersWithClient(supabase);
}

export async function sendRentDueReminders(supabase: SupabaseLikeClient): Promise<string> {
  const targetDate = new Date();
  targetDate.setUTCDate(targetDate.getUTCDate() + 3);
  const targetDueDateIso = targetDate.toISOString().slice(0, 10);

  const { data: charges } = await supabase
    .from("rent_charges")
    .select("id, lease_id, due_date, amount_cents")
    .eq("status", "pending")
    .eq("category", "rent")
    .eq("due_date", targetDueDateIso);

  const pendingCharges = (charges ?? []) as Array<{
    id: string;
    lease_id: string;
    due_date: string;
    amount_cents: number;
  }>;

  if (pendingCharges.length === 0) {
    return "Reminders sent: 0.";
  }

  const leaseIds = Array.from(new Set(pendingCharges.map((charge) => charge.lease_id)));
  const { data: leases } = await supabase
    .from("leases")
    .select("id, tenant_profile_id")
    .in("id", leaseIds);

  const leaseById = new Map(
    ((leases ?? []) as Array<{ id: string; tenant_profile_id: string | null }>).map((lease) => [
      lease.id,
      lease
    ])
  );

  const tenantIds = Array.from(
    new Set(
      Array.from(leaseById.values())
        .map((lease) => lease.tenant_profile_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  let profileById = new Map<string, { id: string; email: string | null }>();
  if (tenantIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", tenantIds);

    profileById = new Map(
      ((profiles ?? []) as Array<{ id: string; email: string | null }>).map((profile) => [
        profile.id,
        profile
      ])
    );
  }

  let reminderCount = 0;

  for (const charge of pendingCharges) {
    const lease = leaseById.get(charge.lease_id);
    const tenantId = lease?.tenant_profile_id ?? null;
    if (!tenantId) {
      continue;
    }

    const profile = profileById.get(tenantId);
    await createNotificationWithDelivery({
      recipientProfileId: tenantId,
      recipientEmail: profile?.email ?? null,
      type: "rent_due_reminder",
      title: "Rent Due Soon",
      body: `Your rent of ${formatCurrency(charge.amount_cents)} is due on ${formatDate(charge.due_date)}. Pay now to keep your streak going!`,
      entityType: "rent_charge",
      entityId: charge.id
    });
    reminderCount += 1;
  }

  return `Reminders sent: ${reminderCount}.`;
}

function retryWindowOpen(lastFailedAt: string | null) {
  if (!lastFailedAt) {
    return true;
  }

  const retryAt = new Date(lastFailedAt);
  retryAt.setUTCDate(retryAt.getUTCDate() + 3);
  return retryAt.getTime() <= Date.now();
}

export async function processAutopayCharges(
  supabase: SupabaseLikeClient
): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
  const { data: enrollments } = await supabase
    .from("autopay_enrollments")
    .select("id, lease_id, tenant_profile_id, stripe_payment_method_id, retry_count, last_failed_at")
    .eq("enabled", true);

  const enrollmentRows = (enrollments ?? []) as AutopayEnrollmentRow[];
  const todayIso = new Date().toISOString().slice(0, 10);
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const enrollment of enrollmentRows) {
    try {
      if (enrollment.retry_count > 0 && !retryWindowOpen(enrollment.last_failed_at)) {
        skipped += 1;
        continue;
      }

      const { data: charges } = await supabase
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, status")
        .eq("lease_id", enrollment.lease_id)
        .eq("category", "rent")
        .in("status", ["pending", "late"])
        .lte("due_date", todayIso)
        .order("due_date", { ascending: true });

      const dueCharges = (charges ?? []) as Array<{
        id: string;
        lease_id: string;
        due_date: string;
        amount_cents: number;
        status: "pending" | "late";
      }>;

      if (dueCharges.length === 0) {
        continue;
      }

      const [{ data: profile }, { data: lease }] = await Promise.all([
        supabase
          .from("profiles")
          .select("stripe_customer_id")
          .eq("id", enrollment.tenant_profile_id)
          .maybeSingle(),
        supabase
          .from("leases")
          .select("id, unit_id")
          .eq("id", enrollment.lease_id)
          .maybeSingle()
      ]);

      if (!profile?.stripe_customer_id || !lease?.unit_id) {
        skipped += dueCharges.length;
        continue;
      }

      const { data: unit } = await supabase
        .from("units")
        .select("property_id")
        .eq("id", lease.unit_id)
        .maybeSingle();

      if (!unit?.property_id) {
        skipped += dueCharges.length;
        continue;
      }

      const ownerStripeAccount = await getOwnerStripeAccountForProperty(unit.property_id);
      if (!ownerStripeAccount) {
        skipped += dueCharges.length;
        continue;
      }

      for (const charge of dueCharges) {
        try {
          const { data: existingPayment } = await supabase
            .from("payments")
            .select("id")
            .eq("rent_charge_id", charge.id)
            .maybeSingle();

          if (existingPayment) {
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

export async function generateMonthlyChargesForAllOwnersWithClient(supabase: SupabaseLikeClient): Promise<string> {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["owner", "manager"]);

  const userIds = ((profiles ?? []) as ProfileIdRow[]).map((profile) => profile.id);
  if (userIds.length === 0) {
    return "No operators found.";
  }

  let generatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;
  let processedCount = 0;

  for (const userId of userIds) {
    try {
      const propertyIds = await getPropertyIdsForUserWithClient(supabase, userId);
      if (propertyIds.length === 0) {
        continue;
      }

      processedCount += 1;
      const message = await generateMonthlyChargesForPropertyIdsWithClient(supabase, propertyIds);
      if (message.startsWith("Generated")) {
        generatedCount += 1;
      } else if (message.startsWith("No new charges generated")) {
        unchangedCount += 1;
      } else {
        skippedCount += 1;
      }
    } catch (error) {
      console.error(`[charges] Charge generation failed for user ${userId}:`, error);
      skippedCount += 1;
    }
  }

  return `Operators processed: ${processedCount}. Generated: ${generatedCount}. Unchanged: ${unchangedCount}. Skipped: ${skippedCount}.`;
}
