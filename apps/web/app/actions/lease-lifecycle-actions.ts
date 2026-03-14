"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { canUserAdministerProperty } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { sideEffectError } from "@/lib/logger";
import { createNotificationWithDelivery } from "@/lib/notifications";
import {
  renewLeaseSchema,
  terminateLeaseSchema,
  parseFormData
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

async function getLeaseActionContext(supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"], leaseId: string) {
  const { data: lease } = await supabase
    .from("leases")
    .select("id, unit_id, tenant_profile_id, lease_status, active, deposit_cents, grace_period_days, late_fee_cents, start_date, end_date, due_day_of_month, monthly_rent_cents")
    .eq("id", leaseId)
    .maybeSingle();
  if (!lease) return null;

  const { data: unit } = await supabase.from("units").select("id, property_id").eq("id", lease.unit_id).maybeSingle();
  if (!unit) return null;
  return { lease, unit };
}

export async function renewLease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`renewLease:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(renewLeaseSchema, formData);
  if (!parsed.success) return parsed;

  const { leaseId, newStartDate, newEndDate, newMonthlyRentDollars, newDueDayOfMonth } = parsed.data;
  const context = await getLeaseActionContext(supabase, leaseId);
  if (!context) return { success: false, error: "Lease not found." };

  const { lease, unit } = context;
  if (!(await canUserAdministerProperty(user.id, unit.property_id))) return { success: false, error: "You do not have access to this lease." };
  if (!lease.active || (lease.lease_status ?? "active") !== "active") return { success: false, error: "Only active leases can be renewed." };

  const newMonthlyRentCents = Math.round(newMonthlyRentDollars * 100);
  const { data: newLease, error: insertError } = await supabase.from("leases").insert({
    unit_id: lease.unit_id,
    tenant_profile_id: lease.tenant_profile_id,
    start_date: newStartDate,
    end_date: newEndDate,
    due_day_of_month: newDueDayOfMonth,
    monthly_rent_cents: newMonthlyRentCents,
    deposit_cents: lease.deposit_cents,
    grace_period_days: lease.grace_period_days ?? 5,
    late_fee_cents: lease.late_fee_cents ?? 0,
    renewed_from_lease_id: lease.id,
    lease_status: "active",
    active: true
  }).select("id").single();

  if (insertError || !newLease?.id) {
    return { success: false, error: isMissingSchemaError(insertError) ? "This feature requires a database update." : "Failed to renew lease. Please try again." };
  }

  const { error: previousLeaseError } = await supabase.from("leases").update({ lease_status: "renewed", active: false }).eq("id", lease.id);
  if (previousLeaseError) return { success: false, error: "New lease created, but the prior lease could not be closed." };

  if (newMonthlyRentCents !== (lease.monthly_rent_cents ?? 0)) {
    const { error: rentIncreaseError } = await supabase.from("rent_increase_history").insert({
      lease_id: newLease.id,
      previous_rent_cents: lease.monthly_rent_cents ?? 0,
      new_rent_cents: newMonthlyRentCents,
      effective_date: newStartDate,
      reason: "Lease renewal",
      created_by: user.id
    });
    if (rentIncreaseError && !isMissingSchemaError(rentIncreaseError)) {
      console.error("[leases] Failed to record rent increase history:", rentIncreaseError);
    }
  }

  if (lease.tenant_profile_id) {
    const { data: tenantProfile } = await createAdminClient().from("profiles").select("id, email").eq("id", lease.tenant_profile_id).maybeSingle();
    if (tenantProfile?.id) {
      void createNotificationWithDelivery({
        recipientProfileId: tenantProfile.id,
        recipientEmail: tenantProfile.email,
        type: "lease_updated",
        title: "Lease renewed",
        body: "Your lease has been renewed.",
        entityType: "lease",
        entityId: newLease.id
      }).catch(sideEffectError("renewLease", "notify_tenant", { userId: user.id, entityType: "lease", entityId: newLease.id }));
    }
  }

  void logAudit({
    userId: user.id,
    action: "renew_lease",
    entityType: "lease",
    entityId: newLease.id,
    metadata: { propertyId: unit.property_id, tenantProfileId: lease.tenant_profile_id, previousLeaseId: lease.id }
  }).catch(sideEffectError("renewLease", "log_audit", { userId: user.id, entityType: "lease", entityId: newLease.id }));

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true, message: "Lease renewed." };
}

export async function terminateLease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`terminateLease:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(terminateLeaseSchema, formData);
  if (!parsed.success) return parsed;

  const context = await getLeaseActionContext(supabase, parsed.data.leaseId);
  if (!context) return { success: false, error: "Lease not found." };

  const { lease, unit } = context;
  if (!(await canUserAdministerProperty(user.id, unit.property_id))) return { success: false, error: "You do not have access to this lease." };
  if (!lease.active || (lease.lease_status ?? "active") !== "active") return { success: false, error: "Only active leases can be terminated." };

  const terminatedAt = new Date().toISOString();
  const { error: terminateError } = await supabase.from("leases").update({
    lease_status: "terminated",
    active: false,
    termination_reason: parsed.data.terminationReason,
    terminated_at: terminatedAt
  }).eq("id", lease.id);
  if (terminateError) {
    return { success: false, error: isMissingSchemaError(terminateError) ? "This feature requires a database update." : "Failed to terminate lease. Please try again." };
  }

  const { error: unitError } = await supabase.from("units").update({ occupied: false }).eq("id", lease.unit_id);
  if (unitError) return { success: false, error: "Lease terminated, but the unit occupancy could not be updated." };

  if (lease.tenant_profile_id) {
    const { data: tenantProfile } = await createAdminClient().from("profiles").select("id, email").eq("id", lease.tenant_profile_id).maybeSingle();
    if (tenantProfile?.id) {
      void createNotificationWithDelivery({
        recipientProfileId: tenantProfile.id,
        recipientEmail: tenantProfile.email,
        type: "lease_updated",
        title: "Lease terminated",
        body: "Your lease has been terminated.",
        entityType: "lease",
        entityId: lease.id
      }).catch(sideEffectError("terminateLease", "notify_tenant", { userId: user.id, entityType: "lease", entityId: lease.id }));
    }
  }

  void logAudit({
    userId: user.id,
    action: "terminate_lease",
    entityType: "lease",
    entityId: lease.id,
    metadata: { propertyId: unit.property_id, tenantProfileId: lease.tenant_profile_id, terminationReason: parsed.data.terminationReason }
  }).catch(sideEffectError("terminateLease", "log_audit", { userId: user.id, entityType: "lease", entityId: lease.id }));

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true, message: "Lease terminated." };
}
