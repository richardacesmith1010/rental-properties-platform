"use server";

import { revalidatePath } from "next/cache";
import { formatCurrency } from "@/lib/format";
import { getActiveMembers } from "@/lib/ownership-members";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAccountMembers } from "@/lib/notifications";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { createStripeTransfer } from "@/lib/stripe";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { resolveWithdrawal } from "@/lib/withdrawals";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const SCHEMA_ERROR_MESSAGE =
  "Withdrawal requests require a database update before they can be used.";

function isSchemaConstraintError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  return (
    error.code === "23514" ||
    error.message?.toLowerCase().includes("check constraint") === true
  );
}

function isWithdrawalSchemaDriftError(error: { code?: string; message?: string } | null | undefined) {
  return isMissingSchemaError(error) || isSchemaConstraintError(error);
}

async function restoreWithdrawalStatus(
  admin: ReturnType<typeof createAdminClient>,
  withdrawalId: string,
  status: "approved" | "failed"
) {
  const { error } = await admin.from("withdrawal_requests").update({ status }).eq("id", withdrawalId);
  if (error && !isWithdrawalSchemaDriftError(error)) {
    console.error("restoreWithdrawalStatus error:", error);
  }
}

function parseAmountCents(formData: FormData) {
  const rawAmountCents = formData.get("amountCents");
  if (typeof rawAmountCents === "string" && rawAmountCents.trim().length > 0) {
    const parsed = Number.parseInt(rawAmountCents, 10);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  const rawAmountDollars = formData.get("amountDollars");
  if (typeof rawAmountDollars === "string" && rawAmountDollars.trim().length > 0) {
    const parsed = Number.parseFloat(rawAmountDollars);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
  }

  return Number.NaN;
}

export async function submitWithdrawalRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");

  if (!checkRateLimit(`submitWithdrawalRequest:${user.id}`, 10, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const accountId = formData.get("accountId");
  const amountCents = parseAmountCents(formData);
  const rawReason = formData.get("reason");
  const reason = typeof rawReason === "string" && rawReason.trim().length > 0 ? rawReason.trim() : null;

  if (typeof accountId !== "string" || accountId.length === 0) {
    return { success: false, error: "Missing account ID." };
  }

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { success: false, error: "Withdrawal amount must be greater than $0." };
  }

  const [canAdminSettled, memberResultSettled] = await Promise.allSettled([
    canUserAdministerOwnershipAccount(user.id, accountId),
    getActiveMembers(accountId)
  ]);

  if (canAdminSettled.status === "rejected") {
    console.error("submitWithdrawalRequest permission error:", canAdminSettled.reason);
    return { success: false, error: "Unable to verify account access right now." };
  }

  if (!canAdminSettled.value) {
    return { success: false, error: "Access denied." };
  }

  if (memberResultSettled.status === "rejected") {
    console.error("submitWithdrawalRequest members error:", memberResultSettled.reason);
    return { success: false, error: "Unable to load member data right now." };
  }

  const memberResult = memberResultSettled.value;
  if ("error" in memberResult) {
    return {
      success: false,
      error:
        memberResult.error === "This feature requires a database update. Please try again later."
          ? SCHEMA_ERROR_MESSAGE
          : memberResult.error
    };
  }

  const votesRequired = Math.ceil(Math.max(1, memberResult.members.length) / 2);
  const admin = createAdminClient();
  const { data: request, error: requestError } = await admin
    .from("withdrawal_requests")
    .insert({
      ownership_account_id: accountId,
      requested_by: user.id,
      amount_cents: amountCents,
      reason,
      status: "pending",
      votes_required: votesRequired,
      votes_received: 1
    })
    .select("id")
    .single();

  if (requestError) {
    if (isMissingSchemaError(requestError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("submitWithdrawalRequest insert error:", requestError);
    return { success: false, error: "Unable to create a withdrawal request." };
  }

  const { error: voteError } = await admin.from("withdrawal_votes").insert({
    request_id: request.id,
    voter_id: user.id,
    vote: "approve"
  });

  if (voteError) {
    if (isMissingSchemaError(voteError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("submitWithdrawalRequest vote insert error:", voteError);
    return { success: false, error: "Request created, but the initial vote could not be recorded." };
  }

  if (votesRequired === 1) {
    const resolved = await resolveWithdrawal(request.id);
    revalidatePath("/owner");
    if (resolved?.status === "approved") {
      return { success: true, message: "Withdrawal request approved immediately for this solo account." };
    }
    return { success: true, message: "Withdrawal request created." };
  }

  void notifyAccountMembers({
    accountId,
    type: "withdrawal_requested",
    title: "Withdrawal requested",
    body: `A member requested a ${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amountCents / 100)} withdrawal.`,
    entityType: "withdrawal_request",
    entityId: request.id,
    excludeProfileId: user.id
  }).catch(
    sideEffectError("submitWithdrawalRequest", "notify_account_members", {
      userId: user.id,
      entityType: "withdrawal_request",
      entityId: request.id
    })
  );

  revalidatePath("/owner");
  return { success: true, message: "Withdrawal request submitted for approval." };
}

export async function voteOnWithdrawal(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");

  if (!checkRateLimit(`voteOnWithdrawal:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const requestId = formData.get("requestId");
  const vote = formData.get("vote");

  if (typeof requestId !== "string" || requestId.length === 0) {
    return { success: false, error: "Missing request ID." };
  }

  if (vote !== "approve" && vote !== "reject") {
    return { success: false, error: "Invalid vote." };
  }

  const admin = createAdminClient();
  const { data: request, error: requestError } = await admin
    .from("withdrawal_requests")
    .select("id, ownership_account_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    if (isMissingSchemaError(requestError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("voteOnWithdrawal request error:", requestError);
    return { success: false, error: "Unable to load this request right now." };
  }

  if (!request) {
    return { success: false, error: "Withdrawal request not found." };
  }

  if (request.status !== "pending") {
    return { success: false, error: "This withdrawal request has already been resolved." };
  }

  const canAdmin = await canUserAdministerOwnershipAccount(user.id, request.ownership_account_id);
  if (!canAdmin) {
    return { success: false, error: "Access denied." };
  }

  const { error: voteError } = await admin.from("withdrawal_votes").insert({
    request_id: requestId,
    voter_id: user.id,
    vote
  });

  if (voteError) {
    if (isMissingSchemaError(voteError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    if (voteError.code === "23505") {
      return { success: false, error: "You have already voted on this withdrawal." };
    }
    console.error("voteOnWithdrawal insert error:", voteError);
    return { success: false, error: "Unable to record your vote right now." };
  }

  const { data: votes, error: votesError } = await admin
    .from("withdrawal_votes")
    .select("id")
    .eq("request_id", requestId);

  if (votesError) {
    if (isMissingSchemaError(votesError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("voteOnWithdrawal count error:", votesError);
    return { success: false, error: "Your vote was recorded, but the request tally could not be updated." };
  }

  const { error: updateError } = await admin
    .from("withdrawal_requests")
    .update({ votes_received: votes?.length ?? 0 })
    .eq("id", requestId);

  if (updateError) {
    if (isMissingSchemaError(updateError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("voteOnWithdrawal update error:", updateError);
    return { success: false, error: "Your vote was recorded, but the request tally could not be updated." };
  }

  const resolved = await resolveWithdrawal(requestId);
  revalidatePath("/owner");

  if (resolved?.status === "approved") {
    return { success: true, message: "Vote recorded. The withdrawal is now approved." };
  }
  if (resolved?.status === "rejected") {
    return { success: true, message: "Vote recorded. The withdrawal has been rejected." };
  }

  return { success: true, message: "Vote recorded." };
}

export async function executeApprovedWithdrawal(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireAuth("owner");

    if (!checkRateLimit(`executeWithdrawal:${user.id}`, 5, 60_000).allowed) {
      return { success: false, error: "Too many requests." };
    }

    const withdrawalId = formData.get("withdrawalId");
    if (typeof withdrawalId !== "string" || withdrawalId.trim().length === 0) {
      return { success: false, error: "Missing withdrawal ID." };
    }

    const admin = createAdminClient();
    const { data: withdrawal, error: fetchError } = await admin
      .from("withdrawal_requests")
      .select("id, ownership_account_id, requested_by, amount_cents, status")
      .eq("id", withdrawalId)
      .maybeSingle();

    if (fetchError) {
      if (isMissingSchemaError(fetchError)) {
        return { success: false, error: SCHEMA_ERROR_MESSAGE };
      }
      console.error("executeApprovedWithdrawal fetch error:", fetchError);
      return { success: false, error: "Unable to load this withdrawal request." };
    }

    if (!withdrawal) {
      return { success: false, error: "Withdrawal request not found." };
    }

    if (withdrawal.status !== "approved" && withdrawal.status !== "failed") {
      return { success: false, error: "Only approved or failed withdrawals can be executed." };
    }

    const previousStatus = withdrawal.status as "approved" | "failed";
    const { data: claimed, error: claimError } = await admin
      .from("withdrawal_requests")
      .update({ status: "executing" })
      .eq("id", withdrawalId)
      .in("status", ["approved", "failed"])
      .select("id")
      .maybeSingle();

    if (claimError) {
      if (isWithdrawalSchemaDriftError(claimError)) {
        return { success: false, error: SCHEMA_ERROR_MESSAGE };
      }
      console.error("executeApprovedWithdrawal claim error:", claimError);
      return { success: false, error: "Unable to process this withdrawal." };
    }

    if (!claimed) {
      return {
        success: false,
        error: "This withdrawal is already being processed by another admin."
      };
    }

    const [canAdminSettled, accountSettled, membershipSettled] = await Promise.allSettled([
      canUserAdministerOwnershipAccount(user.id, withdrawal.ownership_account_id),
      admin
        .from("ownership_accounts")
        .select("display_name, stripe_account_id")
        .eq("id", withdrawal.ownership_account_id)
        .maybeSingle(),
      admin
        .from("ownership_account_members")
        .select("payout_stripe_account_id")
        .eq("account_id", withdrawal.ownership_account_id)
        .eq("profile_id", withdrawal.requested_by)
        .eq("active", true)
        .maybeSingle()
    ]);

    if (
      canAdminSettled.status === "rejected" ||
      accountSettled.status === "rejected" ||
      membershipSettled.status === "rejected"
    ) {
      await restoreWithdrawalStatus(admin, withdrawalId, previousStatus);

      if (canAdminSettled.status === "rejected") {
        console.error("executeApprovedWithdrawal permission error:", canAdminSettled.reason);
      }
      if (accountSettled.status === "rejected") {
        console.error("executeApprovedWithdrawal account query rejection:", accountSettled.reason);
      }
      if (membershipSettled.status === "rejected") {
        console.error(
          "executeApprovedWithdrawal membership query rejection:",
          membershipSettled.reason
        );
      }

      return { success: false, error: "Unable to load withdrawal execution details right now." };
    }

    const canAdmin = canAdminSettled.value;
    const accountResult = accountSettled.value;
    const membershipResult = membershipSettled.value;

    if (!canAdmin) {
      await restoreWithdrawalStatus(admin, withdrawalId, previousStatus);
      return { success: false, error: "Access denied." };
    }

    if (accountResult.error) {
      await restoreWithdrawalStatus(admin, withdrawalId, previousStatus);
      if (isWithdrawalSchemaDriftError(accountResult.error)) {
        return { success: false, error: SCHEMA_ERROR_MESSAGE };
      }
      console.error("executeApprovedWithdrawal account error:", accountResult.error);
      return { success: false, error: "Unable to load the LLC payout account." };
    }

    if (membershipResult.error) {
      await restoreWithdrawalStatus(admin, withdrawalId, previousStatus);
      if (isWithdrawalSchemaDriftError(membershipResult.error)) {
        return { success: false, error: SCHEMA_ERROR_MESSAGE };
      }
      console.error("executeApprovedWithdrawal membership error:", membershipResult.error);
      return { success: false, error: "Unable to load the recipient payout account." };
    }

    const ownershipAccount = accountResult.data;
    const membership = membershipResult.data;

    if (!ownershipAccount?.stripe_account_id) {
      await restoreWithdrawalStatus(admin, withdrawalId, previousStatus);
      return { success: false, error: "This LLC does not have a connected Stripe account." };
    }

    if (!membership?.payout_stripe_account_id) {
      await restoreWithdrawalStatus(admin, withdrawalId, previousStatus);
      return {
        success: false,
        error: "The requester must connect a payout account first."
      };
    }

    try {
      const transfer = await createStripeTransfer({
        amountCents: withdrawal.amount_cents,
        destination: membership.payout_stripe_account_id,
        transferGroup: `withdrawal:${withdrawal.id}`,
        description: `Withdrawal payout for ${ownershipAccount.display_name ?? "ownership account"}`,
        idempotencyKey: `withdrawal:${withdrawalId}`
      });

      let completeError:
        | { code?: string; message?: string }
        | null = null;
      ({ error: completeError } = await admin
        .from("withdrawal_requests")
        .update({
          status: "completed",
          stripe_transfer_id: transfer.id,
          resolved_at: new Date().toISOString()
        })
        .eq("id", withdrawalId));

      if (completeError && isMissingSchemaError(completeError)) {
        ({ error: completeError } = await admin
          .from("withdrawal_requests")
          .update({
            status: "completed",
            resolved_at: new Date().toISOString()
          })
          .eq("id", withdrawalId));
      }

      if (completeError) {
        if (isWithdrawalSchemaDriftError(completeError)) {
          return { success: false, error: SCHEMA_ERROR_MESSAGE };
        }
        console.error("executeApprovedWithdrawal complete error:", completeError);
        return { success: false, error: "Payout sent, but status could not be updated." };
      }

      void notifyAccountMembers({
        accountId: withdrawal.ownership_account_id,
        type: "withdrawal_completed",
        title: "Withdrawal completed",
        body: `${formatCurrency(withdrawal.amount_cents)} was paid out to the approved member.`,
        entityType: "withdrawal_request",
        entityId: withdrawal.id
      }).catch(
        sideEffectError("executeApprovedWithdrawal", "notify_account_members", {
          userId: user.id,
          entityType: "withdrawal_request",
          entityId: withdrawal.id
        })
      );

      revalidatePath("/owner");
      return { success: true, message: `Payout executed (${transfer.id}).` };
    } catch (stripeError) {
      const { error: failedError } = await admin
        .from("withdrawal_requests")
        .update({ status: "failed" })
        .eq("id", withdrawalId);

      if (failedError && !isWithdrawalSchemaDriftError(failedError)) {
        console.error("executeApprovedWithdrawal failed status error:", failedError);
      }

      console.error("executeApprovedWithdrawal stripe error:", stripeError);
      return {
        success: false,
        error:
          stripeError instanceof Error
            ? `Transfer failed: ${stripeError.message}. The withdrawal has been marked as failed.`
            : "Transfer failed. The withdrawal has been marked as failed for review."
      };
    }
  } catch (error) {
    console.error("executeApprovedWithdrawal error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to execute the payout."
    };
  }
}
