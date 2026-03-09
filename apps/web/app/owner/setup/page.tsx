import { redirect } from "next/navigation";
import { OwnerSetupWizard } from "@/components/onboarding/owner-setup-wizard";
import { setupIndividualAccount, setupLlcAccount, joinLlcByCode } from "@/app/actions/onboarding";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { getOwnershipAccountsForUser } from "@/lib/ownership";

export const dynamic = "force-dynamic";

export default async function OwnerSetupPage() {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);

  if (role !== "owner") {
    redirect(getRoleHomePath(role));
  }

  const accounts = await getOwnershipAccountsForUser(user.id);
  if (accounts.length > 0) {
    redirect("/owner");
  }

  return (
    <main className="app-surface flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-emerald-500 text-xl font-bold text-white shadow-lg shadow-violet-500/25">
          D
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Set Up Your Account</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Tell us about your ownership structure to get started.
        </p>
      </div>
      <OwnerSetupWizard
        onSetupIndividual={setupIndividualAccount}
        onSetupLlc={setupLlcAccount}
        onJoinLlc={joinLlcByCode}
      />
    </main>
  );
}
