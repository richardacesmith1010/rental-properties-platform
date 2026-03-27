"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { logAudit } from "@/lib/audit";
import { sideEffectError } from "@/lib/logger";
import {
  createNotificationWithDelivery,
  notifyOwnerMembersForProperty
} from "@/lib/notifications";
import {
  addTicketCommentSchema,
  parseFormData,
  updateTicketCostSchema
} from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "./auth-helpers";
import { isMissingSchemaError, type ActionState } from "./shared";

export async function updateTicketCost(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, user } = await requireAuth("owner", "manager");
  const rateLimited = checkRateLimit(`updateTicketCost:${user.id}`, 30, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
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

export async function addTicketComment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, role } = await requireAuth("owner", "manager", "tenant");
  const rateLimited = checkRateLimit(`addTicketComment:${user.id}`, 60, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(addTicketCommentSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { ticketId, body, isInternal } = parsed.data;
  const internalNote = isInternal === "true";

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("maintenance_tickets")
    .select("id, property_id, tenant_profile_id, title")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) {
    return { success: false, error: "Ticket not found." };
  }

  if (role === "tenant") {
    if (ticket.tenant_profile_id !== user.id) {
      return { success: false, error: "You do not have access to this ticket." };
    }
    if (internalNote) {
      return { success: false, error: "Internal notes are only available to owners and managers." };
    }
  } else {
    const canAdminister = await canUserAdministerProperty(user.id, ticket.property_id);
    if (!canAdminister) {
      return { success: false, error: "You do not have access to this ticket." };
    }
  }

  const { error: insertError } = await admin.from("maintenance_comments").insert({
    ticket_id: ticket.id,
    author_id: user.id,
    body,
    is_internal: internalNote
  });

  if (insertError) {
    const missingSchema = await isMissingSchemaError(insertError);
    return {
      success: false,
      error: missingSchema
        ? "This feature requires a database update."
        : "Failed to add comment. Please try again."
    };
  }

  if (role === "tenant") {
    void notifyOwnerMembersForProperty({
      propertyId: ticket.property_id,
      type: "new_ticket",
      title: "New maintenance comment",
      body: `Tenant added a comment on: ${ticket.title}`,
      entityType: "maintenance_ticket",
      entityId: ticket.id,
      actorProfileId: user.id
    }).catch(
      sideEffectError("addTicketComment", "notify_participants", {
        userId: user.id,
        entityType: "ticket",
        entityId: ticket.id
      })
    );
  } else if (ticket.tenant_profile_id) {
    const { data: tenantProfile } = await admin
      .from("profiles")
      .select("id, email")
      .eq("id", ticket.tenant_profile_id)
      .maybeSingle();

    if (tenantProfile?.id) {
      void createNotificationWithDelivery({
        recipientProfileId: tenantProfile.id,
        recipientEmail: tenantProfile.email,
        type: "new_ticket",
        title: "Maintenance request updated",
        body: `New update on your maintenance request: ${ticket.title}`,
        entityType: "maintenance_ticket",
        entityId: ticket.id
      }).catch(
        sideEffectError("addTicketComment", "notify_participants", {
          userId: user.id,
          entityType: "ticket",
          entityId: ticket.id
        })
      );
    }
  }

  void logAudit({
    userId: user.id,
    action: "add_ticket_comment",
    entityType: "maintenance_ticket",
    entityId: ticket.id,
    metadata: {
      propertyId: ticket.property_id,
      title: ticket.title,
      isInternal: internalNote
    }
  }).catch(
    sideEffectError("addTicketComment", "log_audit", {
      userId: user.id,
      entityType: "ticket",
      entityId: ticket.id
    })
  );

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true, message: "Comment added." };
}
