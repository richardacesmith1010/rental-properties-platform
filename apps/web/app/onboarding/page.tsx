import { redirect } from "next/navigation";
import { completeOnboarding } from "@/app/actions";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { getTenantInviteOnboardingContext } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);
  const supabase = createClient();
  const inviteContext =
    role === "tenant"
      ? await getTenantInviteOnboardingContext({
          userId: user.id,
          email: user.email,
          userMetadata: user.user_metadata
        })
      : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed_at) {
    redirect(getRoleHomePath(role));
  }

  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4">
            <DomMascot size="xl" mood="waving" animate />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {role === "tenant" && inviteContext?.propertyAddress
              ? `Welcome to Domus, ${profile?.full_name?.split(/\s+/)[0] ?? "there"}!`
              : "Finish your profile"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {role === "tenant" && inviteContext?.propertyAddress
              ? `${inviteContext.ownerName ?? "Your landlord"} invited you to manage your rental at ${inviteContext.propertyAddress}${inviteContext.unitLabel ? `, ${inviteContext.unitLabel}` : ""}.`
              : "Add the basics now so Domus feels personal from the first workspace load."}
          </p>
          {role === "tenant" && inviteContext ? (
            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4 text-left text-sm">
              <p><span className="font-semibold text-foreground">Invited by:</span> <span className="text-muted-foreground">{inviteContext.ownerName ?? "Your landlord"}</span></p>
              <p className="mt-2"><span className="font-semibold text-foreground">Property:</span> <span className="text-muted-foreground">{inviteContext.propertyAddress ?? inviteContext.propertyName ?? "Your rental home"}</span></p>
              {inviteContext.unitLabel ? (
                <p className="mt-2"><span className="font-semibold text-foreground">Unit:</span> <span className="text-muted-foreground">{inviteContext.unitLabel}</span></p>
              ) : null}
              {inviteContext.monthlyRentLabel ? (
                <p className="mt-2"><span className="font-semibold text-foreground">Monthly rent:</span> <span className="text-muted-foreground">{inviteContext.monthlyRentLabel}</span></p>
              ) : null}
            </div>
          ) : null}
        </div>

        <OnboardingForm
          email={user.email ?? "unknown"}
          fullName={profile?.full_name ?? null}
          role={role}
          onCompleteOnboarding={completeOnboarding}
        />
      </div>
    </main>
  );
}
