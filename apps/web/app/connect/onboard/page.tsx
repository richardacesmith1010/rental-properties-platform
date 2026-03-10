import { redirect } from "next/navigation";
import { initiateStripeConnect } from "@/app/actions";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath, getUserProfileSummary } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ConnectOnboardPage() {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);

  if (role !== "owner" && role !== "manager") {
    redirect(getRoleHomePath(role));
  }

  const profile = await getUserProfileSummary(user.id);
  if (profile.stripeOnboardingComplete) {
    redirect("/settings?connect=ready");
  }

  const result = await initiateStripeConnect();
  if (result?.success && result.url) {
    redirect(result.url);
  }

  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Unable to start bank connection</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {result && !result.success ? result.error : "Stripe onboarding could not be started right now."}
        </p>
      </div>
    </main>
  );
}
