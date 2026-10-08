"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { resendFromJoinLinkSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { isJoinInviteActive, INACTIVE_INVITE_MESSAGE } from "@/lib/join-invite";
import { resendInvitationEmail } from "@/lib/invite-resend";
import { sideEffectError } from "@/lib/logger";
import type { ActionState } from "./shared";

const INVITE_COLUMNS =
  "id, email, full_name, role, status, created_at, property_id, invited_by, ownership_account_id, invited_profile_id";

export async function resendFromJoinLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Only the invite ID is accepted. Other submitted fields are never read.
  const parsed = resendFromJoinLinkSchema.safeParse({ inviteId: formData.get("inviteId") });
  if (!parsed.success) return { success: false, error: INACTIVE_INVITE_MESSAGE };

  const { inviteId } = parsed.data;
  try {
    // This limiter is in-memory per instance, so limits are best-effort across instances.
    if (!checkRateLimit(`join-resend:invite:${inviteId}`, 3, 60 * 60 * 1000).allowed) {
      return { success: false, error: "Too many emails. Try again in an hour." };
    }
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip")?.trim();
    if (ip && !checkRateLimit(`join-resend:ip:${ip}`, 10, 60 * 60 * 1000).allowed) {
      return { success: false, error: "Too many emails. Try again in an hour." };
    }
  } catch {
    return { success: false, error: "Could not send. Please try again." };
  }

  const admin = createAdminClient();
  const load = () => admin.from("invitations").select(INVITE_COLUMNS).eq("id", inviteId).maybeSingle();
  const { data: invitation, error: loadError } = await load();
  if (loadError || !invitation || !isJoinInviteActive(invitation)) {
    return { success: false, error: INACTIVE_INVITE_MESSAGE };
  }

  // A send already in flight may finish after a revoke.
  const { data: fresh, error: freshError } = await load();
  if (freshError || !fresh || !isJoinInviteActive(fresh)) {
    return { success: false, error: INACTIVE_INVITE_MESSAGE };
  }

  let delivery: Awaited<ReturnType<typeof resendInvitationEmail>>;
  try {
    delivery = await resendInvitationEmail(fresh, fresh.invited_by);
  } catch {
    return { success: false, error: "Could not send. Please try again." };
  }
  if (!delivery.ok) return { success: false, error: "Could not send. Please try again." };

  try {
    const { error: updateError } = await admin.from("invitations")
      .update({ created_at: new Date().toISOString(), invited_profile_id: delivery.invitedProfileId })
      .eq("id", inviteId);
    if (updateError) sideEffectError("resendFromJoinLink", "update_resend_timestamp", { entityType: "invitation" })(updateError);
  } catch (error) {
    sideEffectError("resendFromJoinLink", "update_resend_timestamp", { entityType: "invitation" })(error);
  }
  return { success: true, message: "Sent. Check your email in a few minutes." };
}
