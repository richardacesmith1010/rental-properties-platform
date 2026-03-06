"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  createNotificationWithDelivery,
  notifyOwnerMembersForProperty
} from "@/lib/notifications";
import {
  createMaintenanceTicketSchema,
  updateTicketStatusSchema,
  updateTicketCostSchema,
  parseFormData
} from "@/lib/validations";
import type { ActionState } from "./shared";

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
      excludeProfileId: user.id,
      actorProfileId: user.id
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
      entityId: ticket.id,
      actorProfileId: user.id
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

