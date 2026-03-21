import { getAuthenticatedUser } from "@/lib/auth";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";
import { getTenantInviteOnboardingContext } from "@/lib/invitations";

export const dynamic = "force-dynamic";

export default async function CompleteProfilePage() {
  const user = await getAuthenticatedUser();
  const inviteContext = await getTenantInviteOnboardingContext({
    userId: user.id,
    email: user.email,
    userMetadata: user.user_metadata
  });

  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4">
            <DomMascot size="xl" mood="waving" animate />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome to Domus!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {inviteContext?.propertyAddress
              ? `${inviteContext.ownerName ?? "Your landlord"} invited you to ${inviteContext.propertyAddress}${inviteContext.unitLabel ? `, ${inviteContext.unitLabel}` : ""}. Set your password to continue.`
              : "Set your password to complete your account setup."}
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-border bg-muted/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</p>
          <p className="mt-1 text-sm font-medium text-foreground">{user.email ?? "unknown"}</p>
        </div>

        <CompleteProfileForm email={user.email ?? ""} />
      </div>
    </main>
  );
}
