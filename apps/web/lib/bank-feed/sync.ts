import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncTransactions, LeaseLost } from "@/lib/plaid";
import { decryptBankToken } from "./token-crypto";
import { plaidFingerprint } from "./fingerprint";
import { processBankRows, type SyncedRow } from "./process-rows";

type Admin = ReturnType<typeof createAdminClient>;

async function heartbeat(admin: Admin, id: string, token: string) {
  const { data, error } = await admin.from("bank_connections")
    .update({ sync_lease_until: new Date(Date.now() + 600_000).toISOString() })
    .eq("id", id).eq("sync_lease_token", token).gt("sync_lease_until", new Date().toISOString())
    .in("status", ["ok", "error"])
    .select("id");
  if (error || data?.length !== 1) throw new LeaseLost();
}

export function safePlaidError(error: unknown): string {
  const value = (error as { response?: { data?: { error_code?: unknown } } })?.response?.data?.error_code;
  return typeof value === "string" && /^[A-Z_]{3,60}$/.test(value) ? value : "SYNC_FAILED";
}

export function selectSyncActor(creator: string, members: Array<{ profile_id: string }>): string | null {
  return members.some((member) => member.profile_id === creator) ? creator : members[0]?.profile_id ?? null;
}

export function mapPlaidRow(item: { pending: boolean; date: string; amount: number; account_id: string;
  transaction_id: string; merchant_name?: string | null; name: string }, bankId: string, index: number): SyncedRow | null {
  const amountCents = Math.round(Math.abs(item.amount) * 100);
  if (item.pending || !item.date || amountCents <= 0) return null;
  return { i: index, postedOn: item.date, amountCents, direction: item.amount > 0 ? "out" : "in",
    description: (item.merchant_name || item.name).slice(0, 200), occurrenceIndex: 0,
    fingerprint: plaidFingerprint(bankId, item.transaction_id), externalId: item.transaction_id };
}

export async function syncConnection(connectionId: string): Promise<boolean> {
  const admin = createAdminClient();
  const acquired = await admin.rpc("acquire_bank_sync_lease", { p_connection_id: connectionId });
  if (acquired.error) throw new Error("Bank sync lease failed.");
  const token = acquired.data as string | null;
  if (!token) return false;
  try {
    const [connectionResult, secretResult, accountsResult] = await Promise.all([
      admin.from("bank_connections").select("id,owner_account_id,created_by_profile_id,status")
        .eq("id", connectionId).single(),
      admin.from("bank_connection_secrets").select("access_token_ciphertext,transactions_cursor")
        .eq("connection_id", connectionId).single(),
      admin.from("bank_accounts").select("id,owner_account_id,nickname,plaid_account_id")
        .eq("connection_id", connectionId)
    ]);
    if (connectionResult.error || secretResult.error || accountsResult.error) {
      throw new Error("Bank connection lookup failed.");
    }
    const connection = connectionResult.data;
    const secret = secretResult.data;
    const accounts = accountsResult.data || [];
    const accessToken = decryptBankToken(secret.access_token_ciphertext);
    const pages = await syncTransactions(accessToken, secret.transactions_cursor, {
      onPage: () => heartbeat(admin, connectionId, token)
    });
    await heartbeat(admin, connectionId, token);
    const members = await admin.from("ownership_account_members")
      .select("profile_id,created_at").eq("account_id", connection.owner_account_id)
      .eq("member_role", "owner").eq("active", true).order("created_at", { ascending: true });
    if (members.error) throw new Error("Bank owner lookup failed.");
    const actor = selectSyncActor(connection.created_by_profile_id, members.data || []);
    const accountMap = new Map(accounts.map((bank) => [bank.plaid_account_id, bank]));
    const rowsByAccount = new Map<string, SyncedRow[]>();
    for (const item of pages.added) {
      const bank = accountMap.get(item.account_id);
      if (!bank) continue;
      const rows = rowsByAccount.get(bank.id) || [];
      const row = mapPlaidRow(item, bank.id, rows.length);
      if (!row) continue;
      rows.push(row);
      rowsByAccount.set(bank.id, rows);
    }
    for (const bank of accounts) {
      const rows = rowsByAccount.get(bank.id) || [];
      await processBankRows({ admin, actorProfileId: actor, bank, rows, source: "sync",
        onProgress: () => heartbeat(admin, connectionId, token) });
    }
    for (const item of pages.modified) {
      if (item.pending) continue;
      const bank = accountMap.get(item.account_id);
      if (!bank) continue;
      await heartbeat(admin, connectionId, token);
      const updated = await admin.from("bank_review_items").update({
        posted_on: item.date, amount_cents: Math.round(Math.abs(item.amount) * 100),
        direction: item.amount > 0 ? "out" : "in", description: (item.merchant_name || item.name).slice(0, 200),
        fingerprint: plaidFingerprint(bank.id, item.transaction_id), updated_at: new Date().toISOString()
      }).eq("bank_account_id", bank.id).eq("external_id", item.transaction_id);
      if (updated.error) throw new Error("Bank queued change failed.");
      const filed = await admin.from("bank_transactions").select("id,posted_on,amount_cents,direction")
        .eq("bank_account_id", bank.id).eq("external_id", item.transaction_id).maybeSingle();
      if (filed.error) throw new Error("Bank filed change lookup failed.");
      if (filed.data && (filed.data.posted_on !== item.date
        || filed.data.amount_cents !== Math.round(Math.abs(item.amount) * 100)
        || filed.data.direction !== (item.amount > 0 ? "out" : "in"))) {
        const flagged = await admin.from("bank_transactions").update({
          bank_change: "modified", bank_change_at: new Date().toISOString()
        }).eq("id", filed.data.id);
        if (flagged.error) throw new Error("Bank filed change flag failed.");
      }
    }
    for (const item of pages.removed) {
      const bank = accountMap.get(item.account_id);
      if (!bank) continue;
      await heartbeat(admin, connectionId, token);
      const removed = await admin.from("bank_review_items").delete()
        .eq("bank_account_id", bank.id).eq("external_id", item.transaction_id);
      const flagged = await admin.from("bank_transactions").update({
        bank_change: "removed", bank_change_at: new Date().toISOString()
      }).eq("bank_account_id", bank.id).eq("external_id", item.transaction_id);
      if (removed.error || flagged.error) throw new Error("Bank removal failed.");
    }
    const saved = await admin.rpc("save_bank_sync_cursor", {
      p_connection_id: connectionId, p_lease_token: token, p_cursor: pages.nextCursor
    });
    if (saved.error || saved.data !== true) throw new LeaseLost();
    const updated = await admin.from("bank_connections").update({
      last_synced_at: new Date().toISOString(), status: "ok", last_error: null
    }).eq("id", connectionId).eq("sync_lease_token", token).in("status", ["ok", "error"]);
    if (updated.error) throw new Error("Bank sync status failed.");
    return true;
  } catch (error) {
    if (error instanceof LeaseLost) return false;
    const code = safePlaidError(error);
    const status = code === "ITEM_LOGIN_REQUIRED" ? "needs_login" : "error";
    const update = await admin.from("bank_connections").update({ status, last_error: code })
      .eq("id", connectionId).eq("sync_lease_token", token).in("status", ["ok", "error"]);
    if (update.error) console.error("bank_sync_status");
    throw new Error("Bank sync failed.");
  } finally {
    const release = await admin.from("bank_connections").update({ sync_lease_token: null, sync_lease_until: null })
      .eq("id", connectionId).eq("sync_lease_token", token);
    if (release.error) console.error("bank_sync_release");
  }
}
