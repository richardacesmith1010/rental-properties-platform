"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuthForExit } from "@/app/actions/auth-helpers";
import type { ActionState } from "@/app/actions/shared";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

function logFailure(tag: string, error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  console.error(tag, {
    code: value?.code ?? null,
    message: value?.message ?? String(error)
  });
}

export async function requestAccountDeletion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, role, supabase } = await requireAuthForExit("owner", "manager", "tenant");
  if (!checkRateLimit(`requestAccountDeletion:${user.id}`, 3, 10 * 60 * 1000).allowed) {
    return { success: false, error: "Too many tries. Please wait 10 minutes." };
  }
  if (formData.get("confirmation") !== "DELETE") {
    return { success: false, error: "Type DELETE to confirm." };
  }

  const admin = createAdminClient();
  const { data: inserted, error } = await admin.from("account_deletion_requests").insert({
    profile_id: user.id,
    email_at_request: user.email ?? null,
    role_at_request: role
  }).select("id").single();
  const duplicateOpen = error?.code === "23505" &&
    error.message.includes("account_deletion_requests_one_open");
  if (error && !duplicateOpen) {
    logFailure("[account-deletion] insert failed", error);
    return { success: false, error: "We could not send your request. Please try again." };
  }
  if (!duplicateOpen && !inserted) {
    logFailure("[account-deletion] insert failed", new Error("Missing request id."));
    return { success: false, error: "We could not send your request. Please try again." };
  }

  if (!duplicateOpen && inserted) {
    try {
      const { error: feedbackError } = await admin.from("feedback").insert({
        type: "other",
        message: `Account deletion requested (${role}).`,
        email: user.email ?? null,
        profile_id: user.id,
        page_url: "/settings",
        user_role: role,
        status: "new"
      });
      if (feedbackError) logFailure("[account-deletion] feedback failed", feedbackError);
    } catch (feedbackError) {
      logFailure("[account-deletion] feedback failed", feedbackError);
    }
    try {
      await logAudit({
        userId: user.id,
        action: "request_account_deletion",
        entityType: "account_deletion_request",
        entityId: inserted.id,
        metadata: { role }
      });
    } catch (auditError) {
      logFailure("[account-deletion] audit failed", auditError);
    }
  }

  let signedOut = false;
  try {
    const { error: globalError } = await supabase.auth.signOut({ scope: "global" });
    if (globalError) logFailure("[account-deletion] global sign-out failed", globalError);
    else signedOut = true;
  } catch (globalError) {
    logFailure("[account-deletion] global sign-out failed", globalError);
  }
  if (!signedOut) {
    try {
      const { error: localError } = await supabase.auth.signOut({ scope: "local" });
      if (localError) logFailure("[account-deletion] local sign-out failed", localError);
      else signedOut = true;
    } catch (localError) {
      logFailure("[account-deletion] local sign-out failed", localError);
    }
  }
  if (!signedOut) {
    try {
      const store = await cookies();
      for (const { name } of store.getAll()) {
        if (/^sb-.+-auth-token(\.\d+)?$/.test(name)) store.delete(name);
      }
    } catch (cookieError) {
      logFailure("[account-deletion] cookie clear failed", cookieError);
    }
  }

  redirect("/login?deleted=requested");
}
