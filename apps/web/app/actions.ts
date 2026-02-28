"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { createStripeCheckoutSession } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPropertySchema,
  createUnitSchema,
  createLeaseSchema,
  payChargeSchema,
  createMaintenanceTicketSchema,
  updateTicketStatusSchema,
  updateTicketCostSchema,
  inviteTenantSchema,
  inviteManagerSchema,
  resendInviteSchema,
  parseFormData,
} from "@/lib/validations";

export type ActionState = { success: true } | { success: false; error: string } | null;

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
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(createPropertySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { name, addressLine1, city, state, postalCode } = parsed.data;

  const { error } = await supabase.from("properties").insert({
    owner_profile_id: user.id,
    name,
    address_line1: addressLine1,
    city,
    state,
    postal_code: postalCode
  });

  if (error) {
    return { success: false, error: "Failed to create property. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
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
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(createUnitSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, unitNumber, bedrooms, bathrooms, monthlyRentDollars } = parsed.data;

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
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(createLeaseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { unitId, tenantProfileId, startDate, endDate, dueDayOfMonth, monthlyRentDollars, depositDollars } =
    parsed.data;

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

  revalidatePath("/");
  revalidatePath("/owner");
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
  if (role !== "owner" && role !== "tenant") {
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
    .select("id, owner_profile_id")
    .eq("id", unit.property_id)
    .single();

  if (!property) {
    return;
  }

  const isOwner = property.owner_profile_id === user.id;
  const isTenant = lease.tenant_profile_id === user.id;
  if (!isOwner && !isTenant) {
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
  if (role !== "tenant" && role !== "owner") {
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

  const { error } = await supabase.from("maintenance_tickets").insert({
    property_id: unit.property_id,
    unit_id: unitId,
    tenant_profile_id: user.id,
    title,
    description,
    priority,
  });

  if (error) {
    return { success: false, error: "Failed to create maintenance request. Please try again." };
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
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(updateTicketCostSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { ticketId, actualCostDollars } = parsed.data;

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
  if (role !== "owner") {
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
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(inviteManagerSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { email, fullName, propertyId } = parsed.data;
  const admin = createAdminClient();

  // Verify owner actually owns this property
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("owner_profile_id", user.id)
    .single();

  if (!property) {
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
  if (role !== "owner") {
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
    .select("id, email, full_name, role, status")
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
  return { success: true };
}
