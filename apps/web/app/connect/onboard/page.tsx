import Link from "next/link";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  initiateAccountStripeConnect,
  initiateMemberPayoutConnect,
  initiateStripeConnect
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  searchParams?: Promise<{
    accountId?: string | string[];
    memberPayout?: string | string[];
    profile?: string | string[];
    profileId?: string | string[];
  }>;
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
      <Card variant="elevated" className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">
            We can&apos;t check your payment setup right now.
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted)]">
            We can&apos;t check your payment setup right now. Please try again in a minute.
          </p>
          <Button asChild className="mt-6">
            <Link href="/connect/onboard">Try again</Link>
          </Button>
        </CardContent>
      </Card>
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
      <Card variant="elevated" className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Which account should receive rent?</CardTitle>
          <p className="text-sm text-[var(--muted)]">
            Pick the rent setup you want to finish.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {status.targets.map((target) => {
            if (target.kind === "profile") {
              return (
                <Link
                  key="profile"
                  href="/connect/onboard?profile=true"
                  className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-left transition hover:border-[var(--accent-line)] hover:bg-[var(--surface-2)]"
                >
                  <div>
                    <p className="font-semibold text-[var(--ink)]">Your personal properties</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Set up rent payments for properties tied to your profile.
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-[var(--accent)]">Set up</span>
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
                className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-left transition hover:border-[var(--accent-line)] hover:bg-[var(--surface-2)]"
              >
                <div>
                  <p className="font-semibold text-[var(--ink)]">{account.accountName}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{getAccountPropertySummary(account)}</p>
                </div>
                <span className="text-sm font-semibold text-[var(--accent)]">Set up</span>
              </Link>
            );
            })}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function renderMemberPayoutChooser(
  memberships: Array<{ accountId: string; accountName: string; payoutStripeConnected: boolean }>
) {
  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <Card variant="elevated" className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Which account are you connecting for?</CardTitle>
          <p className="text-sm text-[var(--muted)]">
            Pick the LLC that should receive your rent payouts.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {memberships.map((membership) => (
            <Link
              key={membership.accountId}
              href={`/connect/onboard?accountId=${encodeURIComponent(membership.accountId)}&memberPayout=true`}
              className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-left transition hover:border-[var(--accent-line)] hover:bg-[var(--surface-2)]"
            >
              <div>
                <p className="font-semibold text-[var(--ink)]">{membership.accountName}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {membership.payoutStripeConnected
                    ? "Your payout account is connected."
                    : "Connect your bank account to receive your share of rent."}
                </p>
              </div>
              <span className="text-sm font-semibold text-[var(--accent)]">
                {membership.payoutStripeConnected ? "Manage" : "Connect"}
              </span>
            </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default async function ConnectOnboardPage(props: ConnectOnboardPageProps) {
  const searchParams = await props.searchParams;
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
        <Card variant="elevated" className="w-full max-w-lg border-[var(--warn)]">
          <CardHeader>
            <CardTitle className="text-2xl">Bank connection unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--muted)]">
              Payment processing is temporarily unavailable. Please try again later.
            </p>
          </CardContent>
        </Card>
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
      <Card variant="elevated" className="w-full max-w-lg border-[var(--crit)]">
        <CardHeader>
          <CardTitle className="text-2xl">{errorCopy.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted)]">{errorCopy.description}</p>
        </CardContent>
      </Card>
    </main>
  );
}
