import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";

const SCHEMA_ERROR_MESSAGE = "This feature requires a database update. Please try again later.";

export async function getActiveMembers(
  accountId: string
): Promise<{ members: { profileId: string }[] } | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ownership_account_members")
    .select("profile_id")
    .eq("account_id", accountId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingSchemaError(error)) {
      return { error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("getActiveMembers error:", error);
    return { error: "Unable to load account members." };
  }

  return {
    members: (data ?? []).map((row) => ({ profileId: row.profile_id }))
  };
}
