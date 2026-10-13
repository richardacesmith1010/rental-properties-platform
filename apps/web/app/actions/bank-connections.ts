"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "./auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLinkToken, exchangePublicToken, getAccounts, getInstitutionName, removeItem } from "@/lib/plaid";
import { bankFeedInstitution } from "@/lib/bank-feed/match";
import { encryptBankToken, decryptBankToken, assertBankTokenKey } from "@/lib/bank-feed/token-crypto";
import { syncConnection } from "@/lib/bank-feed/sync";
import { checkRateLimit } from "@/lib/rate-limit";
import { createBankLinkSchema, finishBankLinkSchema, bankConnectionSchema } from "@/lib/validations-bank-feed";

type Admin = ReturnType<typeof createAdminClient>;
const ACCESS = "You do not have access to this account.";
const FAILED = "We could not finish this. Try again.";

async function ownerMember(admin: Admin, userId: string, accountId: string) {
  const result = await admin.from("ownership_account_members").select("profile_id")
    .eq("account_id", accountId).eq("profile_id", userId).eq("member_role", "owner")
    .eq("active", true).maybeSingle();
  if (result.error) { console.error("bank_membership_lookup"); return false; }
  return !!result.data;
}

async function authorizedConnection(admin: Admin, userId: string, id: string) {
  const result = await admin.from("bank_connections")
    .select("id,owner_account_id,status,institution_name") .eq("id", id).maybeSingle();
  if (result.error) { console.error("bank_connection_lookup"); return null; }
  if (!result.data || !await ownerMember(admin, userId, result.data.owner_account_id)) return null;
  return result.data;
}

export async function startBankLink(input: unknown) {
  const { user } = await requireAuth("owner");
  const parsed = createBankLinkSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: FAILED };
  const admin = createAdminClient();
  try {
    if (!await ownerMember(admin, user.id, parsed.data.ownerAccountId)) return { success: false, error: ACCESS };
    assertBankTokenKey();
    if (!checkRateLimit(`bank-link:${user.id}`, 10, 60_000).allowed) return { success: false, error: FAILED };
    const { linkToken } = await createLinkToken({ userId: user.id, mode: "create" });
    return { success: true, linkToken };
  } catch (error) {
    console.error("bank_start_link", error instanceof Error ? error.name : "unknown");
    return { success: false, error: error instanceof Error && error.message === "Bank connection is not set up yet."
      ? error.message : FAILED };
  }
}

export async function finishBankLink(input: unknown) {
  const { user } = await requireAuth("owner");
  const parsed = finishBankLinkSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: FAILED };
  const { ownerAccountId, publicToken, selectedAccountIds } = parsed.data;
  const admin = createAdminClient();
  if (!await ownerMember(admin, user.id, ownerAccountId)) return { success: false, error: ACCESS };
  if (!checkRateLimit(`bank-finish:${user.id}`, 10, 60_000).allowed) return { success: false, error: FAILED };
  let accessToken: string | null = null;
  try {
    const exchanged = await exchangePublicToken(publicToken);
    accessToken = exchanged.accessToken;
    const [all, institutionName, existing] = await Promise.all([
      getAccounts(accessToken), getInstitutionName(accessToken),
      admin.from("bank_accounts").select("id,nickname,institution,source")
        .eq("owner_account_id", ownerAccountId)
    ]);
    if (existing.error) throw new Error("Bank account lookup failed.");
    const selected = selectedAccountIds.map((id) => all.find((account) => account.accountId === id));
    if (selected.some((account) => !account)) throw new Error("Selected account does not belong to this bank.");
    const usedNames = new Set((existing.data || []).map((account) => account.nickname));
    const accounts = selected.map((account) => {
      const item = account!;
      const base = `${item.name}${item.mask ? ` ••${item.mask}` : ""}`.slice(0, 55);
      let nickname = base;
      for (let suffix = 2; usedNames.has(nickname); suffix++) nickname = `${base.slice(0, 54)} (${suffix})`;
      usedNames.add(nickname);
      return { accountId: item.accountId, nickname, mask: item.mask, subtype: item.subtype,
        institution: bankFeedInstitution(institutionName) };
    });
    const ciphertext = encryptBankToken(accessToken);
    const saved = await admin.rpc("create_bank_connection", {
      p_owner_account_id: ownerAccountId, p_plaid_item_id: exchanged.itemId,
      p_institution_name: institutionName, p_ciphertext: ciphertext,
      p_actor_profile_id: user.id, p_accounts: accounts
    });
    if (saved.error) {
      if (saved.error.code === "23505") throw new Error("This bank is already connected.");
      throw new Error("Bank connection save failed.");
    }
    accessToken = null;
    const upload = (existing.data || []).filter((account) => account.source === "upload");
    if (upload.length) {
      const linked = await admin.from("bank_accounts").select("id,nickname,institution,mask")
        .eq("connection_id", saved.data);
      if (linked.error) throw new Error("Bank match lookup failed.");
      revalidatePath("/owner/bank");
      return { success: true, needsMatch: true, connectionId: saved.data,
        plaidAccounts: linked.data, uploadAccounts: upload };
    }
    try { await syncConnection(saved.data); } catch { console.error("bank_first_sync"); }
    revalidatePath("/owner/bank");
    return { success: true, connectionId: saved.data };
  } catch (error) {
    console.error("bank_finish_link", error instanceof Error ? error.name : "unknown");
    if (accessToken) {
      try { await removeItem(accessToken); } catch { console.error("bank_link_compensation"); }
    }
    return { success: false, error: error instanceof Error && ["This bank is already connected.",
      "Bank connection is not set up yet.", "Selected account does not belong to this bank."].includes(error.message)
      ? error.message : FAILED };
  }
}

export async function startBankRelink(input: unknown) {
  const { user } = await requireAuth("owner");
  const parsed = bankConnectionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: FAILED };
  const admin = createAdminClient();
  const connection = await authorizedConnection(admin, user.id, parsed.data.connectionId);
  if (!connection) return { success: false, error: ACCESS };
  if (connection.status !== "needs_login") return { success: false, error: FAILED };
  const secret = await admin.from("bank_connection_secrets").select("access_token_ciphertext")
    .eq("connection_id", connection.id).single();
  if (secret.error) return { success: false, error: FAILED };
  try {
    const { linkToken } = await createLinkToken({ userId: user.id, mode: "update",
      accessToken: decryptBankToken(secret.data.access_token_ciphertext) });
    return { success: true, linkToken };
  } catch (error) {
    console.error("bank_start_relink");
    return { success: false, error: error instanceof Error && error.message === "Bank connection is not set up yet."
      ? error.message : FAILED };
  }
}

export async function finishBankRelink(input: unknown) {
  const { user } = await requireAuth("owner");
  const parsed = bankConnectionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: FAILED };
  const admin = createAdminClient();
  const connection = await authorizedConnection(admin, user.id, parsed.data.connectionId);
  if (!connection) return { success: false, error: ACCESS };
  const update = await admin.from("bank_connections").update({ status: "ok", last_error: null })
    .eq("id", connection.id).eq("status", "needs_login").select("id");
  if (update.error || update.data?.length !== 1) return { success: false, error: FAILED };
  try { await syncConnection(connection.id); } catch { console.error("bank_relink_sync"); }
  revalidatePath("/owner/bank");
  return { success: true };
}

export async function refreshBank(input: unknown) {
  const { user } = await requireAuth("owner");
  const parsed = bankConnectionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: FAILED };
  const admin = createAdminClient();
  const connection = await authorizedConnection(admin, user.id, parsed.data.connectionId);
  if (!connection) return { success: false, error: ACCESS };
  if (connection.status === "pending_account_match") return { success: false, error: "Finish connecting" };
  if (connection.status !== "ok" && connection.status !== "error") return { success: false, error: FAILED };
  if (!checkRateLimit(`bank-refresh:${connection.id}`, 1, 60_000).allowed) return { success: false, error: FAILED };
  try { await syncConnection(connection.id); }
  catch { console.error("bank_refresh"); return { success: false, error: FAILED }; }
  revalidatePath("/owner/bank");
  return { success: true };
}
