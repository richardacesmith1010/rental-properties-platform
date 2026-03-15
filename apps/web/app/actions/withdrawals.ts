"use server";

import { revalidatePath } from "next/cache";
import { formatCurrency } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAccountMembers } from "@/lib/notifications";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import { createStripeTransfer } from "@/lib/stripe";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { resolveWithdrawal } from "@/lib/withdrawals";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const SCHEMA_ERROR_MESSAGE =
  "Withdrawal requests require a database update before they can be used.";

async function getActiveMemberCount(
  accountId: string
): Promise<{ count: number } | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ownership_account_members")
    .select("profile_id")
    .eq("account_id", accountId)
    .eq("active", true);

  if (error) {
    if (isMissingSchemaError(error)) {
      return { error: SCHEMA_ERROR_MESSAGE } as const;
    }
    console.error("getActiveMemberCount error:", error);
    return { error: "Unable to load account members right now." } as const;
  }

  return { count: (data ?? []).length } as const;
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

  const canAdmin = await canUserAdministerOwnershipAccount(user.id, accountId);
  if (!canAdmin) {
    return { success: false, error: "Access denied." };
  }

  const countResult = await getActiveMemberCount(accountId);
  if ("error" in countResult) {
    return { success: false, error: countResult.error };
  }

  const votesRequired = Math.ceil(Math.max(1, countResult.count) / 2);
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

  await notifyAccountMembers({
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
  });

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

    if (withdrawal.status !== "approved") {
      return { success: false, error: "Only approved withdrawals can be executed." };
    }

    const canAdmin = await canUserAdministerOwnershipAccount(user.id, withdrawal.ownership_account_id);
    if (!canAdmin) {
      return { success: false, error: "Access denied." };
    }

    const { data: ownershipAccount, error: accountError } = await admin
      .from("ownership_accounts")
      .select("display_name, stripe_account_id")
      .eq("id", withdrawal.ownership_account_id)
      .maybeSingle();

    if (accountError) {
      if (isMissingSchemaError(accountError)) {
        return { success: false, error: SCHEMA_ERROR_MESSAGE };
      }
      console.error("executeApprovedWithdrawal account error:", accountError);
      return { success: false, error: "Unable to load the LLC payout account." };
    }

    if (!ownershipAccount?.stripe_account_id) {
      return { success: false, error: "This LLC does not have a connected Stripe account." };
    }

    const { data: membership, error: membershipError } = await admin
      .from("ownership_account_members")
      .select("payout_stripe_account_id")
      .eq("account_id", withdrawal.ownership_account_id)
      .eq("profile_id", withdrawal.requested_by)
      .eq("active", true)
      .maybeSingle();

    if (membershipError) {
      if (isMissingSchemaError(membershipError)) {
        return { success: false, error: SCHEMA_ERROR_MESSAGE };
      }
      console.error("executeApprovedWithdrawal membership error:", membershipError);
      return { success: false, error: "Unable to load the recipient payout account." };
    }

    if (!membership?.payout_stripe_account_id) {
      return {
        success: false,
        error: "The requester must connect a payout account before this withdrawal can be executed."
      };
    }

    const transfer = await createStripeTransfer({
      amountCents: withdrawal.amount_cents,
      destination: membership.payout_stripe_account_id,
      transferGroup: `withdrawal:${withdrawal.id}`,
      description: `Withdrawal payout for ${ownershipAccount.display_name ?? "ownership account"}`
    });

    const { error: updateError } = await admin
      .from("withdrawal_requests")
      .update({
        status: "completed",
        resolved_at: new Date().toISOString()
      })
      .eq("id", withdrawalId);

    if (updateError) {
      if (isMissingSchemaError(updateError)) {
        return { success: false, error: SCHEMA_ERROR_MESSAGE };
      }
      console.error("executeApprovedWithdrawal update error:", updateError);
      return { success: false, error: "Payout sent, but the request status could not be updated." };
    }

    await notifyAccountMembers({
      accountId: withdrawal.ownership_account_id,
      type: "withdrawal_completed",
      title: "Withdrawal completed",
      body: `${formatCurrency(withdrawal.amount_cents)} was paid out to the approved member.`,
      entityType: "withdrawal_request",
      entityId: withdrawal.id
    });

    revalidatePath("/owner");
    return {
      success: true,
      message: `Payout executed (${transfer.id}).`
    };
  } catch (error) {
    console.error("executeApprovedWithdrawal error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? `Unable to execute the payout. (${error.message})`
          : "Unable to execute the payout."
    };
  }
}
