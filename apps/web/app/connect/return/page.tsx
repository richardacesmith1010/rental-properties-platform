import Link from "next/link";
import { checkConnectStatus } from "@/app/actions";
import { getAccount } from "@/lib/stripe-connect";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface ConnectReturnPageProps {
  searchParams?: {
    accountId?: string | string[];
    memberPayout?: string | string[];
    profileId?: string | string[];
  };
}

async function checkMemberPayoutStatus(accountId: string, profileId: string) {
  try {
    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("ownership_account_members")
      .select("payout_stripe_account_id")
      .eq("account_id", accountId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (!membership?.payout_stripe_account_id) {
      return { success: true, connected: false, detailsSubmitted: false } as const;
    }

    const account = await getAccount(membership.payout_stripe_account_id);
    return {
      success: true,
      connected: Boolean(account.charges_enabled && account.payouts_enabled),
      detailsSubmitted: account.details_submitted
    } as const;
  } catch (error) {
    console.error("checkMemberPayoutStatus error:", error);
    return {
      success: false,
      error: "Unable to verify the payout connection right now. Please try again."
    } as const;
  }
}

function StatusCard({
  tone,
  title,
  description,
  href,
  ctaLabel
}: {
  tone: "emerald" | "amber" | "zinc";
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    zinc: "border-zinc-200 bg-white text-zinc-900"
  } as const;

  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className={`w-full max-w-lg rounded-2xl border p-8 shadow-sm ${tones[tone]}`}>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm opacity-90">{description}</p>
        <Link
          href={href}
          className="mt-6 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          {ctaLabel}
        </Link>
      </div>
    </main>
  );
}

export default async function ConnectReturnPage({ searchParams }: ConnectReturnPageProps) {
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

  const dashboardPath = accountId
    ? role === "owner"
      ? `/owner?section=ownership&account=${encodeURIComponent(accountId)}`
      : "/manager?section=ownership"
    : getRoleHomePath(role);
  const retryPath =
    accountId && memberPayout && profileId
      ? `/connect/onboard?accountId=${encodeURIComponent(accountId)}&memberPayout=true&profileId=${encodeURIComponent(profileId)}`
      : accountId
        ? `/connect/onboard?accountId=${encodeURIComponent(accountId)}`
        : "/connect/onboard";
  const result =
    memberPayout && accountId && profileId
      ? await checkMemberPayoutStatus(accountId, profileId)
      : await checkConnectStatus(accountId);
  const unableToVerifyTitle = memberPayout
    ? "Unable to verify payout connection"
    : "Unable to verify bank connection";
  const connectedTitle = memberPayout ? "Payout Account Connected" : "Bank Account Connected";
  const connectedDescription = memberPayout
    ? "This member can now receive LLC distribution transfers."
    : "You'll now receive rent payments directly to your bank account.";
  const almostThereDescription = memberPayout
    ? "Stripe is reviewing this payout account. This usually takes a few minutes."
    : "Stripe is reviewing your information. This usually takes a few minutes.";
  const incompleteTitle = memberPayout ? "Payout Onboarding Incomplete" : "Onboarding Incomplete";
  const incompleteDescription = memberPayout
    ? "This payout onboarding was not finished. Start again to complete the member payout account."
    : "Your Stripe onboarding was not finished. Start again to complete your bank connection.";

  if (!result || !result.success) {
    return (
      <StatusCard
        tone="zinc"
        title={unableToVerifyTitle}
        description={result && !result.success ? result.error : "Please try again from settings."}
        href={accountId ? dashboardPath : "/settings"}
        ctaLabel="Back to Settings"
      />
    );
  }

  if (result.connected) {
    return (
      <StatusCard
        tone="emerald"
        title={connectedTitle}
        description={connectedDescription}
        href={dashboardPath}
        ctaLabel="Go to Dashboard"
      />
    );
  }

  if (result.detailsSubmitted) {
    return (
      <StatusCard
        tone="amber"
        title="Almost There"
        description={almostThereDescription}
        href={dashboardPath}
        ctaLabel="Go to Dashboard"
      />
    );
  }

  return (
    <StatusCard
      tone="zinc"
      title={incompleteTitle}
      description={incompleteDescription}
      href={retryPath}
      ctaLabel="Try Again"
    />
  );
}
