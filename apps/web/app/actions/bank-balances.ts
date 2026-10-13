"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { updateManualBalanceSchema } from "@/lib/validations";
import { requireAuth } from "./auth-helpers";

export async function setManualBalance(input: { bankAccountId: string; balanceCents: number }):
  Promise<{ success: boolean; error?: string }> {
  const { user, supabase } = await requireAuth("owner");
  const parsed = updateManualBalanceSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Enter a valid balance." };
  const bank = await supabase.from("bank_accounts").select("id,owner_account_id,source")
    .eq("id", parsed.data.bankAccountId).maybeSingle();
  if (bank.error || !bank.data) return { success: false, error: "Bank account not found." };
  const member = await supabase.from("ownership_account_members").select("account_id")
    .eq("account_id", bank.data.owner_account_id).eq("profile_id", user.id)
    .eq("member_role", "owner").eq("active", true).maybeSingle();
  if (member.error || !member.data) return { success: false, error: "Access denied." };
  if (bank.data.source !== "upload") return { success: false,
    error: "This bank updates its balance by itself." };
  const saved = await createAdminClient().from("bank_accounts").update({
    balance_cents: parsed.data.balanceCents, balance_as_of: new Date().toISOString(), balance_source: "manual"
  }).eq("id", bank.data.id).eq("owner_account_id", bank.data.owner_account_id).eq("source", "upload").select("id");
  if (saved.error || saved.data?.length !== 1) return { success: false,
    error: isMissingSchemaError(saved.error) ? "This feature requires a database update."
      : "Could not save the balance." };
  revalidatePath("/owner/bank"); revalidatePath("/owner/money");
  return { success: true };
}
