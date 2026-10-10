"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { canUserAdministerProperty } from "@/lib/property-access";
import { isUnclaimedClientProperty } from "@/lib/client-accounts";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { createNotificationWithDelivery, notifyPropertyTeam } from "@/lib/notifications";
import {
  createLeaseSchema,
  updateLeaseSchema,
  deleteLeaseSchema,
  parseFormData
} from "@/lib/validations";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { requireAuth } from "./auth-helpers";
import { updateLeaseRentAmount } from "./charge-management";
import type { ActionState } from "./shared";

type CreateLeaseData = z.infer<typeof createLeaseSchema>;
type UpdateLeaseData = z.infer<typeof updateLeaseSchema>;

function buildCreateLeaseInsert(data: CreateLeaseData) {
  return {
    unit_id: data.unitId,
    tenant_profile_id: data.tenantProfileId,
    start_date: data.startDate,
    end_date: data.endDate,
    due_day_of_month: data.dueDayOfMonth,
    monthly_rent_cents: Math.round(data.monthlyRentDollars * 100),
    deposit_cents: Math.round(data.depositDollars * 100),
    grace_period_days: data.gracePeriodDays,
    late_fee_cents: Math.round(data.lateFeeDollars * 100),
    collects_outside_domus: data.collectsOutsideDomus,
    lease_status: "active" as const,
    active: true
  };
}

function buildUpdateLeaseMutation(data: UpdateLeaseData) {
  return {
    end_date: data.endDate,
    due_day_of_month: data.dueDayOfMonth,
    monthly_rent_cents: Math.round(data.monthlyRentDollars * 100),
    deposit_cents: Math.round(data.depositDollars * 100),
    grace_period_days: data.gracePeriodDays,
    late_fee_cents: Math.round(data.lateFeeDollars * 100),
    collects_outside_domus: data.collectsOutsideDomus
  };
}

export async function createLease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`createLease:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(createLeaseSchema, formData);
  if (!parsed.success) return parsed;

  const { unitId, tenantProfileId } = parsed.data;
  const { data: unit } = await supabase.from("units").select("id, property_id").eq("id", unitId).single();
  if (!unit) return { success: false, error: "Unit not found." };
  if (!(await canUserAdministerProperty(user.id, unit.property_id))) {
    return { success: false, error: "You do not have access to this unit." };
  }

  const admin = createAdminClient();
  const { data: tenantProfile } = await admin.from("profiles").select("id, email").eq("id", tenantProfileId).maybeSingle();
  if (!tenantProfile?.id || !tenantProfile.email) return { success: false, error: "Tenant profile not found." };

  const { data: propertyUnitRows } = await supabase.from("units").select("id").eq("property_id", unit.property_id);
  const propertyUnitIds = (propertyUnitRows ?? []).map((row) => row.id);
  const hasExistingLeaseInProperty = propertyUnitIds.length
    ? Boolean((await supabase.from("leases").select("id")
        .eq("tenant_profile_id", tenantProfile.id).eq("active", true)
        .in("unit_id", propertyUnitIds).limit(1)).data?.length)
    : false;

  const invitationQuery = await admin.from("invitations").select("id")
    .eq("email", tenantProfile.email.toLowerCase()).eq("role", "tenant")
    .eq("property_id", unit.property_id).in("status", ["pending", "accepted"]).limit(1);
  const hasTenantInvitationForProperty = !invitationQuery.error ? Boolean(invitationQuery.data?.length) : false;
  if (invitationQuery.error && !isMissingSchemaError(invitationQuery.error)) {
    return { success: false, error: "Failed to validate tenant-property link." };
  }
  if (!hasExistingLeaseInProperty && !hasTenantInvitationForProperty) {
    return { success: false, error: "Tenant is not linked to this property. Invite the tenant to this property first." };
  }

  const { data: createdLease, error } = await supabase
    .from("leases")
    .insert({
      ...buildCreateLeaseInsert(parsed.data),
      collects_outside_domus: (await isUnclaimedClientProperty(unit.property_id)) || parsed.data.collectsOutsideDomus
    })
    .select("id")
    .single();
  if (error || !createdLease?.id) return { success: false, error: "Failed to create lease. Please try again." };

  const { error: unitUpdateError } = await supabase.from("units").update({ occupied: true }).eq("id", unitId);
  if (unitUpdateError) return { success: false, error: "Lease created, but unit occupancy could not be updated." };

  void notifyPropertyTeam({
    propertyId: unit.property_id,
    event: "lease_changed",
    type: "lease_updated",
    title: "Lease created",
    body: "A new lease was created for one of your properties.",
    entityType: "lease",
    entityId: createdLease.id,
    actorProfileId: user.id,
    emailMode: "never"
  }).catch(sideEffectError("createLease", "mirror_lease", {
    userId: user.id, entityType: "lease", entityId: createdLease.id
  }));

  void createNotificationWithDelivery({
    recipientProfileId: tenantProfile.id,
    recipientEmail: tenantProfile.email,
    type: "lease_updated",
    emailMode: "never",
    title: "Lease created",
    body: "A lease has been created or updated for your unit.",
    entityType: "lease",
    entityId: createdLease.id
  }).catch(
    sideEffectError("createLease", "notify_tenant", {
      userId: user.id,
      entityType: "lease",
      entityId: createdLease.id
    })
  );


  void logAudit({
    userId: user.id,
    action: "create_lease",
    entityType: "lease",
    entityId: createdLease.id,
    metadata: { propertyId: unit.property_id, unitId, tenantProfileId, tenantEmail: tenantProfile.email }
  }).catch(sideEffectError("createLease", "log_audit", { userId: user.id, entityType: "lease", entityId: createdLease.id }));

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateLease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`updateLease:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateLeaseSchema, formData);
  if (!parsed.success) return parsed;

  const { leaseId } = parsed.data;
  const { data: lease } = await supabase.from("leases").select("id, unit_id, tenant_profile_id").eq("id", leaseId).single();
  if (!lease) return { success: false, error: "Lease not found." };

  const { data: unit } = await supabase.from("units").select("id, property_id").eq("id", lease.unit_id).single();
  if (!unit) return { success: false, error: "Unit not found for this lease." };
  if (!(await canUserAdministerProperty(user.id, unit.property_id))) {
    return { success: false, error: "You do not have access to this lease." };
  }

  const updates = {
    ...buildUpdateLeaseMutation(parsed.data),
    collects_outside_domus: (await isUnclaimedClientProperty(unit.property_id)) || parsed.data.collectsOutsideDomus
  };

  const { error } = await supabase.from("leases").update(updates).eq("id", leaseId);
  if (error) return { success: false, error: "Failed to update lease. Please try again." };

  void notifyPropertyTeam({
    propertyId: unit.property_id,
    event: "lease_changed",
    type: "lease_updated",
    title: "Lease updated",
    body: "A lease was updated for one of your properties.",
    entityType: "lease",
    entityId: leaseId,
    actorProfileId: user.id,
    emailMode: "never"
  }).catch(sideEffectError("updateLease", "mirror_lease", {
    userId: user.id, entityType: "lease", entityId: leaseId
  }));

  if (lease.tenant_profile_id) {
    const { data: tenantProfile } = await createAdminClient().from("profiles")
      .select("id, email").eq("id", lease.tenant_profile_id).maybeSingle();
    if (tenantProfile?.id) {
      void createNotificationWithDelivery({
        recipientProfileId: tenantProfile.id,
        recipientEmail: tenantProfile.email,
        type: "lease_updated",
        emailMode: "never",
        title: "Lease updated",
        body: "Your lease terms were updated.",
        entityType: "lease",
        entityId: leaseId
      }).catch(
        sideEffectError("updateLease", "notify_tenant", {
          userId: user.id,
          entityType: "lease",
          entityId: leaseId
        })
      );
    }
  }

  void logAudit({
    userId: user.id,
    action: "update_lease",
    entityType: "lease",
    entityId: leaseId,
    metadata: { propertyId: unit.property_id, tenantProfileId: lease.tenant_profile_id }
  }).catch(sideEffectError("updateLease", "log_audit", { userId: user.id, entityType: "lease", entityId: leaseId }));

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function deleteLease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`deleteLease:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(deleteLeaseSchema, formData);
  if (!parsed.success) return parsed;

  const { data: lease } = await supabase
    .from("leases")
    .select("id, unit_id, tenant_profile_id, active, lease_status")
    .eq("id", parsed.data.leaseId)
    .single();
  if (!lease) return { success: false, error: "Lease not found." };

  const { data: unit } = await supabase.from("units").select("id, property_id").eq("id", lease.unit_id).single();
  if (!unit) return { success: false, error: "Unit not found for this lease." };
  if (!(await canUserAdministerProperty(user.id, unit.property_id))) {
    return { success: false, error: "You do not have access to this lease." };
  }

  const nextLeaseStatus =
    lease.lease_status === "expired" || lease.lease_status === "renewed" || lease.lease_status === "terminated"
      ? lease.lease_status
      : "terminated";
  const { error: leaseError } = await supabase
    .from("leases")
    .update({ active: false, lease_status: nextLeaseStatus })
    .eq("id", parsed.data.leaseId);
  if (leaseError) return { success: false, error: "Failed to archive lease. Please try again." };

  const { error: unitError } = await supabase.from("units").update({ occupied: false }).eq("id", lease.unit_id);
  if (unitError) return { success: false, error: "Lease archived, but unit occupancy could not be updated." };

  void notifyPropertyTeam({
    propertyId: unit.property_id,
    event: "lease_changed",
    type: "lease_updated",
    title: "Lease archived",
    body: "A lease was archived for one of your properties.",
    entityType: "lease",
    entityId: parsed.data.leaseId,
    actorProfileId: user.id,
    emailMode: "never"
  }).catch(sideEffectError("deleteLease", "mirror_lease", {
    userId: user.id, entityType: "lease", entityId: parsed.data.leaseId
  }));

  if (lease.tenant_profile_id) {
    const { data: tenantProfile } = await createAdminClient().from("profiles")
      .select("id, email").eq("id", lease.tenant_profile_id).maybeSingle();
    if (tenantProfile?.id) {
      void createNotificationWithDelivery({
        recipientProfileId: tenantProfile.id,
        recipientEmail: tenantProfile.email,
        type: "lease_updated",
        emailMode: "never",
        title: "Lease archived",
        body: "Your lease has been archived by management.",
        entityType: "lease",
        entityId: parsed.data.leaseId
      }).catch(
        sideEffectError("deleteLease", "notify_tenant", {
          userId: user.id,
          entityType: "lease",
          entityId: parsed.data.leaseId
        })
      );
    }
  }

  void logAudit({
    userId: user.id,
    action: "delete_lease",
    entityType: "lease",
    entityId: parsed.data.leaseId,
    metadata: { propertyId: unit.property_id, tenantProfileId: lease.tenant_profile_id }
  }).catch(sideEffectError("deleteLease", "log_audit", { userId: user.id, entityType: "lease", entityId: parsed.data.leaseId }));

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function updateRentAmount(
  prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return updateLeaseRentAmount(prev, formData);
}
