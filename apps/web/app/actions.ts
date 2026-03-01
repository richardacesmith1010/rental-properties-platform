"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, isTester as hasTesterAccess } from "@/lib/auth";
import { createStripeCheckoutSession } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createNotificationWithDelivery,
  notifyOwnerMembersForProperty
} from "@/lib/notifications";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import {
  getVendorAssignmentPlan,
  shouldThrottleDocumentPacketSend
} from "@/lib/idempotency";
import {
  canUserAdministerProperty,
  getAdministeredOwnerAccountIds
} from "@/lib/property-access";
import {
  canUserAdministerOwnershipAccount,
  getOrCreateIndividualOwnershipAccount
} from "@/lib/ownership";
import {
  createPropertySchema,
  createUnitSchema,
  createLeaseSchema,
  updateLeaseSchema,
  deleteLeaseSchema,
  updatePropertySchema,
  deletePropertySchema,
  updateUnitSchema,
  deleteUnitSchema,
  payChargeSchema,
  createMaintenanceTicketSchema,
  updateTicketStatusSchema,
  updateTicketCostSchema,
  inviteTenantSchema,
  inviteManagerSchema,
  inviteOwnerSchema,
  resendInviteSchema,
  createDocumentTemplateSchema,
  updateDocumentTemplateSchema,
  deleteDocumentTemplateSchema,
  createDocumentPacketSchema,
  sendDocumentPacketSchema,
  signDocumentPacketSchema,
  markNotificationReadSchema,
  createVendorSchema,
  updateVendorSchema,
  assignVendorSchema,
  uploadMaintenancePhotoSchema,
  uploadPropertyFileSchema,
  deletePropertyFileSchema,
  updateFileVisibilitySchema,
  createExpenseSchema,
  updateExpenseSchema,
  deleteExpenseSchema,
  createOwnershipAccountSchema,
  addOwnershipMemberSchema,
  linkPropertyToOwnershipAccountSchema,
  grantTesterAccessSchema,
  revokeTesterAccessSchema,
  parseFormData,
} from "@/lib/validations";

export type ActionState =
  | { success: true; message?: string }
  | { success: false; error: string }
  | null;

type CapabilityKey =
  | "documentsEnabled"
  | "notificationsEnabled"
  | "vendorWorkflowEnabled"
  | "photoWorkflowEnabled"
  | "ownershipEnabled";

function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code ?? "") : "";
  const message = "message" in error ? String(error.message ?? "").toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

async function ensureCapabilityEnabled(capability: CapabilityKey): Promise<ActionState> {
  const capabilities = await getFeatureCapabilities();
  if (capabilities[capability]) {
    return null;
  }

  if (capability === "documentsEnabled") {
    return {
      success: false,
      error:
        capabilities.warnings.documents ??
        "Documents are not available yet. Complete setup and retry."
    };
  }

  if (capability === "notificationsEnabled") {
    return {
      success: false,
      error:
        capabilities.warnings.notifications ??
        "Notifications are not available yet. Complete setup and retry."
    };
  }

  if (capability === "vendorWorkflowEnabled") {
    return {
      success: false,
      error:
        capabilities.warnings.vendorWorkflow ??
        "Vendor workflow is not available yet. Complete setup and retry."
    };
  }

  if (capability === "ownershipEnabled") {
    return {
      success: false,
      error:
        capabilities.warnings.ownership ??
        "Ownership accounts are not available yet. Complete setup and retry."
    };
  }

  return {
    success: false,
    error:
      capabilities.warnings.photoWorkflow ??
      "Photo workflow is not available yet. Complete setup and retry."
  };
}

export async function signOut(_formData: FormData) {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  const parsed = parseFormData(createPropertySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const capabilities = await getFeatureCapabilities();
  const { name, addressLine1, city, state, postalCode, ownerAccountId } = parsed.data;
  let property: { id: string } | null = null;
  let error: { message: string } | null = null;

  if (capabilities.ownershipEnabled) {
    let targetOwnerAccountId = ownerAccountId;

    if (!targetOwnerAccountId) {
      targetOwnerAccountId = await getOrCreateIndividualOwnershipAccount(user.id);
    } else {
      const canUseAccount = await canUserAdministerOwnershipAccount(user.id, targetOwnerAccountId);
      if (!canUseAccount) {
        return { success: false, error: "You do not have access to that ownership account." };
      }
    }

    const insertResult = await supabase.from("properties").insert({
      owner_profile_id: user.id,
      owner_account_id: targetOwnerAccountId,
      name,
      address_line1: addressLine1,
      city,
      state,
      postal_code: postalCode
    }).select("id").single();
    property = insertResult.data;
    error = insertResult.error;
  } else {
    const insertResult = await supabase.from("properties").insert({
      owner_profile_id: user.id,
      name,
      address_line1: addressLine1,
      city,
      state,
      postal_code: postalCode
    }).select("id").single();
    property = insertResult.data;
    error = insertResult.error;
  }

  if (error) {
    return { success: false, error: "Failed to create property. Please try again." };
  }

  if (role === "manager" && property?.id) {
    const admin = createAdminClient();
    await admin.from("property_managers").upsert(
      {
        property_id: property.id,
        manager_profile_id: user.id,
        active: true
      },
      { onConflict: "property_id,manager_profile_id" }
    );
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function createUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  const parsed = parseFormData(createUnitSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, unitNumber, bedrooms, bathrooms, monthlyRentDollars } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { error } = await supabase.from("units").insert({
    property_id: propertyId,
    unit_number: unitNumber,
    bedrooms,
    bathrooms,
    monthly_rent_cents: Math.round(monthlyRentDollars * 100),
    occupied: false
  });

  if (error) {
    return { success: false, error: "Failed to create unit. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
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

  const { error } = await supabase.from("leases").insert({
    unit_id: unitId,
    tenant_profile_id: tenantProfileId,
    start_date: startDate,
    end_date: endDate,
    due_day_of_month: dueDayOfMonth,
    monthly_rent_cents: Math.round(monthlyRentDollars * 100),
    deposit_cents: Math.round(depositDollars * 100),
    active: true
  });

  if (error) {
    return { success: false, error: "Failed to create lease. Please try again." };
  }

  await supabase.from("units").update({ occupied: true }).eq("id", unitId);

  const { data: tenantProfile } = await createAdminClient()
    .from("profiles")
    .select("id, email")
    .eq("id", tenantProfileId)
    .maybeSingle();

  await notifyOwnerMembersForProperty({
    propertyId: unit.property_id,
    type: "lease_updated",
    title: "Lease created",
    body: "A new lease was created for one of your properties.",
    entityType: "lease",
    entityId: null
  });

  if (tenantProfile?.id) {
    await createNotificationWithDelivery({
      recipientProfileId: tenantProfile.id,
      recipientEmail: tenantProfile.email,
      type: "lease_updated",
      title: "Lease created",
      body: "A lease has been created or updated for your unit.",
      entityType: "lease",
      entityId: null
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
    entityId: leaseId
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
    entityId: leaseId
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

export async function updateProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  const parsed = parseFormData(updatePropertySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, name, addressLine1, city, state, postalCode } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { error } = await supabase
    .from("properties")
    .update({
      name,
      address_line1: addressLine1,
      city,
      state,
      postal_code: postalCode
    })
    .eq("id", propertyId);

  if (error) {
    return { success: false, error: "Failed to update property. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function deleteProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  const parsed = parseFormData(deletePropertySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { data: units } = await supabase
    .from("units")
    .select("id")
    .eq("property_id", propertyId);

  const unitIds = (units ?? []).map((unit) => unit.id);
  if (unitIds.length > 0) {
    const { data: activeLease } = await supabase
      .from("leases")
      .select("id")
      .in("unit_id", unitIds)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (activeLease) {
      return {
        success: false,
        error: "Cannot archive a property with active leases. Archive leases first."
      };
    }
  }

  const { error } = await supabase
    .from("properties")
    .update({ active: false })
    .eq("id", propertyId);

  if (error && isMissingSchemaError(error)) {
    return {
      success: false,
      error: "Property archive requires the active column migration to be applied."
    };
  }

  if (error) {
    return { success: false, error: "Failed to archive property. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  const parsed = parseFormData(updateUnitSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { unitId, unitNumber, bedrooms, bathrooms, monthlyRentDollars } = parsed.data;
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

  const { error } = await supabase
    .from("units")
    .update({
      unit_number: unitNumber,
      bedrooms,
      bathrooms,
      monthly_rent_cents: Math.round(monthlyRentDollars * 100)
    })
    .eq("id", unitId);

  if (error) {
    return { success: false, error: "Failed to update unit. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function deleteUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  const parsed = parseFormData(deleteUnitSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { unitId } = parsed.data;
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

  const { data: activeLease } = await supabase
    .from("leases")
    .select("id")
    .eq("unit_id", unitId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (activeLease) {
    return {
      success: false,
      error: "Cannot archive a unit with an active lease. Archive the lease first."
    };
  }

  const { error } = await supabase
    .from("units")
    .update({ active: false, occupied: false })
    .eq("id", unitId);

  if (error && isMissingSchemaError(error)) {
    return {
      success: false,
      error: "Unit archive requires the active column migration to be applied."
    };
  }

  if (error) {
    return { success: false, error: "Failed to archive unit. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function createCheckoutForCharge(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parseFormData(payChargeSchema, formData);
  if (!parsed.success) {
    return;
  }

  const { chargeId } = parsed.data;

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager" && role !== "tenant") {
    redirect("/portal");
  }

  const { data: charge } = await supabase
    .from("rent_charges")
    .select("id, amount_cents, status, lease_id")
    .eq("id", chargeId)
    .single();

  if (!charge || charge.status === "paid") {
    return;
  }

  const { data: lease } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .single();

  if (!lease) {
    return;
  }

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .single();

  if (!unit) {
    return;
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", unit.property_id)
    .single();

  if (!property) {
    return;
  }

  const isAdmin = await canUserAdministerProperty(user.id, property.id);
  const isTenant = lease.tenant_profile_id === user.id;
  if (!isAdmin && !isTenant) {
    redirect("/portal");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await createStripeCheckoutSession({
    amountCents: charge.amount_cents,
    metadata: {
      charge_id: charge.id,
      user_id: user.id
    },
    successUrl: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/payments/cancel`
  });

  if (session.url) {
    redirect(session.url);
  }
}

/* ─── Maintenance Actions ─── */

export async function createMaintenanceTicket(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "tenant" && role !== "owner" && role !== "manager") {
    redirect("/portal");
  }

  const parsed = parseFormData(createMaintenanceTicketSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { unitId, title, description, priority } = parsed.data;

  // Look up property_id from the unit
  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", unitId)
    .single();

  if (!unit) {
    return { success: false, error: "Unit not found." };
  }

  if (role === "tenant") {
    const { data: lease } = await supabase
      .from("leases")
      .select("id")
      .eq("unit_id", unit.id)
      .eq("tenant_profile_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (!lease) {
      return { success: false, error: "You can only submit tickets for your leased unit." };
    }
  } else {
    const canAdminister = await canUserAdministerProperty(user.id, unit.property_id);
    if (!canAdminister) {
      return { success: false, error: "You do not have access to this unit." };
    }
  }

  const { data: ticket, error } = await supabase
    .from("maintenance_tickets")
    .insert({
      property_id: unit.property_id,
      unit_id: unitId,
      tenant_profile_id: role === "tenant" ? user.id : null,
      title,
      description,
      priority
    })
    .select("id")
    .single();

  if (error || !ticket) {
    return { success: false, error: "Failed to create maintenance request. Please try again." };
  }

  // Trigger required notification: new ticket (owner + assigned managers).
  try {
    const admin = createAdminClient();

    const [{ data: property }, { data: assignments }, { data: actorProfile }] = await Promise.all([
      admin
        .from("properties")
        .select("id, name")
        .eq("id", unit.property_id)
        .single(),
      admin
        .from("property_managers")
        .select("manager_profile_id")
        .eq("property_id", unit.property_id)
        .eq("active", true),
      admin
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .single()
    ]);

    const recipientIds = new Set<string>();
    for (const assignment of assignments ?? []) {
      if (assignment.manager_profile_id !== user.id) {
        recipientIds.add(assignment.manager_profile_id);
      }
    }

    const fromActor = actorProfile?.email ?? "A user";
    const propertyName = property?.name ?? "Property";
    await notifyOwnerMembersForProperty({
      propertyId: unit.property_id,
      type: "new_ticket",
      title: "New maintenance ticket",
      body: `${fromActor} submitted "${title}" for ${propertyName}.`,
      entityType: "maintenance_ticket",
      entityId: ticket.id,
      excludeProfileId: user.id
    });

    if (recipientIds.size > 0) {
      const { data: recipients } = await admin
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(recipientIds));

      for (const recipient of recipients ?? []) {
        await createNotificationWithDelivery({
          recipientProfileId: recipient.id,
          recipientEmail: recipient.email,
          type: "new_ticket",
          title: "New maintenance ticket",
          body: `${fromActor} submitted "${title}" for ${propertyName}.`,
          entityType: "maintenance_ticket",
          entityId: ticket.id
        });
      }
    }
  } catch (notificationError) {
    console.error("Failed to create new-ticket notifications:", notificationError);
  }

  revalidatePath("/tenant");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateTicketStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/portal");
  }

  const parsed = parseFormData(updateTicketStatusSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { ticketId, status } = parsed.data;

  const { data: ticket } = await supabase
    .from("maintenance_tickets")
    .select("id, property_id, title")
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    return { success: false, error: "Ticket not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, ticket.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this ticket." };
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "resolved") {
    updateData.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("maintenance_tickets")
    .update(updateData)
    .eq("id", ticketId);

  if (error) {
    return { success: false, error: "Failed to update ticket status." };
  }

  if (status === "resolved" || status === "closed") {
    await notifyOwnerMembersForProperty({
      propertyId: ticket.property_id,
      type: "ticket_resolved",
      title: "Maintenance ticket resolved",
      body: `"${ticket.title}" was marked ${status}.`,
      entityType: "maintenance_ticket",
      entityId: ticket.id
    });
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function updateTicketCost(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/portal");
  }

  const parsed = parseFormData(updateTicketCostSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { ticketId, actualCostDollars } = parsed.data;

  const { data: ticket } = await supabase
    .from("maintenance_tickets")
    .select("id, property_id")
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    return { success: false, error: "Ticket not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, ticket.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this ticket." };
  }

  const { error } = await supabase
    .from("maintenance_tickets")
    .update({ actual_cost_cents: Math.round(actualCostDollars * 100) })
    .eq("id", ticketId);

  if (error) {
    return { success: false, error: "Failed to update repair cost." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

/* ─── Invitation Actions ─── */

export async function inviteTenant(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/portal");
  }

  const parsed = parseFormData(inviteTenantSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { email, fullName } = parsed.data;
  const admin = createAdminClient();

  // Check if user already exists in profiles
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", email.toLowerCase())
    .single();

  if (existingProfile) {
    if (existingProfile.role === "tenant") {
      return { success: false, error: "This user is already a tenant." };
    }
    return {
      success: false,
      error: "A user with this email already exists with a different role.",
    };
  }

  // Check for existing pending invitation
  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id, status")
    .eq("email", email.toLowerCase())
    .eq("role", "tenant")
    .eq("invited_by", user.id)
    .single();

  if (existingInvite && existingInvite.status === "pending") {
    return {
      success: false,
      error: "An invitation has already been sent to this email.",
    };
  }

  // Send the invite via Supabase Admin API
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      data: {
        role: "tenant",
        full_name: fullName,
      },
    }
  );

  if (inviteError) {
    return {
      success: false,
      error: "Failed to send invitation. Please try again.",
    };
  }

  // Track the invitation
  const { error: insertError } = await admin.from("invitations").insert({
    email: email.toLowerCase(),
    full_name: fullName,
    role: "tenant",
    invited_by: user.id,
    status: "pending",
  });

  if (insertError) {
    console.error("Failed to track invitation:", insertError);
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function inviteManager(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/portal");
  }

  const parsed = parseFormData(inviteManagerSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { email, fullName, propertyId } = parsed.data;
  const admin = createAdminClient();

  // Verify inviter can administer this property.
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .single();

  if (!property || !(await canUserAdministerProperty(user.id, property.id))) {
    return { success: false, error: "Property not found." };
  }

  // Check if user already exists
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", email.toLowerCase())
    .single();

  if (existingProfile) {
    if (existingProfile.role === "manager") {
      // Already a manager — just assign to property
      const { error: assignError } = await admin
        .from("property_managers")
        .upsert(
          {
            property_id: propertyId,
            manager_profile_id: existingProfile.id,
            active: true,
          },
          { onConflict: "property_id,manager_profile_id" }
        );

      if (assignError) {
        return { success: false, error: "Failed to assign manager to property." };
      }

	      revalidatePath("/owner");
        revalidatePath("/manager");
	      return { success: true };
    }
    return {
      success: false,
      error: "A user with this email already exists with a different role.",
    };
  }

  // Send invite
  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        role: "manager",
        full_name: fullName,
      },
    });

  if (inviteError) {
    return { success: false, error: "Failed to send invitation. Please try again." };
  }

  // Track invitation with property_id
  await admin.from("invitations").insert({
    email: email.toLowerCase(),
    full_name: fullName,
    role: "manager",
    property_id: propertyId,
    invited_by: user.id,
    status: "pending",
  });

  // Pre-assign manager to property (inviteUserByEmail creates the auth user immediately)
  if (inviteData?.user?.id) {
    await admin.from("property_managers").upsert(
      {
        property_id: propertyId,
        manager_profile_id: inviteData.user.id,
        active: true,
      },
      { onConflict: "property_id,manager_profile_id" }
    );
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function inviteOwner(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(inviteOwnerSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { email, fullName, ownershipAccountId } = parsed.data;
  const admin = createAdminClient();

  if (!(await canUserAdministerOwnershipAccount(user.id, ownershipAccountId))) {
    return { success: false, error: "You do not have access to that ownership account." };
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (existingProfile && existingProfile.role !== "owner") {
    return {
      success: false,
      error: "This email already belongs to a non-owner profile."
    };
  }

  if (existingProfile?.id) {
    const { error } = await admin.from("ownership_account_members").upsert(
      {
        account_id: ownershipAccountId,
        profile_id: existingProfile.id,
        member_role: "owner",
        can_receive_critical_alerts: true,
        active: true
      },
      { onConflict: "account_id,profile_id" }
    );

    if (error) {
      return { success: false, error: "Failed to add co-owner to this account." };
    }

    revalidatePath("/owner");
    revalidatePath("/manager");
    return { success: true };
  }

  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id, status")
    .eq("email", email.toLowerCase())
    .eq("role", "owner")
    .eq("ownership_account_id", ownershipAccountId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite?.id) {
    return { success: false, error: "An owner invitation is already pending for this account." };
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      role: "owner",
      full_name: fullName,
      ownership_account_id: ownershipAccountId
    }
  });

  if (inviteError) {
    return { success: false, error: "Failed to send owner invitation." };
  }

  await admin.from("invitations").insert({
    email: email.toLowerCase(),
    full_name: fullName,
    role: "owner",
    invited_by: user.id,
    ownership_account_id: ownershipAccountId,
    status: "pending"
  });

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function createOwnershipAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(createOwnershipAccountSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();
  const { accountType, displayName } = parsed.data;
  const { data: account, error } = await admin
    .from("ownership_accounts")
    .insert({
      account_type: accountType,
      display_name: displayName,
      created_by_profile_id: user.id
    })
    .select("id")
    .single();

  if (error || !account?.id) {
    return { success: false, error: "Failed to create ownership account." };
  }

  const { error: memberError } = await admin.from("ownership_account_members").insert({
    account_id: account.id,
    profile_id: user.id,
    member_role: "owner",
    active: true,
    can_receive_critical_alerts: true
  });

  if (memberError) {
    return { success: false, error: "Account created, but failed to add owner membership." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function addOwnershipMember(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(addOwnershipMemberSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { accountId, profileId, canReceiveCriticalAlerts } = parsed.data;

  if (!(await canUserAdministerOwnershipAccount(user.id, accountId))) {
    return { success: false, error: "You do not have access to that ownership account." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("ownership_account_members").upsert(
    {
      account_id: accountId,
      profile_id: profileId,
      member_role: "owner",
      active: true,
      can_receive_critical_alerts: canReceiveCriticalAlerts ?? true
    },
    { onConflict: "account_id,profile_id" }
  );

  if (error) {
    return { success: false, error: "Failed to add ownership member." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function linkPropertyToOwnershipAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(linkPropertyToOwnershipAccountSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, ownershipAccountId } = parsed.data;
  const [canAdministerProperty, canAdministerAccount] = await Promise.all([
    canUserAdministerProperty(user.id, propertyId),
    canUserAdministerOwnershipAccount(user.id, ownershipAccountId)
  ]);

  if (!canAdministerProperty) {
    return { success: false, error: "You do not have access to this property." };
  }
  if (!canAdministerAccount) {
    return { success: false, error: "You do not have access to this ownership account." };
  }

  const { error } = await supabase
    .from("properties")
    .update({ owner_account_id: ownershipAccountId })
    .eq("id", propertyId);

  if (error) {
    return { success: false, error: "Failed to link property to ownership account." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function resendInvite(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/portal");
  }

  const parsed = parseFormData(resendInviteSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { invitationId } = parsed.data;
  const admin = createAdminClient();

  // Fetch the invitation (owned by this user)
  const { data: invitation } = await admin
    .from("invitations")
    .select("id, email, full_name, role, status, property_id, ownership_account_id")
    .eq("id", invitationId)
    .eq("invited_by", user.id)
    .single();

  if (!invitation) {
    return { success: false, error: "Invitation not found." };
  }

  if (invitation.status === "accepted") {
    return { success: false, error: "This invitation has already been accepted." };
  }

  // Resend the invite
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    invitation.email,
    {
      data: {
        role: invitation.role,
        full_name: invitation.full_name,
        property_id: invitation.property_id,
        ownership_account_id: invitation.ownership_account_id
      },
    }
  );

  if (inviteError) {
    return { success: false, error: "Failed to resend invitation." };
  }

  // Update the invitation timestamp
  await admin
    .from("invitations")
    .update({ created_at: new Date().toISOString() })
    .eq("id", invitationId);

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

/* ─── Notifications ─── */

export async function markNotificationRead(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const capabilityError = await ensureCapabilityEnabled("notificationsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(markNotificationReadSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { notificationId } = parsed.data;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_profile_id", user.id);

  if (error) {
    return { success: false, error: "Failed to mark notification as read." };
  }

  revalidatePath("/owner");
  revalidatePath("/tenant");
  revalidatePath("/manager");
  return { success: true };
}

/* ─── Documents + E-sign ─── */

export async function createDocumentTemplate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(createDocumentTemplateSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const capabilities = await getFeatureCapabilities();
  const { name, category, bodyMarkdown, ownerAccountId } = parsed.data;
  let error: { message: string } | null = null;

  if (capabilities.ownershipEnabled) {
    const ownerAccountIds = await getAdministeredOwnerAccountIds(user.id);
    const targetOwnerAccountId = ownerAccountId ?? ownerAccountIds[0];

    if (!targetOwnerAccountId) {
      return {
        success: false,
        error: "No ownership account is available. Create or link a property first."
      };
    }

    if (!ownerAccountIds.includes(targetOwnerAccountId)) {
      return { success: false, error: "You do not have access to that ownership account." };
    }

    const insertResult = await supabase.from("document_templates").insert({
      owner_account_id: targetOwnerAccountId,
      owner_profile_id: user.id,
      name,
      category,
      body_markdown: bodyMarkdown
    });
    error = insertResult.error;
  } else {
    const insertResult = await supabase.from("document_templates").insert({
      owner_profile_id: user.id,
      name,
      category,
      body_markdown: bodyMarkdown
    });
    error = insertResult.error;
  }

  if (error) {
    return { success: false, error: "Failed to create document template." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateDocumentTemplate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(updateDocumentTemplateSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { templateId, name, category, bodyMarkdown } = parsed.data;
  const { error } = await supabase
    .from("document_templates")
    .update({
      name,
      category,
      body_markdown: bodyMarkdown
    })
    .eq("id", templateId);

  if (error) {
    return { success: false, error: "Failed to update document template." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function deleteDocumentTemplate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(deleteDocumentTemplateSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { templateId } = parsed.data;
  const { error } = await supabase
    .from("document_templates")
    .delete()
    .eq("id", templateId);

  if (error) {
    return { success: false, error: "Failed to delete document template." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function createDocumentPacket(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(createDocumentPacketSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { templateId, leaseId } = parsed.data;

  const [{ data: template }, { data: lease }] = await Promise.all([
    supabase
      .from("document_templates")
      .select("id, owner_account_id")
      .eq("id", templateId)
      .single(),
    supabase
      .from("leases")
      .select("id, unit_id")
      .eq("id", leaseId)
      .single()
  ]);

  if (!template) {
    return { success: false, error: "Template not found." };
  }
  if (!lease) {
    return { success: false, error: "Lease not found." };
  }

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .single();

  if (!unit) {
    return { success: false, error: "Unit not found for lease." };
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id, owner_account_id")
    .eq("id", unit.property_id)
    .single();

  if (!property) {
    return { success: false, error: "Property not found for lease." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, property.id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this lease." };
  }

  if (template.owner_account_id !== property.owner_account_id) {
    return { success: false, error: "Template account does not match this property account." };
  }

  const { error } = await supabase.from("document_packets").insert({
    template_id: templateId,
    property_id: property.id,
    unit_id: unit.id,
    lease_id: lease.id,
    status: "draft",
    created_by_profile_id: user.id
  });

  if (error) {
    return { success: false, error: "Failed to create document packet." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function sendDocumentPacket(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(sendDocumentPacketSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { packetId } = parsed.data;
  const admin = createAdminClient();

  const { data: packet } = await supabase
    .from("document_packets")
    .select("id, lease_id, property_id, status, sent_at")
    .eq("id", packetId)
    .single();

  if (!packet) {
    return { success: false, error: "Document packet not found." };
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", packet.property_id)
    .single();

  if (!property || !(await canUserAdministerProperty(user.id, property.id))) {
    return { success: false, error: "You do not have access to this packet." };
  }

  if (packet.status === "signed" || packet.status === "void") {
    return { success: false, error: "This packet can no longer be sent." };
  }

  if (packet.status === "sent" && shouldThrottleDocumentPacketSend(packet.sent_at)) {
    return { success: true };
  }

  if (!packet.lease_id) {
    return { success: false, error: "Packet must be linked to a lease before sending." };
  }

  const { data: lease } = await admin
    .from("leases")
    .select("id, tenant_profile_id")
    .eq("id", packet.lease_id)
    .single();

  if (!lease?.tenant_profile_id) {
    return { success: false, error: "No tenant linked to this lease." };
  }

  const { data: tenantProfile } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", lease.tenant_profile_id)
    .single();

  if (!tenantProfile?.email) {
    return { success: false, error: "Tenant email is missing for this lease." };
  }

  const { error: signerError } = await admin.from("document_signers").upsert(
    {
      packet_id: packet.id,
      profile_id: tenantProfile.id,
      email: tenantProfile.email,
      role: "tenant",
      status: "pending"
    },
    { onConflict: "packet_id,email" }
  );

  if (signerError) {
    return { success: false, error: "Failed to set packet signer." };
  }

  const { error: packetError } = await supabase
    .from("document_packets")
    .update({
      status: "sent",
      sent_at: new Date().toISOString()
    })
    .eq("id", packet.id);

  if (packetError) {
    return { success: false, error: "Failed to send packet." };
  }

  await createNotificationWithDelivery({
    recipientProfileId: tenantProfile.id,
    recipientEmail: tenantProfile.email,
    type: "document_sent",
    title: "New document awaiting signature",
    body: "A lease-related document has been sent to you for signature.",
    entityType: "document_packet",
    entityId: packet.id
  });
  await notifyOwnerMembersForProperty({
    propertyId: packet.property_id,
    type: "document_sent",
    title: "Document packet sent",
    body: "A document packet was sent to the tenant for signature.",
    entityType: "document_packet",
    entityId: packet.id,
    excludeProfileId: user.id
  });

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function signDocumentPacket(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(signDocumentPacketSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { packetId, signatureText } = parsed.data;
  const admin = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  const email = profile?.email ?? "";
  const requestHeaders = headers();
  const ipAddress =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    null;
  const userAgent = requestHeaders.get("user-agent");

  const [{ data: signerByProfile }, { data: signerByEmail }] = await Promise.all([
    admin
      .from("document_signers")
      .select("id, status")
      .eq("packet_id", packetId)
      .eq("profile_id", user.id)
      .maybeSingle(),
    email
      ? admin
          .from("document_signers")
          .select("id, status")
          .eq("packet_id", packetId)
          .eq("email", email)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const signer = signerByProfile ?? signerByEmail;

  if (!signer) {
    return { success: false, error: "Signer record not found for this document." };
  }

  if (signer.status === "signed") {
    return { success: false, error: "This document is already signed." };
  }

  const signedAt = new Date().toISOString();
  const { error: signerError } = await admin
    .from("document_signers")
    .update({
      profile_id: user.id,
      status: "signed",
      signature_text: signatureText,
      signed_at: signedAt,
      ip_address: ipAddress,
      user_agent: userAgent
    })
    .eq("id", signer.id);

  if (signerError) {
    return { success: false, error: "Failed to sign document." };
  }

  const { data: remaining } = await admin
    .from("document_signers")
    .select("id")
    .eq("packet_id", packetId)
    .eq("status", "pending")
    .limit(1);

  if (!remaining || remaining.length === 0) {
    await admin
      .from("document_packets")
      .update({ status: "signed", signed_at: signedAt })
      .eq("id", packetId);

    const { data: packet } = await admin
      .from("document_packets")
      .select("id, property_id")
      .eq("id", packetId)
      .single();

    if (packet?.property_id) {
      await notifyOwnerMembersForProperty({
        propertyId: packet.property_id,
        type: "document_signed",
        title: "Document packet signed",
        body: "A tenant completed a required document signature.",
        entityType: "document_packet",
        entityId: packet.id
      });
    }
  }

  revalidatePath("/tenant");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function uploadPropertyFile(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(uploadPropertyFileSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Please select a valid file." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { success: false, error: "File must be under 20MB." };
  }

  const { propertyId, category, visibility, description } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${propertyId}/${crypto.randomUUID()}.${extension}`;
  const admin = createAdminClient();
  const fileType = file.type.startsWith("image/")
    ? "image"
    : file.type.includes("pdf")
      ? "pdf"
      : "document";

  const { error: uploadError } = await admin.storage
    .from("property-files")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

  if (uploadError) {
    return { success: false, error: "Failed to upload file to storage." };
  }

  const { error: insertError } = await admin.from("property_files").insert({
    property_id: propertyId,
    uploaded_by_profile_id: user.id,
    file_name: file.name,
    storage_path: storagePath,
    file_type: fileType,
    category,
    visibility,
    description: description || null
  });

  if (insertError && isMissingSchemaError(insertError)) {
    await admin.storage.from("property-files").remove([storagePath]);
    return {
      success: false,
      error: "Document vault is not available yet. Apply the property_files migration and retry."
    };
  }

  if (insertError) {
    await admin.storage.from("property-files").remove([storagePath]);
    return { success: false, error: "Failed to save file metadata." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function deletePropertyFile(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const parsed = parseFormData(deletePropertyFileSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { fileId } = parsed.data;
  const admin = createAdminClient();
  const { data: propertyFile, error: fileError } = await admin
    .from("property_files")
    .select("id, property_id, storage_path")
    .eq("id", fileId)
    .single();

  if (fileError && isMissingSchemaError(fileError)) {
    return {
      success: false,
      error: "Document vault is not available yet. Apply the property_files migration and retry."
    };
  }

  if (!propertyFile) {
    return { success: false, error: "File not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, propertyFile.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this file." };
  }

  await admin.storage.from("property-files").remove([propertyFile.storage_path]);

  const { error: deleteError } = await admin
    .from("property_files")
    .delete()
    .eq("id", fileId);

  if (deleteError) {
    return { success: false, error: "Failed to delete file." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function updateFileVisibility(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const parsed = parseFormData(updateFileVisibilitySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { fileId, visibility } = parsed.data;
  const admin = createAdminClient();
  const { data: propertyFile, error: fileError } = await admin
    .from("property_files")
    .select("id, property_id")
    .eq("id", fileId)
    .single();

  if (fileError && isMissingSchemaError(fileError)) {
    return {
      success: false,
      error: "Document vault is not available yet. Apply the property_files migration and retry."
    };
  }

  if (!propertyFile) {
    return { success: false, error: "File not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, propertyFile.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this file." };
  }

  const { error } = await admin
    .from("property_files")
    .update({ visibility })
    .eq("id", fileId);

  if (error) {
    return { success: false, error: "Failed to update file visibility." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

/* ─── Vendors + Maintenance Completion ─── */

export async function createVendor(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("vendorWorkflowEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(createVendorSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const capabilities = await getFeatureCapabilities();
  const { name, email, phone, tradeCategory, preferred, ownerAccountId } = parsed.data;
  let error: { message: string } | null = null;

  if (capabilities.ownershipEnabled) {
    const ownerAccountIds = await getAdministeredOwnerAccountIds(user.id);
    const targetOwnerAccountId = ownerAccountId ?? ownerAccountIds[0];
    if (!targetOwnerAccountId) {
      return {
        success: false,
        error: "No ownership account is available. Link or create a property first."
      };
    }

    if (!ownerAccountIds.includes(targetOwnerAccountId)) {
      return { success: false, error: "You do not have access to that ownership account." };
    }

    const insertResult = await supabase.from("vendors").insert({
      owner_profile_id: user.id,
      owner_account_id: targetOwnerAccountId,
      name,
      email: email || null,
      phone: phone || null,
      trade: tradeCategory,
      trade_category: tradeCategory,
      preferred,
      active: true
    });
    error = insertResult.error;
  } else {
    const insertResult = await supabase.from("vendors").insert({
      owner_profile_id: user.id,
      name,
      email: email || null,
      phone: phone || null,
      trade: tradeCategory,
      trade_category: tradeCategory,
      preferred,
      active: true
    });
    error = insertResult.error;
  }

  if (error && isMissingSchemaError(error)) {
    return {
      success: false,
      error: "Preferred-vendor fields are not available yet. Apply the latest vendor migration and retry."
    };
  }

  if (error) {
    return { success: false, error: "Failed to create vendor." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateVendor(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("vendorWorkflowEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(updateVendorSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { vendorId, name, email, phone, tradeCategory, preferred } = parsed.data;
  const admin = createAdminClient();

  const { data: vendor } = await admin
    .from("vendors")
    .select("id, owner_account_id")
    .eq("id", vendorId)
    .single();

  if (!vendor) {
    return { success: false, error: "Vendor not found." };
  }

  const ownerAccountIds = await getAdministeredOwnerAccountIds(user.id);
  if (vendor.owner_account_id && !ownerAccountIds.includes(vendor.owner_account_id)) {
    return { success: false, error: "You do not have access to this vendor." };
  }

  const { error } = await admin
    .from("vendors")
    .update({
      name,
      email: email || null,
      phone: phone || null,
      trade: tradeCategory,
      trade_category: tradeCategory,
      preferred
    })
    .eq("id", vendorId);

  if (error && isMissingSchemaError(error)) {
    return {
      success: false,
      error: "Preferred-vendor fields are not available yet. Apply the latest vendor migration and retry."
    };
  }

  if (error) {
    return { success: false, error: "Failed to update vendor." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function assignVendorToTicket(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("vendorWorkflowEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(assignVendorSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { ticketId, vendorId } = parsed.data;
  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("maintenance_tickets")
    .select("id, property_id")
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    return { success: false, error: "Ticket not found." };
  }

  const { data: property } = await admin
    .from("properties")
    .select("id, owner_account_id")
    .eq("id", ticket.property_id)
    .single();

  if (!property) {
    return { success: false, error: "Property not found for ticket." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, property.id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this ticket." };
  }

  const { data: vendor } = await admin
    .from("vendors")
    .select("id, owner_account_id")
    .eq("id", vendorId)
    .single();

  if (!vendor || vendor.owner_account_id !== property.owner_account_id) {
    return { success: false, error: "Vendor is not valid for this property owner." };
  }

  const { data: latestAssignment } = await admin
    .from("maintenance_assignments")
    .select("vendor_id")
    .eq("ticket_id", ticketId)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const assignmentPlan = getVendorAssignmentPlan(
    latestAssignment?.vendor_id ?? null,
    vendorId
  );

  if (!assignmentPlan.shouldInsert) {
    return { success: true };
  }

  const { error } = await admin.from("maintenance_assignments").insert({
    ticket_id: ticketId,
    vendor_id: vendorId,
    assigned_by_profile_id: user.id,
    status: assignmentPlan.status
  });

  if (error) {
    return { success: false, error: "Failed to assign vendor." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function uploadMaintenancePhoto(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const capabilityError = await ensureCapabilityEnabled("photoWorkflowEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(uploadMaintenancePhotoSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Please select a valid photo file." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "Photo must be under 10MB." };
  }

  const { ticketId, caption } = parsed.data;
  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("maintenance_tickets")
    .select("id, property_id")
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    return { success: false, error: "Ticket not found." };
  }

  const { data: property } = await admin
    .from("properties")
    .select("id")
    .eq("id", ticket.property_id)
    .single();

  if (!property) {
    return { success: false, error: "Property not found for ticket." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, property.id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this ticket." };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${ticketId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("maintenance-photos")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

  if (uploadError) {
    return { success: false, error: "Failed to upload photo." };
  }

  const { error: insertError } = await admin.from("maintenance_photos").insert({
    ticket_id: ticketId,
    uploaded_by_profile_id: user.id,
    storage_path: path,
    caption: caption || null
  });

  if (insertError) {
    return { success: false, error: "Photo uploaded but metadata save failed." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

/* ─── Expenses + P&L ─── */

async function uploadExpenseReceiptFile(
  admin: ReturnType<typeof createAdminClient>,
  propertyId: string,
  userId: string,
  file: File
): Promise<{ receiptFileId: string } | { error: string }> {
  if (file.size > 20 * 1024 * 1024) {
    return { error: "Receipt file must be under 20MB." };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${propertyId}/receipts/${crypto.randomUUID()}.${extension}`;
  const fileType = file.type.startsWith("image/")
    ? "image"
    : file.type.includes("pdf")
      ? "pdf"
      : "document";

  const { error: uploadError } = await admin.storage
    .from("property-files")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

  if (uploadError) {
    return { error: "Failed to upload receipt file." };
  }

  const { data: propertyFile, error: insertError } = await admin
    .from("property_files")
    .insert({
      property_id: propertyId,
      uploaded_by_profile_id: userId,
      file_name: file.name,
      storage_path: storagePath,
      file_type: fileType,
      category: "receipt",
      visibility: "owner_manager",
      description: "Expense receipt upload"
    })
    .select("id")
    .single();

  if (insertError && isMissingSchemaError(insertError)) {
    await admin.storage.from("property-files").remove([storagePath]);
    return { error: "Receipt upload requires the property file vault migration." };
  }

  if (insertError || !propertyFile) {
    await admin.storage.from("property-files").remove([storagePath]);
    return { error: "Receipt uploaded, but metadata save failed." };
  }

  return { receiptFileId: propertyFile.id };
}

export async function createExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(createExpenseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const {
    propertyId,
    category,
    description,
    amountDollars,
    expenseDate,
    recurring,
    recurringFrequency,
    vendorId,
    receiptFileId
  } = parsed.data;

  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const admin = createAdminClient();
  let resolvedReceiptFileId = receiptFileId || null;
  const receiptFile = formData.get("receiptFile");
  if (receiptFile instanceof File && receiptFile.size > 0) {
    const uploadResult = await uploadExpenseReceiptFile(admin, propertyId, user.id, receiptFile);
    if ("error" in uploadResult) {
      return { success: false, error: uploadResult.error };
    }
    resolvedReceiptFileId = uploadResult.receiptFileId;
  }

  const { error } = await admin.from("property_expenses").insert({
    property_id: propertyId,
    created_by_profile_id: user.id,
    category,
    description: description || null,
    amount_cents: Math.round(amountDollars * 100),
    expense_date: expenseDate,
    recurring,
    recurring_frequency: recurring ? recurringFrequency || null : null,
    vendor_id: vendorId || null,
    receipt_file_id: resolvedReceiptFileId
  });

  if (error && isMissingSchemaError(error)) {
    return {
      success: false,
      error: "Expense tracking is not available yet. Apply the Phase 4 migration and retry."
    };
  }

  if (error) {
    return { success: false, error: "Failed to create expense." };
  }

  revalidatePath("/owner");
  return { success: true };
}

export async function updateExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(updateExpenseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const {
    expenseId,
    category,
    description,
    amountDollars,
    expenseDate,
    recurring,
    recurringFrequency,
    vendorId,
    receiptFileId
  } = parsed.data;

  const admin = createAdminClient();
  const { data: existingExpense, error: expenseLookupError } = await admin
    .from("property_expenses")
    .select("id, property_id, receipt_file_id")
    .eq("id", expenseId)
    .single();

  if (expenseLookupError && isMissingSchemaError(expenseLookupError)) {
    return {
      success: false,
      error: "Expense tracking is not available yet. Apply the Phase 4 migration and retry."
    };
  }

  if (!existingExpense) {
    return { success: false, error: "Expense not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, existingExpense.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  let resolvedReceiptFileId = receiptFileId || existingExpense.receipt_file_id || null;
  const receiptFile = formData.get("receiptFile");
  if (receiptFile instanceof File && receiptFile.size > 0) {
    const uploadResult = await uploadExpenseReceiptFile(
      admin,
      existingExpense.property_id,
      user.id,
      receiptFile
    );
    if ("error" in uploadResult) {
      return { success: false, error: uploadResult.error };
    }
    resolvedReceiptFileId = uploadResult.receiptFileId;
  }

  const { error } = await admin
    .from("property_expenses")
    .update({
      category,
      description: description || null,
      amount_cents: Math.round(amountDollars * 100),
      expense_date: expenseDate,
      recurring,
      recurring_frequency: recurring ? recurringFrequency || null : null,
      vendor_id: vendorId || null,
      receipt_file_id: resolvedReceiptFileId
    })
    .eq("id", expenseId);

  if (error) {
    return { success: false, error: "Failed to update expense." };
  }

  revalidatePath("/owner");
  return { success: true };
}

export async function deleteExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(deleteExpenseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { expenseId } = parsed.data;
  const admin = createAdminClient();
  const { data: expense, error: lookupError } = await admin
    .from("property_expenses")
    .select("id, property_id")
    .eq("id", expenseId)
    .single();

  if (lookupError && isMissingSchemaError(lookupError)) {
    return {
      success: false,
      error: "Expense tracking is not available yet. Apply the Phase 4 migration and retry."
    };
  }

  if (!expense) {
    return { success: false, error: "Expense not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, expense.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { error } = await admin
    .from("property_expenses")
    .delete()
    .eq("id", expenseId);

  if (error) {
    return { success: false, error: "Failed to delete expense." };
  }

  revalidatePath("/owner");
  return { success: true };
}

/* ─── Tester Mode ─── */

export async function generateTesterData(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!(await hasTesterAccess(user.id))) {
    return { success: false, error: "Tester access is required." };
  }

  const admin = createAdminClient();
  const ownerAccountId = await getOrCreateIndividualOwnershipAccount(user.id);
  const stamp = Date.now();

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .insert({
      owner_profile_id: user.id,
      owner_account_id: ownerAccountId,
      name: `TESTER Property ${stamp}`,
      address_line1: `${100 + (stamp % 900)} Tester Ave`,
      city: "Denver",
      state: "CO",
      postal_code: "80202"
    })
    .select("id")
    .single();

  if (propertyError || !property) {
    return { success: false, error: "Failed to create tester property." };
  }

  const { data: unit, error: unitError } = await admin
    .from("units")
    .insert({
      property_id: property.id,
      unit_number: `TESTER-${String(stamp).slice(-4)}`,
      bedrooms: 3,
      bathrooms: 2,
      monthly_rent_cents: 245000,
      occupied: false
    })
    .select("id")
    .single();

  if (unitError || !unit) {
    return { success: false, error: "Failed to create tester unit." };
  }

  const tenantProfileId = crypto.randomUUID();
  const { error: tenantError } = await admin
    .from("profiles")
    .insert({
      id: tenantProfileId,
      email: `tester+${stamp}@domus.local`,
      full_name: `Tester Tenant ${String(stamp).slice(-4)}`,
      role: "tenant"
    });

  if (tenantError) {
    return { success: false, error: "Failed to create tester tenant profile." };
  }

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setFullYear(startDate.getFullYear() + 1);

  const { data: lease, error: leaseError } = await admin
    .from("leases")
    .insert({
      unit_id: unit.id,
      tenant_profile_id: tenantProfileId,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      due_day_of_month: 1,
      monthly_rent_cents: 245000,
      deposit_cents: 245000,
      active: true
    })
    .select("id")
    .single();

  if (leaseError || !lease) {
    return { success: false, error: "Failed to create tester lease." };
  }

  await admin.from("units").update({ occupied: true }).eq("id", unit.id);

  const thisMonthDue = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const lastMonthDue = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);

  const { error: chargesError } = await admin.from("rent_charges").insert([
    {
      lease_id: lease.id,
      due_date: thisMonthDue,
      amount_cents: 245000,
      status: "pending"
    },
    {
      lease_id: lease.id,
      due_date: lastMonthDue,
      amount_cents: 245000,
      status: "late"
    }
  ]);

  if (chargesError) {
    return { success: false, error: "Tester data created, but charge generation failed." };
  }

  revalidatePath("/owner");
  revalidatePath("/tester");
  return {
    success: true,
    message: `Created tester data: 1 property, 1 unit, 1 tenant lease, and 2 rent charges.`
  };
}

export async function cleanupTesterData(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!(await hasTesterAccess(user.id))) {
    return { success: false, error: "Tester access is required." };
  }

  const admin = createAdminClient();
  const { data: properties } = await admin
    .from("properties")
    .select("id")
    .eq("owner_profile_id", user.id)
    .ilike("name", "TESTER Property%");

  const propertyIds = (properties ?? []).map((property) => property.id);
  if (propertyIds.length === 0) {
    return {
      success: true,
      message: "No tester data was found to archive."
    };
  }

  const { data: units } = await admin
    .from("units")
    .select("id")
    .in("property_id", propertyIds);

  const unitIds = (units ?? []).map((unit) => unit.id);
  const { data: leases } = unitIds.length
    ? await admin
        .from("leases")
        .select("id")
        .in("unit_id", unitIds)
    : { data: [] as Array<{ id: string }> };

  const leaseIds = (leases ?? []).map((lease) => lease.id);

  if (leaseIds.length > 0) {
    await admin
      .from("leases")
      .update({ active: false })
      .in("id", leaseIds);
  }

  if (unitIds.length > 0) {
    const unitArchive = await admin
      .from("units")
      .update({ occupied: false, active: false })
      .in("id", unitIds);

    if (unitArchive.error && isMissingSchemaError(unitArchive.error)) {
      await admin
        .from("units")
        .update({ occupied: false })
        .in("id", unitIds);
    }
  }

  const propertyArchive = await admin
    .from("properties")
    .update({ active: false })
    .in("id", propertyIds);

  if (propertyArchive.error && isMissingSchemaError(propertyArchive.error)) {
    // Legacy environments may not yet have the soft-delete column.
  }

  revalidatePath("/owner");
  revalidatePath("/tester");
  return {
    success: true,
    message: `Archived tester data for ${propertyIds.length} properties, ${unitIds.length} units, and ${leaseIds.length} leases.`
  };
}

export async function grantTesterAccess(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" || !(await hasTesterAccess(user.id))) {
    return { success: false, error: "Only owner tester accounts can grant tester access." };
  }

  const parsed = parseFormData(grantTesterAccessSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const admin = createAdminClient();

  const { data: profile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id, email, is_tester")
    .ilike("email", normalizedEmail)
    .single();

  if (profileLookupError || !profile) {
    return {
      success: false,
      error: "No profile found for that email. They need to sign in at least once first."
    };
  }

  if (profile.is_tester) {
    return { success: true, message: `${profile.email} already has tester access.` };
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ is_tester: true })
    .eq("id", profile.id);

  if (updateError) {
    return { success: false, error: "Failed to grant tester access." };
  }

  revalidatePath("/tester");
  revalidatePath("/owner");
  return { success: true, message: `Granted tester access to ${profile.email}.` };
}

export async function revokeTesterAccess(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" || !(await hasTesterAccess(user.id))) {
    return { success: false, error: "Only owner tester accounts can revoke tester access." };
  }

  const parsed = parseFormData(revokeTesterAccessSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  if (parsed.data.profileId === user.id) {
    return {
      success: false,
      error: "You cannot revoke your own tester access from this page."
    };
  }

  const admin = createAdminClient();
  const { data: profile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id, email, is_tester")
    .eq("id", parsed.data.profileId)
    .single();

  if (profileLookupError || !profile) {
    return { success: false, error: "Tester profile not found." };
  }

  if (!profile.is_tester) {
    return { success: true, message: `${profile.email} is already not a tester.` };
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ is_tester: false })
    .eq("id", profile.id);

  if (updateError) {
    return { success: false, error: "Failed to revoke tester access." };
  }

  revalidatePath("/tester");
  return { success: true, message: `Revoked tester access for ${profile.email}.` };
}
