import Link from "next/link";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect";
import {
  initiateAccountStripeConnect,
  initiateMemberPayoutConnect,
  initiateStripeConnect
} from "@/app/actions";
import { getActiveLlcMembershipsForUser } from "@/lib/ownership";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/env";
import { getStripeConnectOnboardingErrorCopy } from "@/lib/stripe-errors";
import {
  getRentCollectionConnectStatus,
  hasRentCollectionAuthorityForAccount,
  type RentCollectionConnectStatus
} from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ConnectOnboardPageProps {
  searchParams?: {
    accountId?: string | string[];
    memberPayout?: string | string[];
    profile?: string | string[];
    profileId?: string | string[];
  };
}

function readSingleQueryParam(value: string | string[] | undefined): {
  value: string | null;
  invalid: boolean;
} {
  if (typeof value === "string") {
    return { value, invalid: false };
  }
  if (Array.isArray(value)) {
    return { value: null, invalid: true };
  }
  return { value: null, invalid: false };
}

function renderSafeErrorState() {
  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          We can&apos;t check your payment setup right now.
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          We can&apos;t check your payment setup right now. Please try again in a minute.
        </p>
        <Link
          href="/connect/onboard"
          className="mt-6 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          Try again
        </Link>
      </div>
    </main>
  );
}

function getAccountPropertySummary(account: RentCollectionConnectStatus["accounts"][number]) {
  if (account.activePropertyCount === 0 || account.propertyNames.length === 0) {
    return "No active properties yet.";
  }

  const extraPropertyCount = account.activePropertyCount - account.propertyNames.length;
  return extraPropertyCount > 0
    ? `${account.propertyNames.join(", ")} and ${extraPropertyCount} more`
    : account.propertyNames.join(", ");
}

function renderTargetChooser(status: RentCollectionConnectStatus) {
  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          Which account should receive rent?
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Pick the rent setup you want to finish.
        </p>
        <div className="mt-6 space-y-3">
          {status.targets.map((target) => {
            if (target.kind === "profile") {
              return (
                <Link
                  key="profile"
                  href="/connect/onboard?profile=true"
                  className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 text-left transition hover:border-violet-300 hover:bg-violet-50"
                >
                  <div>
                    <p className="font-semibold text-zinc-900">Your personal properties</p>
                    <p className="mt-1 text-sm text-zinc-600">
                      Set up rent payments for properties tied to your profile.
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-violet-700">Set up</span>
                </Link>
              );
            }

            const account = status.accounts.find((candidate) => candidate.accountId === target.accountId);
            if (!account) {
              return null;
            }

            return (
              <Link
                key={account.accountId}
                href={`/connect/onboard?accountId=${encodeURIComponent(account.accountId)}`}
                className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 text-left transition hover:border-violet-300 hover:bg-violet-50"
              >
                <div>
                  <p className="font-semibold text-zinc-900">{account.accountName}</p>
                  <p className="mt-1 text-sm text-zinc-600">{getAccountPropertySummary(account)}</p>
                </div>
                <span className="text-sm font-semibold text-violet-700">Set up</span>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function renderMemberPayoutChooser(
  memberships: Array<{ accountId: string; accountName: string; payoutStripeConnected: boolean }>
) {
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
          {memberships.map((membership) => (
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

export default async function ConnectOnboardPage({ searchParams }: ConnectOnboardPageProps) {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);
  const requestedAccountId = readSingleQueryParam(searchParams?.accountId);
  const requestedMemberPayout =
    (typeof searchParams?.memberPayout === "string" && searchParams.memberPayout === "true") ||
    (Array.isArray(searchParams?.memberPayout) && searchParams.memberPayout[0] === "true");
  const requestedProfileConnect =
    (typeof searchParams?.profile === "string" && searchParams.profile === "true") ||
    (Array.isArray(searchParams?.profile) && searchParams.profile[0] === "true");
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

  const result = await (async () => {
    try {
      if (requestedMemberPayout) {
        const llcMemberships =
          requestedAccountId.value === null
            ? await getActiveLlcMembershipsForUser(user.id)
            : [];
        const singleLlcMembership = llcMemberships.length === 1 ? llcMemberships[0] : null;
        const effectiveAccountId = requestedAccountId.value ?? singleLlcMembership?.accountId ?? null;

        if (!effectiveAccountId && llcMemberships.length > 1) {
          return renderMemberPayoutChooser(llcMemberships);
        }

        if (!effectiveAccountId) {
          return { success: false, error: "We could not find an LLC account to connect." } as const;
        }

        const formData = new FormData();
        formData.set("accountId", effectiveAccountId);
        formData.set("profileId", requestedProfileId ?? user.id);
        return await initiateMemberPayoutConnect(null, formData);
      }

      if (requestedAccountId.invalid || (requestedAccountId.value && !UUID_PATTERN.test(requestedAccountId.value))) {
        return renderSafeErrorState();
      }

      if (requestedAccountId.value) {
        const hasAuthority =
          role === "owner" && (await hasRentCollectionAuthorityForAccount(user.id, requestedAccountId.value));
        if (!hasAuthority) {
          return renderSafeErrorState();
        }

        const formData = new FormData();
        formData.set("accountId", requestedAccountId.value);
        return await initiateAccountStripeConnect(null, formData);
      }

      if (role === "manager" || requestedProfileConnect) {
        return await initiateStripeConnect();
      }

      const status = await getRentCollectionConnectStatus(user.id);
      if (!status.ok) {
        return renderSafeErrorState();
      }

      if (status.targets.length === 0) {
        if (status.accounts.length === 0 && !status.legacyProfileTarget && !status.profileConnected) {
          return await initiateStripeConnect();
        }
        redirect("/settings?connect=ready");
      }

      if (status.targets.length > 1) {
        return renderTargetChooser(status);
      }

      const [target] = status.targets;
      if (target?.kind === "account") {
        const formData = new FormData();
        formData.set("accountId", target.accountId);
        return await initiateAccountStripeConnect(null, formData);
      }

      return await initiateStripeConnect();
    } catch (error) {
      if (isRedirectError(error)) {
        throw error;
      }
      console.error("connect onboard page error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      } as const;
    }
  })();

  if (typeof result !== "object" || result === null || !("success" in result)) {
    return result;
  }

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
