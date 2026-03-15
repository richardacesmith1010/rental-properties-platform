"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { logAudit } from "@/lib/audit";
import { sideEffectError } from "@/lib/logger";
import { logMaintenanceStatusChange } from "@/lib/maintenance";
import {
  createNotificationWithDelivery,
  notifyOwnerMembersForProperty
} from "@/lib/notifications";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import {
  createMaintenanceTicketSchema,
  updateTicketStatusSchema,
  updateTicketCostSchema,
  addTicketCommentSchema,
  parseFormData
} from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "./auth-helpers";
import { isMissingSchemaError, type ActionState } from "./shared";

export async function createMaintenanceTicket(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, user, role } = await requireAuth("tenant", "owner", "manager");
  const rateLimited = checkRateLimit(`createMaintenanceTicket:${user.id}`, 30, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
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

  void logMaintenanceStatusChange(supabase, ticket.id, null, "submitted", user.id).catch(
    sideEffectError("createMaintenanceTicket", "log_status_history", {
      userId: user.id,
      entityType: "ticket",
      entityId: ticket.id
    })
  );

  // Trigger required notification: new ticket (owner + assigned managers).
  try {
    const admin = createAdminClient();

    const [propertySettled, assignmentsSettled, actorProfileSettled] = await Promise.allSettled([
      admin
        .from("properties")
        .select("id, name")
        .eq("id", unit.property_id)
        .maybeSingle(),
      admin
        .from("property_managers")
        .select("manager_profile_id")
        .eq("property_id", unit.property_id)
        .eq("active", true),
      admin
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle()
    ]);

    const property =
      propertySettled.status === "fulfilled" && !propertySettled.value.error
        ? propertySettled.value.data
        : null;
    if (propertySettled.status === "rejected") {
      sideEffectError("createMaintenanceTicket", "load_property", {
        userId: user.id,
        entityType: "ticket",
        entityId: ticket.id
      })(propertySettled.reason);
    } else if (propertySettled.value.error) {
      sideEffectError("createMaintenanceTicket", "load_property", {
        userId: user.id,
        entityType: "ticket",
        entityId: ticket.id
      })(propertySettled.value.error);
    }

    const assignments =
      assignmentsSettled.status === "fulfilled" && !assignmentsSettled.value.error
        ? assignmentsSettled.value.data ?? []
        : [];
    if (assignmentsSettled.status === "rejected") {
      sideEffectError("createMaintenanceTicket", "load_property_managers", {
        userId: user.id,
        entityType: "ticket",
        entityId: ticket.id
      })(assignmentsSettled.reason);
    } else if (assignmentsSettled.value.error) {
      sideEffectError("createMaintenanceTicket", "load_property_managers", {
        userId: user.id,
        entityType: "ticket",
        entityId: ticket.id
      })(assignmentsSettled.value.error);
    }

    const actorProfile =
      actorProfileSettled.status === "fulfilled" && !actorProfileSettled.value.error
        ? actorProfileSettled.value.data
        : null;
    if (actorProfileSettled.status === "rejected") {
      sideEffectError("createMaintenanceTicket", "load_actor_profile", {
        userId: user.id,
        entityType: "ticket",
        entityId: ticket.id
      })(actorProfileSettled.reason);
    } else if (actorProfileSettled.value.error) {
      sideEffectError("createMaintenanceTicket", "load_actor_profile", {
        userId: user.id,
        entityType: "ticket",
        entityId: ticket.id
      })(actorProfileSettled.value.error);
    }

    if (!property) {
      throw new Error("Property not found for maintenance notification dispatch.");
    }

    const recipientIds = new Set<string>();
    for (const assignment of assignments ?? []) {
      if (assignment.manager_profile_id !== user.id) {
        recipientIds.add(assignment.manager_profile_id);
      }
    }

    const fromActor = actorProfile?.email ?? "A user";
    const propertyName = property?.name ?? "Property";
    void notifyOwnerMembersForProperty({
      propertyId: unit.property_id,
      type: "new_ticket",
      title: "New maintenance ticket",
      body: `${fromActor} submitted "${title}" for ${propertyName}.`,
      entityType: "maintenance_ticket",
      entityId: ticket.id,
      excludeProfileId: user.id,
      actorProfileId: user.id
    }).catch(
      sideEffectError("createMaintenanceTicket", "notify_property_admin", {
        userId: user.id,
        entityType: "ticket",
        entityId: ticket.id
      })
    );

    if (recipientIds.size > 0) {
      const { data: recipients } = await admin
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(recipientIds));

      for (const recipient of recipients ?? []) {
        void createNotificationWithDelivery({
          recipientProfileId: recipient.id,
          recipientEmail: recipient.email,
          type: "new_ticket",
          title: "New maintenance ticket",
          body: `${fromActor} submitted "${title}" for ${propertyName}.`,
          entityType: "maintenance_ticket",
          entityId: ticket.id
        }).catch(
          sideEffectError("createMaintenanceTicket", "notify_property_admin", {
            userId: user.id,
            entityType: "ticket",
            entityId: ticket.id
          })
        );
      }
    }
  } catch (notificationError) {
    console.error("Failed to create new-ticket notifications:", notificationError);
  }

  void awardXp(
    user.id,
    "ticket_submitted",
    XP_VALUES.ticket_submitted,
    "Maintenance ticket submitted.",
    {
      ticket_id: ticket.id,
      property_id: unit.property_id,
      unit_id: unit.id
    }
  ).catch(
    sideEffectError("createMaintenanceTicket", "award_xp", {
      userId: user.id,
      entityType: "xp_event",
      entityId: ticket.id
    })
  );

  void logAudit({
    userId: user.id,
    action: "create_ticket",
    entityType: "maintenance_ticket",
    entityId: ticket.id,
    metadata: {
      propertyId: unit.property_id,
      unitId: unit.id,
      title
    }
  }).catch(
    sideEffectError("createMaintenanceTicket", "log_audit", {
      userId: user.id,
      entityType: "ticket",
      entityId: ticket.id
    })
  );

  revalidatePath("/tenant");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateTicketStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, user } = await requireAuth("owner", "manager");
  const rateLimited = checkRateLimit(`updateTicketStatus:${user.id}`, 60, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateTicketStatusSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { ticketId, status } = parsed.data;

  const { data: ticket } = await supabase
    .from("maintenance_tickets")
    .select("id, property_id, tenant_profile_id, title, status")
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

  void (async () => {
    if (ticket.status === "open" && status !== "open") {
      await logMaintenanceStatusChange(supabase, ticket.id, "open", "reviewed", user.id);
    }
    await logMaintenanceStatusChange(supabase, ticket.id, ticket.status, status, user.id);
  })().catch(
    sideEffectError("updateTicketStatus", "log_status_history", {
      userId: user.id,
      entityType: "ticket",
      entityId: ticket.id
    })
  );

  if (status === "resolved" || status === "closed") {
    void notifyOwnerMembersForProperty({
      propertyId: ticket.property_id,
      type: "ticket_resolved",
      title: "Maintenance ticket resolved",
      body: `"${ticket.title}" was marked ${status}.`,
      entityType: "maintenance_ticket",
      entityId: ticket.id,
      actorProfileId: user.id
    }).catch(
      sideEffectError("updateTicketStatus", "notify_owner", {
        userId: user.id,
        entityType: "ticket",
        entityId: ticket.id
      })
    );
  }

  if (status === "resolved" && ticket.tenant_profile_id) {
    const admin = createAdminClient();
    const { data: tenantProfile } = await admin
      .from("profiles")
      .select("id, email")
      .eq("id", ticket.tenant_profile_id)
      .maybeSingle();

    if (tenantProfile?.id) {
      void createNotificationWithDelivery({
        recipientProfileId: tenantProfile.id,
        recipientEmail: tenantProfile.email,
        type: "ticket_resolved",
        title: "Maintenance Request Resolved",
        body: `Your maintenance request "${ticket.title}" has been resolved.`,
        entityType: "maintenance_ticket",
        entityId: ticket.id
      }).catch(
        sideEffectError("updateTicketStatus", "notify_tenant", {
          userId: user.id,
          entityType: "ticket",
          entityId: ticket.id
        })
      );
    }
  }

  if (status === "resolved" && ticket.status !== "resolved") {
    void awardXp(
      user.id,
      "ticket_resolved",
      XP_VALUES.ticket_resolved,
      "Maintenance ticket resolved.",
      {
        ticket_id: ticket.id,
        property_id: ticket.property_id
      }
    ).catch(
      sideEffectError("updateTicketStatus", "award_xp", {
        userId: user.id,
        entityType: "xp_event",
        entityId: ticket.id
      })
    );
  }

  void logAudit({
    userId: user.id,
    action: "update_ticket_status",
    entityType: "maintenance_ticket",
    entityId: ticket.id,
    metadata: {
      propertyId: ticket.property_id,
      title: ticket.title,
      status
    }
  }).catch(
    sideEffectError("updateTicketStatus", "log_audit", {
      userId: user.id,
      entityType: "ticket",
      entityId: ticket.id
    })
  );

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

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

  const { error: insertError } = await admin
    .from("maintenance_comments")
    .insert({
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
