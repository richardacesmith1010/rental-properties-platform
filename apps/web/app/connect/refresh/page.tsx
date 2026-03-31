import { redirect } from "next/navigation";
import {
  initiateAccountStripeConnect,
  initiateMemberPayoutConnect,
  initiateStripeConnect
} from "@/app/actions";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

interface ConnectRefreshPageProps {
  searchParams?: {
    accountId?: string | string[];
    memberPayout?: string | string[];
    profileId?: string | string[];
  };
}

export default async function ConnectRefreshPage({ searchParams }: ConnectRefreshPageProps) {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);
  const accountId =
    typeof searchParams?.accountId === "string"
      ? searchParams.accountId
      : Array.isArray(searchParams?.accountId)
        ? searchParams.accountId[0] ?? null
        : null;
  const memberPayout =
    (typeof searchParams?.memberPayout === "string" && searchParams.memberPayout === "true") ||
    (Array.isArray(searchParams?.memberPayout) && searchParams.memberPayout[0] === "true");
  const profileId =
    typeof searchParams?.profileId === "string"
      ? searchParams.profileId
      : Array.isArray(searchParams?.profileId)
        ? searchParams.profileId[0] ?? null
        : null;

  if (role !== "owner" && role !== "manager") {
    redirect(getRoleHomePath(role));
  }

  if (!isStripeConfigured()) {
    return (
      <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Bank connection unavailable
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Payment processing is temporarily unavailable. Please try again later.
          </p>
        </div>
      </main>
    );
  }

  const result = memberPayout
    ? await (async () => {
        if (!accountId) {
          return { success: false, error: "Missing payout onboarding details." } as const;
        }
        const formData = new FormData();
        formData.set("accountId", accountId);
        formData.set("profileId", profileId ?? user.id);
        return initiateMemberPayoutConnect(null, formData);
      })()
    : accountId
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
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Unable to refresh onboarding link</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {result && !result.success ? result.error : "Your bank connection could not be restarted right now."}
        </p>
      </div>
    </main>
  );
}
