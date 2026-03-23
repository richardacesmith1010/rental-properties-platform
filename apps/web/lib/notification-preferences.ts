import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationType } from "@/lib/notifications";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface NotificationPreference {
  notificationType: NotificationType;
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

export interface NotificationPreferenceOption {
  type: NotificationType;
  label: string;
  description: string;
}

export const NOTIFICATION_PREFERENCE_OPTIONS: NotificationPreferenceOption[] = [
  {
    type: "new_ticket",
    label: "New maintenance ticket",
    description: "Alerts when a new maintenance request is created."
  },
  {
    type: "late_rent",
    label: "Late rent",
    description: "Late payment notices and autopay failures."
  },
  {
    type: "ticket_resolved",
    label: "Ticket resolved",
    description: "Updates when maintenance work is resolved."
  },
  {
    type: "payment_recorded",
    label: "Payment recorded",
    description: "Confirmation that a payment has been received."
  },
  {
    type: "lease_updated",
    label: "Lease updated",
    description: "Lease changes, renewals, and lifecycle updates."
  },
  {
    type: "document_sent",
    label: "Document sent",
    description: "A new document is ready for review or signature."
  },
  {
    type: "document_signed",
    label: "Document signed",
    description: "A document packet has been fully signed."
  },
  {
    type: "application_reviewed",
    label: "Application reviewed",
    description: "Rental application review outcomes."
  },
  {
    type: "rent_due_reminder",
    label: "Rent due reminder",
    description: "Heads-up reminders before rent is due."
  },
  {
    type: "invite_accepted",
    label: "Invite accepted",
    description: "Invitations accepted by tenants or collaborators."
  },
  {
    type: "achievement_unlocked",
    label: "Achievement unlocked",
    description: "Gamification milestones and achievements."
  },
  {
    type: "owner_message",
    label: "Messages",
    description: "Direct messages between owners, managers, and tenants."
  },
  {
    type: "lease_expiring_soon",
    label: "Lease expiring soon",
    description: "Warnings for leases approaching expiration."
  },
  {
    type: "lease_expired",
    label: "Lease expired",
    description: "Notices when a lease has expired."
  },
  {
    type: "delinquency_escalation",
    label: "Delinquency escalation",
    description: "30, 60, and 90 day past-due escalation notices."
  },
  {
    type: "distribution_change_requested",
    label: "Distribution change requested",
    description: "A member proposed a new LLC distribution configuration."
  },
  {
    type: "distribution_change_approved",
    label: "Distribution change approved",
    description: "A pending distribution update has been approved and applied."
  },
  {
    type: "distribution_change_rejected",
    label: "Distribution change rejected",
    description: "A pending distribution update has been rejected."
  },
  {
    type: "withdrawal_requested",
    label: "Withdrawal requested",
    description: "A member requested a withdrawal from an ownership account."
  },
  {
    type: "withdrawal_approved",
    label: "Withdrawal approved",
    description: "A pending withdrawal request has been approved."
  },
  {
    type: "withdrawal_rejected",
    label: "Withdrawal rejected",
    description: "A pending withdrawal request has been rejected."
  },
  {
    type: "withdrawal_completed",
    label: "Withdrawal completed",
    description: "A withdrawal request has been completed."
  }
];

export async function getUserNotificationPreferences(
  userId: string
): Promise<NotificationPreference[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("notification_preferences")
      .select("notification_type, email_enabled, in_app_enabled")
      .eq("profile_id", userId);

    if (error) {
      if (isMissingSchemaError(error)) {
        return NOTIFICATION_PREFERENCE_OPTIONS.map((option) => ({
          notificationType: option.type,
          emailEnabled: true,
          inAppEnabled: true
        }));
      }

      console.error("Failed to load notification preferences:", error);
      return NOTIFICATION_PREFERENCE_OPTIONS.map((option) => ({
        notificationType: option.type,
        emailEnabled: true,
        inAppEnabled: true
      }));
    }

    const storedByType = new Map(
      (data ?? []).map((row) => [
        row.notification_type as NotificationType,
        {
          emailEnabled: row.email_enabled !== false,
          inAppEnabled: row.in_app_enabled !== false
        }
      ])
    );

    return NOTIFICATION_PREFERENCE_OPTIONS.map((option) => ({
      notificationType: option.type,
      emailEnabled: storedByType.get(option.type)?.emailEnabled ?? true,
      inAppEnabled: storedByType.get(option.type)?.inAppEnabled ?? true
    }));
  } catch (error) {
    console.error("Failed to load notification preferences:", error);
    return NOTIFICATION_PREFERENCE_OPTIONS.map((option) => ({
      notificationType: option.type,
      emailEnabled: true,
      inAppEnabled: true
    }));
  }
}

export async function getNotificationPreference(
  userId: string,
  type: NotificationType
): Promise<NotificationPreference> {
  const preferences = await getUserNotificationPreferences(userId);
  return (
    preferences.find((preference) => preference.notificationType === type) ?? {
      notificationType: type,
      emailEnabled: true,
      inAppEnabled: true
    }
  );
}

export async function updateNotificationPreference(
  userId: string,
  type: NotificationType,
  emailEnabled: boolean,
  inAppEnabled: boolean
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("notification_preferences").upsert(
    {
      profile_id: userId,
      notification_type: type,
      email_enabled: emailEnabled,
      in_app_enabled: inAppEnabled,
      updated_at: new Date().toISOString()
    },
    { onConflict: "profile_id,notification_type" }
  );

  if (error) {
    throw error;
  }
}
