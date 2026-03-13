"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import {
  createNotificationWithDelivery,
  notifyOwnerMembersForProperty
} from "@/lib/notifications";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  createLeaseSchema,
  updateLeaseSchema,
  deleteLeaseSchema,
  renewLeaseSchema,
  terminateLeaseSchema,
  parseFormData
} from "@/lib/validations";
import { isMissingSchemaError, type ActionState } from "./shared";

async function getLeaseActionContext(
  supabase: ReturnType<typeof createClient>,
  leaseId: string
) {
  const { data: lease } = await supabase
    .from("leases")
    .select(
      "id, unit_id, tenant_profile_id, lease_status, active, deposit_cents, grace_period_days, late_fee_cents, start_date, end_date, due_day_of_month, monthly_rent_cents"
    )
    .eq("id", leaseId)
    .maybeSingle();

  if (!lease) {
    return null;
  }

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .maybeSingle();

  if (!unit) {
    return null;
  }

  return {
    lease,
    unit
  };
}

export async function createLease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const parsed = parseFormData(createLeaseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const {
    unitId,
    tenantProfileId,
    startDate,
    endDate,
    dueDayOfMonth,
    monthlyRentDollars,
    depositDollars,
    gracePeriodDays,
    lateFeeDollars
  } =
    parsed.data;

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", unitId)
    .single();

  if (!unit) {
    return { success: false, error: "Unit not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, unit.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this unit." };
  }

  const admin = createAdminClient();
  const { data: tenantProfile } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", tenantProfileId)
    .maybeSingle();

  if (!tenantProfile?.id || !tenantProfile.email) {
    return { success: false, error: "Tenant profile not found." };
  }

  const { data: propertyUnitRows } = await supabase
    .from("units")
    .select("id")
    .eq("property_id", unit.property_id);

  const propertyUnitIds = (propertyUnitRows ?? []).map((row) => row.id);
  const hasExistingLeaseInProperty = propertyUnitIds.length
    ? Boolean(
        (
          await supabase
            .from("leases")
            .select("id")
            .eq("tenant_profile_id", tenantProfile.id)
            .eq("active", true)
            .in("unit_id", propertyUnitIds)
            .limit(1)
        ).data?.length
      )
    : false;

  let hasTenantInvitationForProperty = false;
  const invitationQuery = await admin
    .from("invitations")
    .select("id")
    .eq("email", tenantProfile.email.toLowerCase())
    .eq("role", "tenant")
    .eq("property_id", unit.property_id)
    .in("status", ["pending", "accepted"])
    .limit(1);
  if (!invitationQuery.error) {
    hasTenantInvitationForProperty = Boolean(invitationQuery.data?.length);
  } else if (!await isMissingSchemaError(invitationQuery.error)) {
    return { success: false, error: "Failed to validate tenant-property link." };
  }

  if (!hasExistingLeaseInProperty && !hasTenantInvitationForProperty) {
    return {
      success: false,
      error: "Tenant is not linked to this property. Invite the tenant to this property first."
    };
  }

  const { data: createdLease, error } = await supabase.from("leases").insert({
    unit_id: unitId,
    tenant_profile_id: tenantProfileId,
    start_date: startDate,
    end_date: endDate,
    due_day_of_month: dueDayOfMonth,
    monthly_rent_cents: Math.round(monthlyRentDollars * 100),
    deposit_cents: Math.round(depositDollars * 100),
    grace_period_days: typeof gracePeriodDays === "number" ? gracePeriodDays : 5,
    late_fee_cents: typeof lateFeeDollars === "number" ? Math.round(lateFeeDollars * 100) : 0,
    lease_status: "active",
    active: true
  }).select("id").single();

  if (error || !createdLease?.id) {
    return { success: false, error: "Failed to create lease. Please try again." };
  }

  const { error: unitUpdateError } = await supabase
    .from("units")
    .update({ occupied: true })
    .eq("id", unitId);

  if (unitUpdateError) {
    return { success: false, error: "Lease created, but unit occupancy could not be updated." };
  }

  await notifyOwnerMembersForProperty({
    propertyId: unit.property_id,
    type: "lease_updated",
    title: "Lease created",
    body: "A new lease was created for one of your properties.",
    entityType: "lease",
    entityId: createdLease.id,
    actorProfileId: user.id
  });

  if (tenantProfile?.id) {
    await createNotificationWithDelivery({
      recipientProfileId: tenantProfile.id,
      recipientEmail: tenantProfile.email,
      type: "lease_updated",
      title: "Lease created",
      body: "A lease has been created or updated for your unit.",
      entityType: "lease",
      entityId: createdLease.id
    });
  }

  void awardXp(
    user.id,
    "lease_created",
    XP_VALUES.lease_created,
    "Lease created for a unit.",
    {
      lease_id: createdLease.id,
      property_id: unit.property_id,
      tenant_profile_id: tenantProfile.id
    }
  ).catch(() => {});

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateLease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const parsed = parseFormData(updateLeaseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const {
    leaseId,
    endDate,
    dueDayOfMonth,
    monthlyRentDollars,
    depositDollars,
    gracePeriodDays,
    lateFeeDollars
  } = parsed.data;

  const { data: lease } = await supabase
    .from("leases")
    .select("id, unit_id, tenant_profile_id")
    .eq("id", leaseId)
    .single();

  if (!lease) {
    return { success: false, error: "Lease not found." };
  }

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .single();

  if (!unit) {
    return { success: false, error: "Unit not found for this lease." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, unit.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this lease." };
  }

  const updates: Record<string, unknown> = {
    end_date: endDate,
    due_day_of_month: dueDayOfMonth,
    monthly_rent_cents: Math.round(monthlyRentDollars * 100),
    deposit_cents: Math.round(depositDollars * 100)
  };

  if (typeof gracePeriodDays === "number") {
    updates.grace_period_days = gracePeriodDays;
  }

  if (typeof lateFeeDollars === "number") {
    updates.late_fee_cents = Math.round(lateFeeDollars * 100);
  }

  const { error } = await supabase
    .from("leases")
    .update(updates)
    .eq("id", leaseId);

  if (error) {
    return { success: false, error: "Failed to update lease. Please try again." };
  }

  await notifyOwnerMembersForProperty({
    propertyId: unit.property_id,
    type: "lease_updated",
    title: "Lease updated",
    body: "A lease was updated for one of your properties.",
    entityType: "lease",
    entityId: leaseId,
    actorProfileId: user.id
  });

  if (lease.tenant_profile_id) {
    const { data: tenantProfile } = await createAdminClient()
      .from("profiles")
      .select("id, email")
      .eq("id", lease.tenant_profile_id)
      .maybeSingle();

    if (tenantProfile?.id) {
      await createNotificationWithDelivery({
        recipientProfileId: tenantProfile.id,
        recipientEmail: tenantProfile.email,
        type: "lease_updated",
        title: "Lease updated",
        body: "Your lease terms were updated.",
        entityType: "lease",
        entityId: leaseId
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function renewLease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const parsed = parseFormData(renewLeaseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { leaseId, newStartDate, newEndDate, newMonthlyRentDollars, newDueDayOfMonth } = parsed.data;
  const context = await getLeaseActionContext(supabase, leaseId);

  if (!context) {
    return { success: false, error: "Lease not found." };
  }

  const { lease, unit } = context;
  const canAdminister = await canUserAdministerProperty(user.id, unit.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this lease." };
  }

  const currentStatus = lease.lease_status ?? "active";
  if (!lease.active || currentStatus !== "active") {
    return { success: false, error: "Only active leases can be renewed." };
  }

  const { data: newLease, error: insertError } = await supabase
    .from("leases")
    .insert({
      unit_id: lease.unit_id,
      tenant_profile_id: lease.tenant_profile_id,
      start_date: newStartDate,
      end_date: newEndDate,
      due_day_of_month: newDueDayOfMonth,
      monthly_rent_cents: Math.round(newMonthlyRentDollars * 100),
      deposit_cents: lease.deposit_cents,
      grace_period_days: lease.grace_period_days ?? 5,
      late_fee_cents: lease.late_fee_cents ?? 0,
      renewed_from_lease_id: lease.id,
      lease_status: "active",
      active: true
    })
    .select("id")
    .single();

  if (insertError || !newLease?.id) {
    const missingSchema = await isMissingSchemaError(insertError);
    return {
      success: false,
      error: missingSchema
        ? "This feature requires a database update."
        : "Failed to renew lease. Please try again."
    };
  }

  const { error: previousLeaseError } = await supabase
    .from("leases")
    .update({ lease_status: "renewed", active: false })
    .eq("id", lease.id);

  if (previousLeaseError) {
    return { success: false, error: "New lease created, but the prior lease could not be closed." };
  }

  if (lease.tenant_profile_id) {
    const { data: tenantProfile } = await createAdminClient()
      .from("profiles")
      .select("id, email")
      .eq("id", lease.tenant_profile_id)
      .maybeSingle();

    if (tenantProfile?.id) {
      void createNotificationWithDelivery({
        recipientProfileId: tenantProfile.id,
        recipientEmail: tenantProfile.email,
        type: "lease_updated",
        title: "Lease renewed",
        body: "Your lease has been renewed.",
        entityType: "lease",
        entityId: newLease.id
      }).catch(() => {});
    }
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true, message: "Lease renewed." };
}

export async function terminateLease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const parsed = parseFormData(terminateLeaseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { leaseId, terminationReason } = parsed.data;
  const context = await getLeaseActionContext(supabase, leaseId);

  if (!context) {
    return { success: false, error: "Lease not found." };
  }

  const { lease, unit } = context;
  const canAdminister = await canUserAdministerProperty(user.id, unit.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this lease." };
  }

  const currentStatus = lease.lease_status ?? "active";
  if (!lease.active || currentStatus !== "active") {
    return { success: false, error: "Only active leases can be terminated." };
  }

  const terminatedAt = new Date().toISOString();
  const { error: terminateError } = await supabase
    .from("leases")
    .update({
      lease_status: "terminated",
      active: false,
      termination_reason: terminationReason,
      terminated_at: terminatedAt
    })
    .eq("id", lease.id);

  if (terminateError) {
    const missingSchema = await isMissingSchemaError(terminateError);
    return {
      success: false,
      error: missingSchema
        ? "This feature requires a database update."
        : "Failed to terminate lease. Please try again."
    };
  }

  const { error: unitError } = await supabase
    .from("units")
    .update({ occupied: false })
    .eq("id", lease.unit_id);

  if (unitError) {
    return { success: false, error: "Lease terminated, but the unit occupancy could not be updated." };
  }

  if (lease.tenant_profile_id) {
    const { data: tenantProfile } = await createAdminClient()
      .from("profiles")
      .select("id, email")
      .eq("id", lease.tenant_profile_id)
      .maybeSingle();

    if (tenantProfile?.id) {
      void createNotificationWithDelivery({
        recipientProfileId: tenantProfile.id,
        recipientEmail: tenantProfile.email,
        type: "lease_updated",
        title: "Lease terminated",
        body: "Your lease has been terminated.",
        entityType: "lease",
        entityId: lease.id
      }).catch(() => {});
    }
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true, message: "Lease terminated." };
}

export async function deleteLease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const parsed = parseFormData(deleteLeaseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { leaseId } = parsed.data;

  const { data: lease } = await supabase
    .from("leases")
    .select("id, unit_id, tenant_profile_id, active")
    .eq("id", leaseId)
    .single();

  if (!lease) {
    return { success: false, error: "Lease not found." };
  }

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .single();

  if (!unit) {
    return { success: false, error: "Unit not found for this lease." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, unit.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this lease." };
  }

  const { error: leaseError } = await supabase
    .from("leases")
    .update({ active: false })
    .eq("id", leaseId);

  if (leaseError) {
    return { success: false, error: "Failed to archive lease. Please try again." };
  }

  const { error: unitError } = await supabase
    .from("units")
    .update({ occupied: false })
    .eq("id", lease.unit_id);

  if (unitError) {
    return { success: false, error: "Lease archived, but unit occupancy could not be updated." };
  }

  await notifyOwnerMembersForProperty({
    propertyId: unit.property_id,
    type: "lease_updated",
    title: "Lease archived",
    body: "A lease was archived for one of your properties.",
    entityType: "lease",
    entityId: leaseId,
    actorProfileId: user.id
  });

  if (lease.tenant_profile_id) {
    const { data: tenantProfile } = await createAdminClient()
      .from("profiles")
      .select("id, email")
      .eq("id", lease.tenant_profile_id)
      .maybeSingle();

    if (tenantProfile?.id) {
      await createNotificationWithDelivery({
        recipientProfileId: tenantProfile.id,
        recipientEmail: tenantProfile.email,
        type: "lease_updated",
        title: "Lease archived",
        body: "Your lease has been archived by management.",
        entityType: "lease",
        entityId: leaseId
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}
