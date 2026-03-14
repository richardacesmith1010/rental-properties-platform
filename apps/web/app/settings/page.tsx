import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getAuthenticatedUser,
  getCurrentUserRole,
  getRoleHomePath,
  getUserProfileSummary
} from "@/lib/auth";
import {
  disableAutopay,
  getExpressDashboardUrl,
  saveNotificationPreference,
  setupAutopay,
  updateProfile
} from "@/app/actions";
import { getAutopayEnrollments } from "@/app/actions/autopay";
import { AutopayCard } from "@/components/dashboard/autopay-card";
import { BankSettings } from "@/components/settings/bank-settings";
import { NotificationPreferences } from "@/components/settings/notification-preferences";
import { ThemeSettingsPanel } from "@/components/settings/theme-settings-panel";
import { PasswordSettings } from "@/components/settings/password-settings";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { SettingsLayout } from "@/components/settings/settings-layout";
import {
  getUserNotificationPreferences,
  NOTIFICATION_PREFERENCE_OPTIONS
} from "@/lib/notification-preferences";

export const dynamic = "force-dynamic";

interface SettingsPageProps {
  searchParams?: {
    connect?: string | string[];
  };
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);
  const workspacePath = getRoleHomePath(role);
  const profile = await getUserProfileSummary(user.id);
  const [enrollments, notificationPreferences] = await Promise.all([
    role === "tenant" ? getAutopayEnrollments(user.id) : Promise.resolve([]),
    getUserNotificationPreferences(user.id)
  ]);
  const connectMessage =
    typeof searchParams?.connect === "string"
      ? searchParams.connect
      : Array.isArray(searchParams?.connect)
        ? searchParams.connect[0] ?? null
        : null;

  if (!profile.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  return (
    <main id="main-content" className="app-surface min-h-screen px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Settings</h1>
          <p className="text-sm text-zinc-600">
            Manage your Domus experience and preferences.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={workspacePath}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              title="Return to your main workspace."
            >
              Back to Workspace
            </Link>
          </div>
        </header>

        {connectMessage === "ready" ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Your bank account is already connected and ready to receive payouts.
          </div>
        ) : null}

        <SettingsLayout
          role={role}
          sections={{
            profile: {
              title: "Profile",
              description: "Update how your name and photo appear throughout Domus.",
              content: (
                <ProfileSettings
                  email={user.email ?? "unknown"}
                  fullName={profile.fullName}
                  nickname={profile.nickname}
                  avatarUrl={profile.avatarUrl}
                  onUpdateProfile={updateProfile}
                />
              )
            },
            payment: {
              title: "Payment Methods",
              description: "Manage autopay enrollments tied to your active leases.",
              content: (
                <div className="space-y-3">
                  {enrollments.map((enrollment) => (
                    <AutopayCard
                      key={enrollment.id}
                      leaseId={enrollment.leaseId}
                      propertyLabel={enrollment.propertyLabel}
                      enrollment={enrollment}
                      onSetupAutopay={setupAutopay}
                      onDisableAutopay={disableAutopay}
                    />
                  ))}
                  {enrollments.length === 0 ? (
                    <p className="text-sm domus-muted">
                      No autopay enrollments yet. Enable autopay from your Charges section.
                    </p>
                  ) : null}
                </div>
              )
            },
            bank: {
              title: "Bank Account",
              description: "Manage where your Stripe payouts are delivered.",
              content: (
                <BankSettings
                  stripeConnected={profile.stripeOnboardingComplete}
                  stripeAccountId={profile.stripeAccountId}
                  role={role === "tenant" ? "owner" : role}
                  onGetExpressDashboardUrl={getExpressDashboardUrl}
                />
              )
            },
            notifications: {
              title: "Notifications",
              description: "Choose how you want Domus to contact you.",
              content: (
                <NotificationPreferences
                  options={NOTIFICATION_PREFERENCE_OPTIONS}
                  preferences={notificationPreferences}
                  onUpdatePreference={saveNotificationPreference}
                />
              )
            },
            appearance: {
              title: "Appearance",
              content: <ThemeSettingsPanel />
            },
            security: {
              title: "Security",
              content: <PasswordSettings />
            }
          }}
        />
      </div>
    </main>
  );
}
