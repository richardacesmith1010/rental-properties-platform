import { redirect } from "next/navigation";
import { initiateAccountStripeConnect, initiateStripeConnect } from "@/app/actions";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath, getUserProfileSummary } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface ConnectOnboardPageProps {
  searchParams?: {
    accountId?: string | string[];
  };
}

export default async function ConnectOnboardPage({ searchParams }: ConnectOnboardPageProps) {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);
  const accountId =
    typeof searchParams?.accountId === "string"
      ? searchParams.accountId
      : Array.isArray(searchParams?.accountId)
        ? searchParams.accountId[0] ?? null
        : null;

  if (role !== "owner" && role !== "manager") {
    redirect(getRoleHomePath(role));
  }

  const profile = await getUserProfileSummary(user.id);
  if (!accountId && profile.stripeOnboardingComplete) {
    redirect("/settings?connect=ready");
  }

  const result = accountId
    ? await (async () => {
        const formData = new FormData();
        formData.set("accountId", accountId);
        return initiateAccountStripeConnect(null, formData);
      })()
    : await initiateStripeConnect();
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
