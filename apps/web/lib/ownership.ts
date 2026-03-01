import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredOwnerAccountIds } from "@/lib/property-access";

export interface OwnershipAccountDTO {
  id: string;
  accountType: "individual" | "llc";
  displayName: string;
  memberCount: number;
}

export interface OwnershipMemberDTO {
  profileId: string;
  email: string;
  fullName: string;
  memberRole: "owner";
  active: boolean;
  canReceiveCriticalAlerts: boolean;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code ?? "") : "";
  const message = "message" in error ? String(error.message ?? "").toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("column") && message.includes("does not exist")
  );
}

export async function getOwnershipAccountsForUser(userId: string): Promise<OwnershipAccountDTO[]> {
  const admin = createAdminClient();

  const propertyAccountIds = await getAdministeredOwnerAccountIds(userId);

  const [{ data: memberRows, error: memberError }, { data: createdRows, error: creatorError }] = await Promise.all([
    admin
      .from("ownership_account_members")
      .select("account_id")
      .eq("profile_id", userId)
      .eq("active", true),
    admin
      .from("ownership_accounts")
      .select("id")
      .eq("created_by_profile_id", userId)
  ]);

  if ((memberError && isMissingSchemaError(memberError)) || (creatorError && isMissingSchemaError(creatorError))) {
    return [];
  }

  const accountIds = unique([
    ...propertyAccountIds,
    ...(memberRows ?? []).map((row) => row.account_id),
    ...(createdRows ?? []).map((row) => row.id)
  ]);

  if (accountIds.length === 0) {
    return [];
  }

  const [{ data: accounts, error: accountsError }, { data: members, error: membersError }] = await Promise.all([
    admin
      .from("ownership_accounts")
      .select("id, account_type, display_name")
      .in("id", accountIds)
      .order("created_at", { ascending: true }),
    admin
      .from("ownership_account_members")
      .select("account_id")
      .in("account_id", accountIds)
      .eq("active", true)
  ]);

  if ((accountsError && isMissingSchemaError(accountsError)) || (membersError && isMissingSchemaError(membersError))) {
    return [];
  }

  const memberCountByAccount = new Map<string, number>();
  for (const row of members ?? []) {
    memberCountByAccount.set(
      row.account_id,
      (memberCountByAccount.get(row.account_id) ?? 0) + 1
    );
  }

  return (accounts ?? []).map((account) => ({
    id: account.id,
    accountType: account.account_type as "individual" | "llc",
    displayName: account.display_name,
    memberCount: memberCountByAccount.get(account.id) ?? 0
  }));
}

export async function getOwnershipMembersForAccount(
  userId: string,
  accountId: string
): Promise<OwnershipMemberDTO[]> {
  const accountIds = await getAdministeredOwnerAccountIds(userId);
  if (!accountIds.includes(accountId)) {
    return [];
  }

  const admin = createAdminClient();
  const { data: members } = await admin
    .from("ownership_account_members")
    .select("profile_id, member_role, active, can_receive_critical_alerts")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

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
      memberRole: member.member_role as "owner",
      active: member.active,
      canReceiveCriticalAlerts: member.can_receive_critical_alerts
    };
  });
}

export async function getOrCreateIndividualOwnershipAccount(
  userId: string,
  fallbackDisplayName = "Individual Account"
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
    await admin.from("ownership_account_members").upsert(
      {
        account_id: existing.id,
        profile_id: userId,
        member_role: "owner",
        active: true,
        can_receive_critical_alerts: true
      },
      { onConflict: "account_id,profile_id" }
    );
    return existing.id;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  const displayName =
    profile?.full_name && profile.full_name.trim().length > 0
      ? `${profile.full_name.trim()} Account`
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

  await admin.from("ownership_account_members").insert({
    account_id: created.id,
    profile_id: userId,
    member_role: "owner",
    active: true,
    can_receive_critical_alerts: true
  });

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
