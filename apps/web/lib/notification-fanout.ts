import { createAdminClient } from "@/lib/supabase/admin";
import { ensureInboxThreadForEvent } from "@/lib/inbox";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  DEFAULT_NOTIFICATION_EMAIL_PREFERENCES,
  getUserNotificationPreferenceSettingsMap,
  resolveNotificationDeliveryPreference,
  type NotificationPreferenceSettings
} from "@/lib/notification-preferences";
import { createNotificationWithDelivery, type NotificationType } from "@/lib/notifications";
import { notificationMode } from "@/lib/notifications-switch";
import { rulesFor, type NotificationEvent } from "@/lib/notification-policy";
import { loadPropertyTeam } from "@/lib/notification-recipients";

function createFallbackNotificationSettings(): NotificationPreferenceSettings {
  return {
    preferences: { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES },
    pausedUntil: null,
    schemaReady: false
  };
}


interface NotifyPropertyTeamParams {
  propertyId: string;
  type: NotificationType;
  event?: NotificationEvent;
  title: string;
  body: string;
  entityType: string;
  entityId?: string | null;
  excludeProfileId?: string | null;
  actorProfileId?: string | null;
  emailMode?: "default" | "never";
}

function shouldMirrorToInbox(type: NotificationType) {
  return type === "new_ticket" || type === "ticket_resolved" || type === "lease_updated";
}

export async function notifyPropertyTeam(params: NotifyPropertyTeamParams) {
  const mode = notificationMode();
  if (mode === "off") return;
  try {
    const admin = createAdminClient();
    const rule = params.event ? rulesFor(params.event) : null;
    const team = await loadPropertyTeam(admin, params.propertyId);
    if (!team) return;
    if (rule && rule.type !== params.type) return;
    const mirrorActorId = params.actorProfileId ?? team.ownerIds[0] ?? team.managerIds[0];
    if (mode === "on" && shouldMirrorToInbox(params.type) && mirrorActorId) {
      try {
        await ensureInboxThreadForEvent({
          propertyId: params.propertyId,
          entityType: params.entityType,
          entityId: params.entityId ?? null,
          subject: params.title,
          messageBody: params.body,
          actorProfileId: mirrorActorId
        });
      } catch (error) {
        console.error(`[notifications] inbox_mirror: ${error instanceof Error ? error.name : "unknown"}`);
      }
    }
    const ownerIds = rule?.owners === false ? [] : team.ownerIds;
    const managerIds = rule?.managers === "all_homes" ||
      (rule?.managers === "client_homes" && team.clientHome) ? team.managerIds : [];
    const excluded = new Set([params.excludeProfileId]);
    if (!rule || rule.excludeActor) excluded.add(params.actorProfileId);
    const recipients = new Map<string, "owner" | "manager">();
    for (const id of ownerIds) if (!excluded.has(id)) recipients.set(id, "owner");
    for (const id of managerIds) if (!excluded.has(id) && !recipients.has(id)) recipients.set(id, "manager");
    const recipientIds = Array.from(recipients.keys());
    if (recipientIds.length === 0) return;
    const { data: profiles, error } = await admin.from("profiles")
      .select("id, email").in("id", recipientIds);
    if (error) {
      console.error(`[notifications] profiles: ${error.code ?? "unknown"}`);
      return;
    }
    const settingsByProfileId = await getUserNotificationPreferenceSettingsMap(recipientIds);
    await Promise.allSettled((profiles ?? []).filter((profile) => recipients.has(profile.id))
      .map((profile) => createNotificationWithDelivery({
      recipientProfileId: profile.id,
      recipientEmail: profile.email,
      recipientRole: recipients.get(profile.id),
      type: params.type,
      title: params.title,
      body: params.body,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      emailMode: params.emailMode ?? (rule?.email === false ? "never" : "default"),
      deliveryPreference: resolveNotificationDeliveryPreference(
        settingsByProfileId.get(profile.id) ?? createFallbackNotificationSettings(), params.type
      )
    })));
  } catch (error) {
    console.error(`[notifications] property_team: ${error instanceof Error ? error.name : "unknown"}`);
  }
}

export async function notifyOwnerOfStripeIssue(params: {
  propertyId: string;
  category: "owner_not_connected" | "transient" | "platform_misconfigured" | "unknown";
}): Promise<void> {
  if (params.category !== "owner_not_connected") {
    return;
  }

  await notifyPropertyTeam({
    propertyId: params.propertyId,
    type: "owner_message",
    title: "Bank connection issue",
    body: "We could not send a tenant payment to your bank. Please reconnect your bank in Settings.",
    entityType: "property",
    entityId: params.propertyId
  });
}

interface NotifyAccountMembersParams {
  accountId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId?: string | null;
  excludeProfileId?: string | null;
}

export async function notifyAccountMembers(params: NotifyAccountMembersParams) {
  try {
    const admin = createAdminClient();
    const { data: members, error: membersError } = await admin
      .from("ownership_account_members")
      .select("profile_id")
      .eq("account_id", params.accountId)
      .eq("active", true);

    if (membersError) {
      if (!isMissingSchemaError(membersError)) {
        console.error("notifyAccountMembers member query error:", membersError);
      }
      return;
    }

    const recipientIds = (members ?? [])
      .map((member) => member.profile_id)
      .filter((profileId) => profileId !== params.excludeProfileId);

    if (recipientIds.length === 0) {
      return;
    }

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, email, role")
      .in("id", recipientIds);

    if (profilesError) {
      if (!isMissingSchemaError(profilesError)) {
        console.error("notifyAccountMembers profile query error:", profilesError);
      }
      return;
    }

    const settingsByProfileId = await getUserNotificationPreferenceSettingsMap(
      recipientIds
    );

    await Promise.all(
      (profiles ?? []).map((profile) =>
        createNotificationWithDelivery({
          recipientProfileId: profile.id,
          recipientEmail: profile.email,
          recipientRole:
            profile.role === "owner" || profile.role === "manager" || profile.role === "tenant"
              ? profile.role
              : undefined,
          type: params.type,
          title: params.title,
          body: params.body,
          entityType: params.entityType,
          entityId: params.entityId ?? null,
          deliveryPreference: resolveNotificationDeliveryPreference(
            settingsByProfileId.get(profile.id) ??
              createFallbackNotificationSettings(),
            params.type
          )
        })
      )
    );
  } catch (error) {
    console.error("Failed to notify account members:", error);
  }
}

export async function notifyOwnerMembersOfAcceptedTenantInvite(profileId: string) {
  try {
    const admin = createAdminClient();
    const { data: invitations, error } = await admin
      .from("invitations")
      .select("id, property_id, email, full_name")
      .eq("role", "tenant")
      .eq("status", "accepted")
      .eq("invited_profile_id", profileId)
      .not("property_id", "is", null);
    if (error) {
      console.error(`[notifications] accepted_invites: ${error.code ?? "unknown"}`);
      return;
    }
    await Promise.allSettled((invitations ?? [])
      .filter((invitation) => Boolean(invitation.property_id))
      .map((invitation) => notifyPropertyTeam({
        propertyId: invitation.property_id as string,
        type: "invite_accepted",
        title: "Tenant invite accepted",
        body: `${invitation.full_name || invitation.email} accepted the invitation and can now access Domus.`,
        entityType: "invitation",
        entityId: invitation.id,
        actorProfileId: profileId
      })));
  } catch (error) {
    console.error(`[notifications] accepted_invites: ${error instanceof Error ? error.name : "unknown"}`);
  }
}
