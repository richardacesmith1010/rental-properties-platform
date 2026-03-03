import { getSupabaseClient } from "./supabase";
import { isMissingSchemaError } from "./tenant-data";
import type { MobileNotificationDTO } from "./types";

export async function fetchNotifications(userId: string): Promise<MobileNotificationDTO[]> {
  const supabase = getSupabaseClient();

  const result = await supabase
    .from("notifications")
    .select("id, type, title, body, read_at, created_at")
    .eq("recipient_profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (result.error) {
    if (isMissingSchemaError(result.error)) {
      return [];
    }

    throw result.error;
  }

  return (result.data ?? []).map((notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    readAt: notification.read_at,
    createdAt: notification.created_at,
  }));
}
