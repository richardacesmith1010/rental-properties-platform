import Link from "next/link";
import { checkConnectStatus } from "@/app/actions";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface ConnectReturnPageProps {
  searchParams?: {
    accountId?: string | string[];
  };
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

  if (role !== "owner" && role !== "manager") {
    redirect(getRoleHomePath(role));
  }

  const dashboardPath = accountId
    ? role === "owner"
      ? `/owner?section=ownership&account=${encodeURIComponent(accountId)}`
      : "/manager?section=ownership"
    : getRoleHomePath(role);
  const retryPath = accountId
    ? `/connect/onboard?accountId=${encodeURIComponent(accountId)}`
    : "/connect/onboard";
  const result = await checkConnectStatus(accountId);

  if (!result || !result.success) {
    return (
      <StatusCard
        tone="zinc"
        title="Unable to verify bank connection"
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
        title="Bank Account Connected"
        description="You'll now receive rent payments directly to your bank account."
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
        description="Stripe is reviewing your information. This usually takes a few minutes."
        href={dashboardPath}
        ctaLabel="Go to Dashboard"
      />
    );
  }

  return (
    <StatusCard
      tone="zinc"
      title="Onboarding Incomplete"
      description="Your Stripe onboarding was not finished. Start again to complete your bank connection."
      href={retryPath}
      ctaLabel="Try Again"
    />
  );
}
