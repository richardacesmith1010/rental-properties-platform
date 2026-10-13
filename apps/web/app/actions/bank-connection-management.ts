"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "./auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmBankLinksSchema, bankConnectionSchema } from "@/lib/validations-bank-feed";
import { decryptBankToken } from "@/lib/bank-feed/token-crypto";
import { removeItem } from "@/lib/plaid";
import { syncConnection } from "@/lib/bank-feed/sync";

const FAILED = "We could not finish this. Try again.";
const CONFLICT = "This bank was already set up. Refresh to see it.";

async function ownedConnection(userId: string, connectionId: string) {
  const admin = createAdminClient();
  const connection = await admin.from("bank_connections")
    .select("id,owner_account_id,status") .eq("id", connectionId).maybeSingle();
  if (connection.error || !connection.data) return null;
  const member = await admin.from("ownership_account_members").select("profile_id")
    .eq("account_id", connection.data.owner_account_id).eq("profile_id", userId)
    .eq("member_role", "owner").eq("active", true).maybeSingle();
  if (member.error || !member.data) return null;
  return { admin, connection: connection.data };
}

export async function confirmBankLinks(input: unknown) {
  const { user } = await requireAuth("owner");
  const parsed = confirmBankLinksSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: FAILED };
  const uploadIds = parsed.data.pairs.map((pair) => pair.uploadBankAccountId);
  const plaidIds = parsed.data.pairs.map((pair) => pair.plaidBankAccountId);
  if (new Set(uploadIds).size !== uploadIds.length || new Set(plaidIds).size !== plaidIds.length) {
    return { success: false, error: FAILED };
  }
  const owned = await ownedConnection(user.id, parsed.data.connectionId);
  if (!owned) return { success: false, error: "You do not have access to this account." };
  const result = await owned.admin.rpc("confirm_bank_account_links", {
    p_connection_id: owned.connection.id, p_pairs: parsed.data.pairs
  });
  if (result.error) return { success: false, error: result.error.code === "P0001"
    && result.error.message?.includes("conflict") ? CONFLICT : FAILED };
  try { await syncConnection(owned.connection.id); } catch { console.error("bank_match_first_sync"); }
  revalidatePath("/owner/bank");
  return { success: true };
}

export async function skipBankLinks(input: unknown) {
  const { user } = await requireAuth("owner");
  const parsed = bankConnectionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: FAILED };
  const owned = await ownedConnection(user.id, parsed.data.connectionId);
  if (!owned) return { success: false, error: "You do not have access to this account." };
  const result = await owned.admin.rpc("skip_bank_account_match", { p_connection_id: owned.connection.id });
  if (result.error) return { success: false, error: FAILED };
  if (result.data !== "ok") return { success: false, error: CONFLICT };
  try { await syncConnection(owned.connection.id); } catch { console.error("bank_skip_first_sync"); }
  revalidatePath("/owner/bank");
  return { success: true };
}

export async function disconnectBank(input: unknown) {
  const { user } = await requireAuth("owner");
  const parsed = bankConnectionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: FAILED };
  const owned = await ownedConnection(user.id, parsed.data.connectionId);
  if (!owned) return { success: false, error: "You do not have access to this account." };
  const revoked = await owned.admin.from("bank_connections").update({ status: "revoked" })
    .eq("id", owned.connection.id);
  if (revoked.error) return { success: false, error: FAILED };
  const secret = await owned.admin.from("bank_connection_secrets").select("access_token_ciphertext")
    .eq("connection_id", owned.connection.id).maybeSingle();
  if (secret.error) return { success: false, error: FAILED };
  if (secret.data) {
    try { await removeItem(decryptBankToken(secret.data.access_token_ciphertext)); }
    catch { console.error("bank_item_remove"); }
  }
  const removed = await owned.admin.rpc("disconnect_bank_connection", { p_connection_id: owned.connection.id });
  if (removed.error) return { success: false, error: FAILED };
  revalidatePath("/owner/bank");
  return { success: true };
}
