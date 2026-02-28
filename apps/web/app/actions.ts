"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { createStripeCheckoutSession } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationWithDelivery } from "@/lib/notifications";
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
  createDocumentTemplateSchema,
  updateDocumentTemplateSchema,
  deleteDocumentTemplateSchema,
  createDocumentPacketSchema,
  sendDocumentPacketSchema,
  signDocumentPacketSchema,
  markNotificationReadSchema,
  createVendorSchema,
  assignVendorSchema,
  uploadMaintenancePhotoSchema,
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

  const { data: ticket, error } = await supabase
    .from("maintenance_tickets")
    .insert({
      property_id: unit.property_id,
      unit_id: unitId,
      tenant_profile_id: user.id,
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

    const [{ data: property }, { data: assignments }, { data: tenantProfile }] = await Promise.all([
      admin
        .from("properties")
        .select("id, owner_profile_id, name")
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
    if (property?.owner_profile_id) {
      recipientIds.add(property.owner_profile_id);
    }
    for (const assignment of assignments ?? []) {
      recipientIds.add(assignment.manager_profile_id);
    }

    if (recipientIds.size > 0) {
      const { data: recipients } = await admin
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(recipientIds));

      const fromTenant = tenantProfile?.email ?? "A tenant";
      const propertyName = property?.name ?? "Property";
      for (const recipient of recipients ?? []) {
        await createNotificationWithDelivery({
          recipientProfileId: recipient.id,
          recipientEmail: recipient.email,
          type: "new_ticket",
          title: "New maintenance ticket",
          body: `${fromTenant} submitted \"${title}\" for ${propertyName}.`,
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
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(createDocumentTemplateSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { name, category, bodyMarkdown } = parsed.data;
  const { error } = await supabase.from("document_templates").insert({
    owner_profile_id: user.id,
    name,
    category,
    body_markdown: bodyMarkdown
  });

  if (error) {
    return { success: false, error: "Failed to create document template." };
  }

  revalidatePath("/owner");
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
  if (role !== "owner") {
    redirect("/portal");
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
    .eq("id", templateId)
    .eq("owner_profile_id", user.id);

  if (error) {
    return { success: false, error: "Failed to update document template." };
  }

  revalidatePath("/owner");
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
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(deleteDocumentTemplateSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { templateId } = parsed.data;
  const { error } = await supabase
    .from("document_templates")
    .delete()
    .eq("id", templateId)
    .eq("owner_profile_id", user.id);

  if (error) {
    return { success: false, error: "Failed to delete document template." };
  }

  revalidatePath("/owner");
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
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(createDocumentPacketSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { templateId, leaseId } = parsed.data;

  const [{ data: template }, { data: lease }] = await Promise.all([
    supabase
      .from("document_templates")
      .select("id, owner_profile_id")
      .eq("id", templateId)
      .single(),
    supabase
      .from("leases")
      .select("id, unit_id")
      .eq("id", leaseId)
      .single()
  ]);

  if (!template || template.owner_profile_id !== user.id) {
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
    .select("id, owner_profile_id")
    .eq("id", unit.property_id)
    .single();

  if (!property || property.owner_profile_id !== user.id) {
    return { success: false, error: "Property not found for lease." };
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
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(sendDocumentPacketSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { packetId } = parsed.data;
  const admin = createAdminClient();

  const { data: packet } = await supabase
    .from("document_packets")
    .select("id, lease_id, property_id, status")
    .eq("id", packetId)
    .single();

  if (!packet) {
    return { success: false, error: "Document packet not found." };
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id, owner_profile_id")
    .eq("id", packet.property_id)
    .single();

  if (!property || property.owner_profile_id !== user.id) {
    return { success: false, error: "You do not have access to this packet." };
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
    type: "new_ticket",
    title: "New document awaiting signature",
    body: "A lease-related document has been sent to you for signature.",
    entityType: "document_packet",
    entityId: packet.id
  });

  revalidatePath("/owner");
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
  }

  revalidatePath("/tenant");
  revalidatePath("/owner");
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
  if (role !== "owner") {
    redirect("/portal");
  }

  const parsed = parseFormData(createVendorSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { name, email, phone, trade } = parsed.data;

  const { error } = await supabase.from("vendors").insert({
    owner_profile_id: user.id,
    name,
    email: email || null,
    phone: phone || null,
    trade: trade || null,
    active: true
  });

  if (error) {
    return { success: false, error: "Failed to create vendor." };
  }

  revalidatePath("/owner");
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
    .select("id, owner_profile_id")
    .eq("id", ticket.property_id)
    .single();

  if (!property) {
    return { success: false, error: "Property not found for ticket." };
  }

  if (role === "owner" && property.owner_profile_id !== user.id) {
    return { success: false, error: "You do not have access to this ticket." };
  }

  if (role === "manager") {
    const { data: assignment } = await supabase
      .from("property_managers")
      .select("property_id")
      .eq("property_id", property.id)
      .eq("manager_profile_id", user.id)
      .eq("active", true)
      .single();

    if (!assignment) {
      return { success: false, error: "You are not assigned to this property." };
    }
  }

  const { data: vendor } = await admin
    .from("vendors")
    .select("id, owner_profile_id")
    .eq("id", vendorId)
    .single();

  if (!vendor || vendor.owner_profile_id !== property.owner_profile_id) {
    return { success: false, error: "Vendor is not valid for this property owner." };
  }

  const { error } = await admin.from("maintenance_assignments").insert({
    ticket_id: ticketId,
    vendor_id: vendorId,
    assigned_by_profile_id: user.id,
    status: "assigned"
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
    .select("id, owner_profile_id")
    .eq("id", ticket.property_id)
    .single();

  if (!property) {
    return { success: false, error: "Property not found for ticket." };
  }

  if (role === "owner" && property.owner_profile_id !== user.id) {
    return { success: false, error: "You do not have access to this ticket." };
  }

  if (role === "manager") {
    const { data: assignment } = await supabase
      .from("property_managers")
      .select("property_id")
      .eq("property_id", property.id)
      .eq("manager_profile_id", user.id)
      .eq("active", true)
      .single();

    if (!assignment) {
      return { success: false, error: "You are not assigned to this property." };
    }
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
