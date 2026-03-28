import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "owner" | "manager" | "tenant";

export interface UserProfileSummary {
  fullName: string | null;
  nickname: string | null;
  avatarPath: string | null;
  avatarUrl: string | null;
  onboardingCompletedAt: string | null;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
}

export async function getAuthenticatedUser() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getCurrentUserRole(userId: string): Promise<AppRole> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const role = profile?.role;
  if (role === "owner" || role === "manager" || role === "tenant") {
    return role;
  }

  return "tenant";
}

export async function getAuthState(userId: string): Promise<{
  hasProfile: boolean;
  onboardingComplete: boolean;
  role: "owner" | "manager" | "tenant" | null;
  needsPasswordSet: boolean;
}> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  const hasProfile = profile !== null;
  const onboardingComplete = Boolean(profile?.onboarding_completed_at);
  const role =
    profile?.role === "owner" || profile?.role === "manager" || profile?.role === "tenant"
      ? profile.role
      : null;
  const needsPasswordSet = hasProfile && !onboardingComplete && role === "tenant";

  return {
    hasProfile,
    onboardingComplete,
    role,
    needsPasswordSet
  };
}

export function getRoleHomePath(role: AppRole) {
  if (role === "owner") {
    return "/owner";
  }
  if (role === "manager") {
    return "/manager";
  }
  return "/tenant";
}

export async function requireRole(allowed: AppRole[]) {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);

  if (!allowed.includes(role)) {
    redirect(getRoleHomePath(role));
  }

  return { user, role };
}

export async function getUserProfileSummary(userId: string): Promise<UserProfileSummary> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, nickname, avatar_url, onboarding_completed_at, stripe_account_id, stripe_onboarding_complete"
    )
    .eq("id", userId)
    .maybeSingle();

  const avatarPath =
    typeof profile?.avatar_url === "string" && profile.avatar_url.length > 0
      ? profile.avatar_url
      : null;
  const avatarStoragePath = avatarPath
    ? avatarPath.startsWith("profile-avatars/")
      ? avatarPath.replace(/^profile-avatars\//, "")
      : avatarPath
    : null;
  const avatarUrl = avatarPath
    ? avatarPath.startsWith("http")
      ? avatarPath
      : supabase.storage.from("profile-avatars").getPublicUrl(avatarStoragePath ?? avatarPath).data.publicUrl
    : null;

  return {
    fullName: profile?.full_name ?? null,
    nickname: profile?.nickname ?? null,
    avatarPath,
    avatarUrl,
    onboardingCompletedAt: profile?.onboarding_completed_at ?? null,
    stripeAccountId: profile?.stripe_account_id ?? null,
    stripeOnboardingComplete: profile?.stripe_onboarding_complete === true
  };
}
