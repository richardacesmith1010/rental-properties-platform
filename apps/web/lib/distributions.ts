import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface DistributionHistoryEntry {
  id: string;
  paymentId: string;
  memberProfileId: string;
  memberName: string;
  memberEmail: string;
  amountCents: number;
  distributionPct: number | null;
  stripeTransferId: string | null;
  status: "completed" | "failed" | "pending";
  createdAt: string;
}

interface DistributionMemberRow {
  profileId: string;
  distributionPct: number | null;
  payoutStripeAccountId: string | null;
}

export async function getDistributionHistory(
  accountId: string,
  limit = 20
): Promise<DistributionHistoryEntry[]> {
  const admin = createAdminClient();
  const safeLimit = Math.max(1, limit);
  const { data, error } = await admin
    .from("payment_distributions")
    .select(
      "id, payment_id, member_profile_id, amount_cents, distribution_pct, stripe_transfer_id, status, created_at"
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    console.error("getDistributionHistory error:", error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  const profileIds = Array.from(new Set(data.map((row) => row.member_profile_id)));
  const { data: profiles, error: profilesError } = profileIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", profileIds)
    : { data: [], error: null };

  if (profilesError) {
    console.error("getDistributionHistory profiles error:", profilesError);
  }

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return data.map((row) => {
    const profile = profileMap.get(row.member_profile_id);
    return {
      id: row.id,
      paymentId: row.payment_id,
      memberProfileId: row.member_profile_id,
      memberName: profile?.full_name ?? "Unknown",
      memberEmail: profile?.email ?? "unknown",
      amountCents: row.amount_cents,
      distributionPct:
        row.distribution_pct === null || row.distribution_pct === undefined
          ? null
          : Number(row.distribution_pct),
      stripeTransferId: row.stripe_transfer_id,
      status: row.status as DistributionHistoryEntry["status"],
      createdAt: row.created_at
    };
  });
}

export function validateDistributionConfig(
  mode: string,
  memberPcts: Map<string, number>
): { valid: boolean; error?: string } {
  if (mode === "retain" || mode === "split_equal") {
    return { valid: true };
  }

  if (mode !== "split_custom") {
    return { valid: false, error: "Invalid distribution mode." };
  }

  const total = Array.from(memberPcts.values()).reduce((sum, pct) => sum + pct, 0);
  if (Math.abs(total - 100) > 0.01) {
    return {
      valid: false,
      error: `Percentages must sum to 100%. Current total: ${total.toFixed(2)}%`
    };
  }

  for (const pct of memberPcts.values()) {
    if (pct < 0 || pct > 100) {
      return { valid: false, error: "Each percentage must be between 0 and 100." };
    }
  }

  return { valid: true };
}

export async function getDistributionMembersForAccount(accountId: string): Promise<{
  mode: string;
  members: DistributionMemberRow[];
}> {
  const admin = createAdminClient();
  const [accountResult, membersResult] = await Promise.all([
    admin.from("ownership_accounts").select("distribution_mode").eq("id", accountId).maybeSingle(),
    admin
      .from("ownership_account_members")
      .select("profile_id, distribution_pct, payout_stripe_account_id")
      .eq("account_id", accountId)
      .eq("active", true)
  ]);

  const mode =
    accountResult.error && isMissingSchemaError(accountResult.error)
      ? "retain"
      : accountResult.data?.distribution_mode ?? "retain";

  if (accountResult.error && !isMissingSchemaError(accountResult.error)) {
    console.error("getDistributionMembersForAccount account error:", accountResult.error);
  }

  let rows = membersResult.data ?? [];
  if (membersResult.error) {
    if (isMissingSchemaError(membersResult.error)) {
      const fallback = await admin
        .from("ownership_account_members")
        .select("profile_id")
        .eq("account_id", accountId)
        .eq("active", true);
      if (fallback.error && !isMissingSchemaError(fallback.error)) {
        console.error("getDistributionMembersForAccount fallback error:", fallback.error);
      }
      rows = (fallback.data ?? []).map((member) => ({
        profile_id: member.profile_id,
        distribution_pct: null,
        payout_stripe_account_id: null
      }));
    } else {
      console.error("getDistributionMembersForAccount member error:", membersResult.error);
      rows = [];
    }
  }

  return {
    mode,
    members: rows.map((member) => ({
      profileId: member.profile_id,
      distributionPct:
        member.distribution_pct === null || member.distribution_pct === undefined
          ? null
          : Number(member.distribution_pct),
      payoutStripeAccountId: member.payout_stripe_account_id ?? null
    }))
  };
}
