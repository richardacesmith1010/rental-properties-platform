"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendLLCInvitationEmail } from "@/lib/llc-invitation-email";
import {
  canUserManageLLCInvitations,
  getExistingProfileByEmail,
  normalizeInvitationEmail,
  parseInvitationEmails
} from "@/lib/llc-invitations";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  cancelLlcInvitationSchema,
  createLlcInvitationAccountSchema,
  parseFormData,
  resendLlcInvitationSchema,
  sendLlcInvitationsSchema,
  signInToLlcInvitationSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import {
  buildInvitationResultMessage,
  buildInviteUrl,
  buildJoinRedirect,
  finalizeInvitationAcceptance,
  getNickname,
  LLC_INVITATIONS_SCHEMA_ERROR,
  loadInviteManagementContext,
  resolveInvitationForAcceptance,
  revalidateLlcSurfaces
} from "./llc-invitations-support";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

export async function sendLLCInvitations(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");

  if (!checkRateLimit(`sendLLCInvitations:${user.id}`, 10, 60 * 60 * 1000).allowed) {
    return { success: false, error: "Too many invitation requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(sendLlcInvitationsSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { accountId, emails } = parsed.data;
  if (!(await canUserManageLLCInvitations(user.id, accountId))) {
    return { success: false, error: "You do not have permission to invite LLC members." };
  }

  const parsedEmails = parseInvitationEmails(emails);
  if (parsedEmails.invalidEmails.length > 0 || parsedEmails.emails.length === 0) {
    return { success: false, error: "Enter valid email addresses separated by commas or new lines." };
  }

  const context = await loadInviteManagementContext(accountId, user.id);
  if ("error" in context) {
    return {
      success: false,
      error: context.error ?? "Unable to load this LLC account right now."
    };
  }

  const admin = createAdminClient();
  const normalizedEmails = parsedEmails.emails.map(normalizeInvitationEmail);
  const { data: matchingProfiles, error: profileError } = await admin
    .from("profiles")
    .select("id, email")
    .in("email", normalizedEmails);

  if (profileError && isMissingSchemaError(profileError)) {
    return { success: false, error: LLC_INVITATIONS_SCHEMA_ERROR };
  }

  if (profileError) {
    console.error("sendLLCInvitations profile lookup error:", profileError);
    return { success: false, error: "Unable to check existing members right now." };
  }

  const profileByEmail = new Map(
    (matchingProfiles ?? []).map((profile) => [normalizeInvitationEmail(profile.email), profile.id])
  );
  const matchingProfileIds = Array.from(new Set(profileByEmail.values()));

  const [{ data: existingMembers, error: memberError }, { data: existingInvites, error: inviteError }] =
    await Promise.all([
      matchingProfileIds.length > 0
        ? admin
            .from("ownership_account_members")
            .select("profile_id")
            .eq("account_id", accountId)
            .eq("active", true)
            .in("profile_id", matchingProfileIds)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("llc_invitations")
        .select("email")
        .eq("ownership_account_id", accountId)
        .eq("status", "pending")
        .in("email", normalizedEmails)
    ]);

  if ((memberError && isMissingSchemaError(memberError)) || (inviteError && isMissingSchemaError(inviteError))) {
    return { success: false, error: LLC_INVITATIONS_SCHEMA_ERROR };
  }

  if (memberError) {
    console.error("sendLLCInvitations member lookup error:", memberError);
    return { success: false, error: "Unable to verify current LLC members right now." };
  }

  if (inviteError) {
    console.error("sendLLCInvitations pending invite lookup error:", inviteError);
    return { success: false, error: "Unable to verify pending LLC invitations right now." };
  }

  const memberIds = new Set((existingMembers ?? []).map((member) => member.profile_id));
  const pendingInviteEmails = new Set(
    (existingInvites ?? []).map((invite) => normalizeInvitationEmail(invite.email))
  );

  const skipped: string[] = [];
  const emailsToSend = normalizedEmails.filter((email) => {
    const profileId = profileByEmail.get(email);
    if (profileId && memberIds.has(profileId)) {
      skipped.push(`${email} is already a member.`);
      return false;
    }
    if (pendingInviteEmails.has(email)) {
      skipped.push(`${email} already has a pending invitation.`);
      return false;
    }
    return true;
  });

  if (emailsToSend.length === 0) {
    return {
      success: true,
      message: buildInvitationResultMessage({ sent: 0, skipped, failed: [] })
    };
  }

  const { data: insertedInvitations, error: insertError } = await admin
    .from("llc_invitations")
    .insert(
      emailsToSend.map((email) => ({
        ownership_account_id: accountId,
        invited_by: user.id,
        email,
        status: "pending"
      }))
    )
    .select("id, email, token");

  if (insertError) {
    if (isMissingSchemaError(insertError)) {
      return { success: false, error: LLC_INVITATIONS_SCHEMA_ERROR };
    }
    if (insertError.code === "23505") {
      return {
        success: false,
        error: "One or more of those emails already has a pending invitation for this LLC."
      };
    }
    console.error("sendLLCInvitations insert error:", insertError);
    return { success: false, error: "Unable to create LLC invitations right now." };
  }

  const results = await Promise.all(
    (insertedInvitations ?? []).map(async (invitation) => {
      const delivered = await sendLLCInvitationEmail({
        email: invitation.email,
        llcName: context.account.display_name,
        inviterName: context.inviterName,
        acceptUrl: buildInviteUrl(invitation.token)
      });

      return { id: invitation.id, email: invitation.email, delivered };
    })
  );

  const failed = results.filter((result) => !result.delivered);
  if (failed.length > 0) {
    const { error: cancelError } = await admin
      .from("llc_invitations")
      .update({ status: "cancelled" })
      .in("id", failed.map((result) => result.id));

    if (cancelError && !isMissingSchemaError(cancelError)) {
      console.error("sendLLCInvitations cancel failed invite error:", cancelError);
    }
  }

  revalidateLlcSurfaces();
  return {
    success: true,
    message: buildInvitationResultMessage({
      sent: results.length - failed.length,
      skipped,
      failed: failed.map((result) => result.email)
    })
  };
}

export async function resendLLCInvitation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");

  if (!checkRateLimit(`resendLLCInvitation:${user.id}`, 20, 60 * 60 * 1000).allowed) {
    return { success: false, error: "Too many resend attempts. Please try again later." };
  }

  const parsed = parseFormData(resendLlcInvitationSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();
  const { data: invitation, error } = await admin
    .from("llc_invitations")
    .select("id, ownership_account_id, email, token, status")
    .eq("id", parsed.data.invitationId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error)) {
      return { success: false, error: LLC_INVITATIONS_SCHEMA_ERROR };
    }
    console.error("resendLLCInvitation lookup error:", error);
    return { success: false, error: "Unable to load that invitation right now." };
  }

  if (!invitation) {
    return { success: false, error: "Invitation not found." };
  }

  if (!(await canUserManageLLCInvitations(user.id, invitation.ownership_account_id))) {
    return { success: false, error: "You do not have permission to manage that invitation." };
  }

  if (invitation.status !== "pending") {
    return { success: false, error: "Only pending invitations can be resent." };
  }

  const context = await loadInviteManagementContext(invitation.ownership_account_id, user.id);
  if ("error" in context) {
    return {
      success: false,
      error: context.error ?? "Unable to load this LLC account right now."
    };
  }

  const delivered = await sendLLCInvitationEmail({
    email: invitation.email,
    llcName: context.account.display_name,
    inviterName: context.inviterName,
    acceptUrl: buildInviteUrl(invitation.token)
  });

  if (!delivered) {
    return { success: false, error: "Unable to resend the invitation email right now." };
  }

  const { error: updateError } = await admin
    .from("llc_invitations")
    .update({ created_at: new Date().toISOString() })
    .eq("id", invitation.id);

  if (updateError) {
    if (isMissingSchemaError(updateError)) {
      return { success: false, error: LLC_INVITATIONS_SCHEMA_ERROR };
    }
    console.error("resendLLCInvitation update error:", updateError);
    return { success: false, error: "Invitation emailed, but its expiry could not be reset." };
  }

  revalidateLlcSurfaces();
  return { success: true, message: `Invitation resent to ${invitation.email}.` };
}

export async function cancelLLCInvitation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");

  if (!checkRateLimit(`cancelLLCInvitation:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many cancellation attempts. Please try again later." };
  }

  const parsed = parseFormData(cancelLlcInvitationSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();
  const { data: invitation, error } = await admin
    .from("llc_invitations")
    .select("id, ownership_account_id, email, status")
    .eq("id", parsed.data.invitationId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error)) {
      return { success: false, error: LLC_INVITATIONS_SCHEMA_ERROR };
    }
    console.error("cancelLLCInvitation lookup error:", error);
    return { success: false, error: "Unable to load that invitation right now." };
  }

  if (!invitation) {
    return { success: false, error: "Invitation not found." };
  }

  if (!(await canUserManageLLCInvitations(user.id, invitation.ownership_account_id))) {
    return { success: false, error: "You do not have permission to manage that invitation." };
  }

  if (invitation.status !== "pending") {
    return { success: false, error: "Only pending invitations can be cancelled." };
  }

  const { error: updateError } = await admin
    .from("llc_invitations")
    .update({ status: "cancelled" })
    .eq("id", invitation.id);

  if (updateError) {
    if (isMissingSchemaError(updateError)) {
      return { success: false, error: LLC_INVITATIONS_SCHEMA_ERROR };
    }
    console.error("cancelLLCInvitation update error:", updateError);
    return { success: false, error: "Unable to cancel that invitation right now." };
  }

  revalidateLlcSurfaces();
  return { success: true, message: `Invitation cancelled for ${invitation.email}.` };
}

export async function acceptLLCInvitation(token: string): Promise<ActionState> {
  const inviteResult = await resolveInvitationForAcceptance(token);
  if ("error" in inviteResult) {
    return {
      success: false,
      error: inviteResult.error ?? "This invitation is no longer active."
    };
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id || !user.email) {
    return { success: false, error: "Sign in to accept this invitation." };
  }

  const result = await finalizeInvitationAcceptance({
    token,
    profileId: user.id,
    email: user.email,
    fullName: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    nickname: typeof user.user_metadata?.nickname === "string" ? user.user_metadata.nickname : null
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  revalidateLlcSurfaces();
  return { success: true, accountId: result.accountId };
}

export async function signInToJoinLLC(formData: FormData) {
  const parsed = parseFormData(signInToLlcInvitationSchema, formData);
  if (!parsed.success) {
    redirect(buildJoinRedirect(String(formData.get("token") ?? ""), "signin", parsed.error));
  }

  const { token, email, password } = parsed.data;
  if (!checkRateLimit(`signInToJoinLLC:${normalizeInvitationEmail(email)}`, 20, 60_000).allowed) {
    redirect(buildJoinRedirect(token, "signin", "Too many attempts. Please try again later."));
  }

  const inviteResult = await resolveInvitationForAcceptance(token);
  if ("error" in inviteResult) {
    redirect(
      buildJoinRedirect(
        token,
        "signin",
        inviteResult.error ?? "This invitation is no longer active."
      )
    );
  }

  const supabase = createClient();
  const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !data.user?.id || !data.user.email) {
    redirect(buildJoinRedirect(token, "signin", "Incorrect email or password."));
  }

  const accepted = await finalizeInvitationAcceptance({
    token,
    profileId: data.user.id,
    email: data.user.email,
    fullName: typeof data.user.user_metadata?.full_name === "string" ? data.user.user_metadata.full_name : null,
    nickname: typeof data.user.user_metadata?.nickname === "string" ? data.user.user_metadata.nickname : null
  });

  if (!accepted.success) {
    redirect(buildJoinRedirect(token, "signin", accepted.error));
  }

  revalidateLlcSurfaces();
  redirect(`/owner?account=${encodeURIComponent(accepted.accountId)}`);
}

export async function createAccountToJoinLLC(formData: FormData) {
  const parsed = parseFormData(createLlcInvitationAccountSchema, formData);
  if (!parsed.success) {
    redirect(buildJoinRedirect(String(formData.get("token") ?? ""), "signup", parsed.error));
  }

  const { token, firstName, lastName, password } = parsed.data;
  const inviteResult = await resolveInvitationForAcceptance(token);
  if ("error" in inviteResult) {
    redirect(
      buildJoinRedirect(
        token,
        "signup",
        inviteResult.error ?? "This invitation is no longer active."
      )
    );
  }

  const email = inviteResult.invitation.email;
  if (!checkRateLimit(`createAccountToJoinLLC:${normalizeInvitationEmail(email)}`, 10, 60 * 60 * 1000).allowed) {
    redirect(buildJoinRedirect(token, "signup", "Too many attempts. Please try again later."));
  }

  const existingProfile = await getExistingProfileByEmail(email);
  if (existingProfile) {
    redirect(buildJoinRedirect(token, "signin", "An account already exists for this email. Sign in to continue."));
  }

  const admin = createAdminClient();
  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "owner",
      full_name: `${firstName} ${lastName}`.trim(),
      nickname: getNickname(firstName)
    }
  });

  if (createUserError || !createdUser.user?.id) {
    console.error("createAccountToJoinLLC auth error:", createUserError);
    const errorMessage = createUserError?.message?.toLowerCase().includes("already")
      ? "An account already exists for this email. Sign in to continue."
      : "Unable to create your account right now.";
    redirect(buildJoinRedirect(token, createUserError?.message?.toLowerCase().includes("already") ? "signin" : "signup", errorMessage));
  }

  const accepted = await finalizeInvitationAcceptance({
    token,
    profileId: createdUser.user.id,
    email,
    fullName: `${firstName} ${lastName}`.trim(),
    nickname: getNickname(firstName)
  });

  if (!accepted.success) {
    redirect(buildJoinRedirect(token, "signup", accepted.error));
  }

  const supabase = createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error("createAccountToJoinLLC sign in error:", signInError);
    redirect(buildJoinRedirect(token, "signin", "Account created. Sign in to continue."));
  }

  revalidateLlcSurfaces();
  redirect(`/owner?account=${encodeURIComponent(accepted.accountId)}`);
}
