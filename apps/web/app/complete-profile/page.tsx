import { redirect } from "next/navigation";
import { getAuthState, getAuthenticatedUser } from "@/lib/auth";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";
import { getTenantInviteOnboardingContext } from "@/lib/invitations";
import { resolveAuthRoute } from "@/lib/route-resolver";

export const dynamic = "force-dynamic";

export default async function CompleteProfilePage() {
  const user = await getAuthenticatedUser();
  const authState = await getAuthState(user.id);

  if (!authState.needsPasswordSet) {
    const destination = resolveAuthRoute({ hasSession: true, ...authState });
    redirect(destination);
  }

  const inviteContext = await getTenantInviteOnboardingContext({
    userId: user.id,
    email: user.email,
    userMetadata: user.user_metadata
  });

  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="domus-card w-full max-w-lg p-8 shadow-[var(--domus-shadow-md)]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4">
            <DomMascot size="xl" mood="waving" animate />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">Welcome to Domus!</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {inviteContext?.propertyAddress
              ? `${inviteContext.ownerName ?? "Your landlord"} invited you to ${inviteContext.propertyAddress}${inviteContext.unitLabel ? `, ${inviteContext.unitLabel}` : ""}. Set your password to continue.`
              : "Set your password to complete your account setup."}
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Email</p>
          <p className="mt-1 text-sm font-medium text-[var(--ink)]">{user.email ?? "unknown"}</p>
        </div>

        <CompleteProfileForm email={user.email ?? ""} />
      </div>
    </main>
  );
}
