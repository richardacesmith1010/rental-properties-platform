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
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  createLeaseSchema,
  updateLeaseSchema,
  deleteLeaseSchema,
  parseFormData
} from "@/lib/validations";
import { isMissingSchemaError, type ActionState } from "./shared";

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
    redirect("/portal");
  }

  const parsed = parseFormData(createLeaseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { unitId, tenantProfileId, startDate, endDate, dueDayOfMonth, monthlyRentDollars, depositDollars } =
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
    active: true
  }).select("id").single();

  if (error || !createdLease?.id) {
    return { success: false, error: "Failed to create lease. Please try again." };
  }

  await supabase.from("units").update({ occupied: true }).eq("id", unitId);

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
    redirect("/portal");
  }

  const parsed = parseFormData(updateLeaseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { leaseId, endDate, dueDayOfMonth, monthlyRentDollars, depositDollars } = parsed.data;

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

  const { error } = await supabase
    .from("leases")
    .update({
      end_date: endDate,
      due_day_of_month: dueDayOfMonth,
      monthly_rent_cents: Math.round(monthlyRentDollars * 100),
      deposit_cents: Math.round(depositDollars * 100)
    })
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
    redirect("/portal");
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

