import { redirect } from "next/navigation";
import { completeOnboarding } from "@/app/actions";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);
  const supabase = createClient();

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
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-emerald-500 text-xl font-bold text-white shadow-lg shadow-violet-500/25">
            D
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Finish your profile</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Add the basics now so Domus feels personal from the first workspace load.
          </p>
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
