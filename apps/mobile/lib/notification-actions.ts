import { getSupabaseClient } from "./supabase";
import { isMissingSchemaError } from "./tenant-data";

interface MobileActionResult {
  success: boolean;
  error?: string;
}

export async function markNotificationRead(
  notificationId: string
): Promise<MobileActionResult> {
  const supabase = getSupabaseClient();

  const result = await supabase
    .from("notifications")
    .update({
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId);

  if (result.error) {
    if (isMissingSchemaError(result.error)) {
      return { success: false, error: "Notifications require a database update." };
    }

    return { success: false, error: result.error.message };
  }

  return { success: true };
}
