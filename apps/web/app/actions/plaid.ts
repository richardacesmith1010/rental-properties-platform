"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  createLinkToken,
  exchangePublicToken,
  getAccounts,
  getBalances
} from "@/lib/plaid";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const SCHEMA_ERROR_MESSAGE =
  "Bank balance visibility requires a database update before it can be used.";

function getAccountId(formData: FormData): string | null {
  const value = formData.get("accountId");
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function handlePlaidError(error: unknown, fallback: string): ActionState {
  console.error("Plaid action error:", error);
  return {
    success: false,
    error: error instanceof Error ? `${fallback} (${error.message})` : fallback
  };
}

export async function initiatePlaidLink(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireAuth("owner");

    if (!checkRateLimit(`plaidLink:${user.id}`, 10, 60_000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }

    const accountId = getAccountId(formData);
    if (!accountId) {
      return { success: false, error: "Missing account ID." };
    }

    const canAdmin = await canUserAdministerOwnershipAccount(user.id, accountId);
    if (!canAdmin) {
      return { success: false, error: "Access denied." };
    }

    const { linkToken } = await createLinkToken(user.id);
    return { success: true, message: linkToken };
  } catch (error) {
    return handlePlaidError(error, "Unable to start bank linking right now.");
  }
}

export async function completePlaidLink(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireAuth("owner");

    if (!checkRateLimit(`completePlaidLink:${user.id}`, 10, 60_000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }

    const accountId = getAccountId(formData);
    const publicToken = formData.get("publicToken");
    const rawPlaidAccountId = formData.get("plaidAccountId");
    const rawBankName = formData.get("bankName");
    const rawBankMask = formData.get("bankMask");

    if (!accountId) {
      return { success: false, error: "Missing account ID." };
    }
    if (typeof publicToken !== "string" || publicToken.trim().length === 0) {
      return { success: false, error: "Missing Plaid public token." };
    }

    const canAdmin = await canUserAdministerOwnershipAccount(user.id, accountId);
    if (!canAdmin) {
      return { success: false, error: "Access denied." };
    }

    const { accessToken, itemId } = await exchangePublicToken(publicToken.trim());
    const accounts = await getAccounts(accessToken);
    const selectedAccount = accounts.find((account) => account.accountId === rawPlaidAccountId) ?? accounts[0];

    if (!selectedAccount) {
      return { success: false, error: "Plaid did not return a bank account to connect." };
    }

    const { currentCents } = await getBalances(accessToken, selectedAccount.accountId);
    const admin = createAdminClient();
    const { error } = await admin
      .from("ownership_accounts")
      .update({
        plaid_access_token: accessToken,
        plaid_item_id: itemId,
        plaid_account_id: selectedAccount.accountId,
        plaid_bank_name:
          typeof rawBankName === "string" && rawBankName.trim().length > 0
            ? rawBankName.trim()
            : selectedAccount.name,
        plaid_bank_mask:
          typeof rawBankMask === "string" && rawBankMask.trim().length > 0
            ? rawBankMask.trim()
            : selectedAccount.mask,
        plaid_balance_cents: currentCents,
        plaid_balance_updated_at: new Date().toISOString()
      })
      .eq("id", accountId);

    if (error) {
      if (isMissingSchemaError(error)) {
        return { success: false, error: SCHEMA_ERROR_MESSAGE };
      }
      console.error("completePlaidLink update error:", error);
      return { success: false, error: "Unable to save the connected bank account." };
    }

    revalidatePath("/owner");
    return { success: true, message: "Bank account connected." };
  } catch (error) {
    return handlePlaidError(error, "Unable to complete bank linking right now.");
  }
}

export async function refreshPlaidBalance(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireAuth("owner");
    const accountId = getAccountId(formData);

    if (!accountId) {
      return { success: false, error: "Missing account ID." };
    }
    if (!checkRateLimit(`plaidRefresh:${accountId}`, 5, 60_000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }

    const canAdmin = await canUserAdministerOwnershipAccount(user.id, accountId);
    if (!canAdmin) {
      return { success: false, error: "Access denied." };
    }

    const admin = createAdminClient();
    const { data: account, error: accountError } = await admin
      .from("ownership_accounts")
      .select("plaid_access_token, plaid_account_id")
      .eq("id", accountId)
      .maybeSingle();

    if (accountError) {
      if (isMissingSchemaError(accountError)) {
        return { success: false, error: SCHEMA_ERROR_MESSAGE };
      }
      console.error("refreshPlaidBalance select error:", accountError);
      return { success: false, error: "Unable to load the connected bank account." };
    }

    if (!account?.plaid_access_token || !account.plaid_account_id) {
      return { success: false, error: "Bank not connected." };
    }

    const { currentCents } = await getBalances(account.plaid_access_token, account.plaid_account_id);
    const { error: updateError } = await admin
      .from("ownership_accounts")
      .update({
        plaid_balance_cents: currentCents,
        plaid_balance_updated_at: new Date().toISOString()
      })
      .eq("id", accountId);

    if (updateError) {
      if (isMissingSchemaError(updateError)) {
        return { success: false, error: SCHEMA_ERROR_MESSAGE };
      }
      console.error("refreshPlaidBalance update error:", updateError);
      return { success: false, error: "Unable to refresh the bank balance." };
    }

    revalidatePath("/owner");
    return { success: true, message: "Balance refreshed." };
  } catch (error) {
    return handlePlaidError(error, "Unable to refresh the bank balance right now.");
  }
}

export async function disconnectPlaid(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireAuth("owner");
    const accountId = getAccountId(formData);
    const confirmation = formData.get("confirmation");

    if (!accountId) {
      return { success: false, error: "Missing account ID." };
    }
    if (!checkRateLimit(`disconnectPlaid:${user.id}`, 5, 60_000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }
    if (confirmation !== "DISCONNECT") {
      return { success: false, error: 'Type "DISCONNECT" to confirm.' };
    }

    const canAdmin = await canUserAdministerOwnershipAccount(user.id, accountId);
    if (!canAdmin) {
      return { success: false, error: "Access denied." };
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("ownership_accounts")
      .update({
        plaid_access_token: null,
        plaid_item_id: null,
        plaid_account_id: null,
        plaid_bank_name: null,
        plaid_bank_mask: null,
        plaid_balance_cents: null,
        plaid_balance_updated_at: null
      })
      .eq("id", accountId);

    if (error) {
      if (isMissingSchemaError(error)) {
        return { success: false, error: SCHEMA_ERROR_MESSAGE };
      }
      console.error("disconnectPlaid update error:", error);
      return { success: false, error: "Unable to disconnect the linked bank account." };
    }

    revalidatePath("/owner");
    return { success: true, message: "Bank account disconnected." };
  } catch (error) {
    return handlePlaidError(error, "Unable to disconnect the bank account right now.");
  }
}
