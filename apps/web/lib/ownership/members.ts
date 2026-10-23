import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import type { OwnershipMemberDTO } from "./types";

export function getFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const firstSpace = trimmed.indexOf(" ");
  return firstSpace > 0 ? trimmed.slice(0, firstSpace) : trimmed;
}

export async function getOwnershipMembersForAccount(
  userId: string,
  accountId: string
): Promise<OwnershipMemberDTO[]> {
  const canAccessAccount = await canUserAdministerOwnershipAccount(userId, accountId);
  if (!canAccessAccount) {
    return [];
  }

  const admin = createAdminClient();
  const membersQuery = await admin
    .from("ownership_account_members")
    .select("profile_id, member_role, active, can_receive_critical_alerts, distribution_pct, payout_stripe_account_id")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  const members =
    membersQuery.error && isMissingSchemaError(membersQuery.error)
      ? (
          await admin
            .from("ownership_account_members")
            .select("profile_id, member_role, active, can_receive_critical_alerts")
            .eq("account_id", accountId)
            .order("created_at", { ascending: true })
        ).data?.map((member) => ({
          ...member,
          distribution_pct: null,
          payout_stripe_account_id: null
        })) ?? []
      : (membersQuery.data ?? []);

  if (!members) {
    return [];
  }

  const profileIds = members.map((member) => member.profile_id);
  if (profileIds.length === 0) {
    return [];
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", profileIds);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return (members ?? []).map((member) => {
    const profile = profileById.get(member.profile_id);
    return {
      profileId: member.profile_id,
      email: profile?.email ?? "unknown",
      fullName: profile?.full_name ?? "Unknown",
      memberRole: member.member_role as OwnershipMemberDTO["memberRole"],
      active: member.active,
      canReceiveCriticalAlerts: member.can_receive_critical_alerts,
      distributionPct:
        member.distribution_pct === null || member.distribution_pct === undefined
          ? null
          : Number(member.distribution_pct),
      payoutStripeConnected: Boolean(member.payout_stripe_account_id)
    };
  });
}

export async function getOrCreateIndividualOwnershipAccount(
  userId: string,
  fallbackDisplayName = "My Account"
): Promise<string> {
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("ownership_accounts")
    .select("id")
    .eq("account_type", "individual")
    .eq("created_by_profile_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError && isMissingSchemaError(existingError)) {
    throw new Error("Ownership accounts are not enabled yet. Run the Phase 9 migration first.");
  }

  if (existing?.id) {
    const { error: membershipError } = await admin.from("ownership_account_members").upsert(
      {
        account_id: existing.id,
        profile_id: userId,
        member_role: "owner",
        active: true,
        can_receive_critical_alerts: true
      },
      { onConflict: "account_id,profile_id" }
    );
    if (membershipError && isMissingSchemaError(membershipError)) {
      throw new Error("Ownership accounts are not enabled yet. Run the Phase 9 migration first.");
    }
    if (membershipError) {
      console.error("getOrCreateIndividualOwnershipAccount membership upsert error:", membershipError);
      throw new Error("Failed to sync the ownership account membership.");
    }
    return existing.id;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  const displayName =
    profile?.full_name && profile.full_name.trim().length > 0
      ? `${getFirstName(profile.full_name)}'s Account`
      : fallbackDisplayName;

  const { data: created, error } = await admin
    .from("ownership_accounts")
    .insert({
      account_type: "individual",
      display_name: displayName,
      created_by_profile_id: userId
    })
    .select("id")
    .single();

  if (error && isMissingSchemaError(error)) {
    throw new Error("Ownership accounts are not enabled yet. Run the Phase 9 migration first.");
  }

  if (error || !created?.id) {
    throw new Error("Failed to create ownership account.");
  }

  const { error: insertMembershipError } = await admin.from("ownership_account_members").insert({
    account_id: created.id,
    profile_id: userId,
    member_role: "owner",
    active: true,
    can_receive_critical_alerts: true
  });
  if (insertMembershipError && isMissingSchemaError(insertMembershipError)) {
    throw new Error("Ownership accounts are not enabled yet. Run the Phase 9 migration first.");
  }
  if (insertMembershipError) {
    console.error("getOrCreateIndividualOwnershipAccount membership insert error:", insertMembershipError);
    throw new Error("Failed to create the ownership account membership.");
  }

  return created.id;
}

export async function canUserAdministerOwnershipAccount(
  userId: string,
  accountId: string
): Promise<boolean> {
  const admin = createAdminClient();

  const [{ data: member, error: memberError }, { data: creator, error: creatorError }] = await Promise.all([
    admin
      .from("ownership_account_members")
      .select("account_id")
      .eq("account_id", accountId)
      .eq("profile_id", userId)
      .eq("active", true)
      .maybeSingle(),
    admin
      .from("ownership_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("created_by_profile_id", userId)
      .maybeSingle()
  ]);

  if ((memberError && isMissingSchemaError(memberError)) || (creatorError && isMissingSchemaError(creatorError))) {
    return false;
  }

  return Boolean(member?.account_id || creator?.id);
}