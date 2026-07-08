import Link from "next/link";
import { redirect } from "next/navigation";
import {
  initiateAccountStripeConnect,
  initiateMemberPayoutConnect,
  initiateStripeConnect
} from "@/app/actions";
import { getActiveLlcMembershipsForUser } from "@/lib/ownership";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath, getUserProfileSummary } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/env";
import { getStripeConnectOnboardingErrorCopy } from "@/lib/stripe-errors";

export const dynamic = "force-dynamic";

interface ConnectOnboardPageProps {
  searchParams?: {
    accountId?: string | string[];
    memberPayout?: string | string[];
    profileId?: string | string[];
  };
}

export default async function ConnectOnboardPage({ searchParams }: ConnectOnboardPageProps) {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);
  const requestedAccountId =
    typeof searchParams?.accountId === "string"
      ? searchParams.accountId
      : Array.isArray(searchParams?.accountId)
        ? searchParams.accountId[0] ?? null
        : null;
  const requestedMemberPayout =
    (typeof searchParams?.memberPayout === "string" && searchParams.memberPayout === "true") ||
    (Array.isArray(searchParams?.memberPayout) && searchParams.memberPayout[0] === "true");
  const requestedProfileId =
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

  const llcMemberships =
    requestedMemberPayout || !requestedAccountId
      ? await getActiveLlcMembershipsForUser(user.id)
      : [];
  const singleLlcMembership = llcMemberships.length === 1 ? llcMemberships[0] : null;
  const effectiveMemberPayout =
    requestedMemberPayout || (!requestedAccountId && llcMemberships.length > 0);
  const effectiveAccountId = requestedAccountId ?? singleLlcMembership?.accountId ?? null;
  const profile = await getUserProfileSummary(user.id);
  if (!effectiveMemberPayout && !effectiveAccountId && profile.stripeOnboardingComplete) {
    redirect("/settings?connect=ready");
  }

  if (effectiveMemberPayout && !effectiveAccountId && llcMemberships.length > 1) {
    return (
      <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Which account are you connecting for?
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Pick the LLC that should receive your rent payouts.
          </p>
          <div className="mt-6 space-y-3">
            {llcMemberships.map((membership) => (
              <Link
                key={membership.accountId}
                href={`/connect/onboard?accountId=${encodeURIComponent(membership.accountId)}&memberPayout=true`}
                className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 text-left transition hover:border-violet-300 hover:bg-violet-50"
              >
                <div>
                  <p className="font-semibold text-zinc-900">{membership.accountName}</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {membership.payoutStripeConnected
                      ? "Your payout account is connected."
                      : "Connect your bank account to receive your share of rent."}
                  </p>
                </div>
                <span className="text-sm font-semibold text-violet-700">
                  {membership.payoutStripeConnected ? "Manage" : "Connect"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const result = await (async () => {
    try {
      return effectiveMemberPayout
        ? await (async () => {
            if (!effectiveAccountId) {
              return { success: false, error: "We could not find an LLC account to connect." } as const;
            }
            const formData = new FormData();
            formData.set("accountId", effectiveAccountId);
            formData.set("profileId", requestedProfileId ?? user.id);
            return initiateMemberPayoutConnect(null, formData);
          })()
        : effectiveAccountId
          ? await (async () => {
              const formData = new FormData();
              formData.set("accountId", effectiveAccountId);
              return initiateAccountStripeConnect(null, formData);
            })()
          : await initiateStripeConnect();
    } catch (error) {
      console.error("connect onboard page error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      } as const;
    }
  })();
  if (result?.success && result.url) {
    redirect(result.url);
  }

  const errorCopy = getStripeConnectOnboardingErrorCopy(result && !result.success ? result.error : null);

  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{errorCopy.title}</h1>
        <p className="mt-2 text-sm text-zinc-600">{errorCopy.description}</p>
      </div>
    </main>
  );
}
