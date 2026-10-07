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

function createFallbackNotificationSettings(): NotificationPreferenceSettings {
  return {
    preferences: { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES },
    pausedUntil: null,
    schemaReady: false
  };
}


interface NotifyOwnerMembersParams {
  propertyId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId?: string | null;
  excludeProfileId?: string | null;
  actorProfileId?: string | null;
}

function shouldMirrorToInbox(type: NotificationType) {
  return type === "new_ticket" || type === "ticket_resolved" || type === "lease_updated";
}

export async function notifyOwnerMembersForProperty(params: NotifyOwnerMembersParams) {
  try {
    const admin = createAdminClient();

    if (shouldMirrorToInbox(params.type)) {
      await ensureInboxThreadForEvent({
        propertyId: params.propertyId,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        subject: params.title,
        messageBody: params.body,
        actorProfileId: params.actorProfileId ?? null
      });
    }

    const { data: property } = await admin
      .from("properties")
      .select("owner_account_id")
      .eq("id", params.propertyId)
      .single();

    if (!property?.owner_account_id) {
      return;
    }

    const { data: members } = await admin
      .from("ownership_account_members")
      .select("profile_id, can_receive_critical_alerts")
      .eq("account_id", property.owner_account_id)
      .eq("member_role", "owner")
      .eq("active", true);

    const recipientIds = (members ?? [])
      .filter((member) => member.can_receive_critical_alerts)
      .map((member) => member.profile_id)
      .filter((id) => id !== params.excludeProfileId);

    if (recipientIds.length === 0) {
      return;
    }

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, role")
      .in("id", recipientIds);

    const settingsByProfileId = await getUserNotificationPreferenceSettingsMap(
      recipientIds
    );

    for (const profile of profiles ?? []) {
      await createNotificationWithDelivery({
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
      });
    }
  } catch (error) {
    console.error("Failed to notify owner members:", error);
  }
}

export async function notifyOwnerOfStripeIssue(params: {
  propertyId: string;
  category: "owner_not_connected" | "transient" | "platform_misconfigured" | "unknown";
}): Promise<void> {
  if (params.category !== "owner_not_connected") {
    return;
  }

  await notifyOwnerMembersForProperty({
    propertyId: params.propertyId,
    type: "owner_message",
    title: "Bank connection issue",
    body: "We tried to send a tenant payment to your bank but it did not go through. Please reconnect your bank in Settings.",
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
    const { data: invitations } = await admin
      .from("invitations")
      .select("id, property_id, email, full_name")
      .eq("role", "tenant")
      .eq("status", "accepted")
      .eq("invited_profile_id", profileId)
      .not("property_id", "is", null);

    for (const invitation of invitations ?? []) {
      if (!invitation.property_id) {
        continue;
      }

      await notifyOwnerMembersForProperty({
        propertyId: invitation.property_id,
        type: "invite_accepted",
        title: "Tenant invite accepted",
        body: `${invitation.full_name || invitation.email} accepted the invitation and can now access Domus.`,
        entityType: "invitation",
        entityId: invitation.id,
        actorProfileId: profileId
      });
    }
  } catch (error) {
    console.error("Failed to notify owner members of accepted tenant invite:", error);
  }
}
