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
  deleteAllFinancialData,
  deleteAllLeases,
  deleteAllManagers,
  deleteAllProperties,
  deleteAllTenants,
  fullAccountWipe,
  getExpressDashboardUrl,
  pauseNotificationEmails,
  resumeNotificationEmails,
  setupAutopay,
  updateNotificationPreferences,
  setManagerReminderPermission,
  updateProfile
} from "@/app/actions";
import { getAutopayEnrollments } from "@/app/actions/autopay";
import { AutopayCard } from "@/components/dashboard/autopay-card";
import { BankSettings } from "@/components/settings/bank-settings";
import { ManagerReminderPermissions, NotificationPreferences } from "@/components/settings/notification-preferences";
import { createAdminClient } from "@/lib/supabase/admin";
import { ThemeSettingsPanel } from "@/components/settings/theme-settings-panel";
import { FaceIdSettings } from "@/components/settings/face-id-settings";
import { PasswordSettings } from "@/components/settings/password-settings";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { AccountDataSettings } from "@/components/settings/account-data-settings";
import { YourDataSettings } from "@/components/settings/your-data-settings";
import { AskDomusSettings } from "@/components/settings/ask-domus-settings";
import { setAskDomusConsent } from "@/app/actions/ai-consent";
import { InstallDomusSettingsCard } from "@/components/pwa/install-prompt";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  getUserNotificationPreferenceSettings,
  NOTIFICATION_EMAIL_PREFERENCE_OPTIONS
} from "@/lib/notification-preferences";
import {
  getRentCollectionConnectHref,
  getRentCollectionConnectStatus
} from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

interface SettingsPageProps {
  searchParams?: Promise<{
    connect?: string | string[];
  }>;
}

export default async function SettingsPage(props: SettingsPageProps) {
  const searchParams = await props.searchParams;
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);
  const workspacePath = getRoleHomePath(role);
  const profile = await getUserProfileSummary(user.id);
  const consentResult = role === "owner" || role === "manager"
    ? await createAdminClient().from("profiles").select("ai_consent_at").eq("id", user.id).single()
    : null;
  if (consentResult?.error) throw new Error("We could not load Ask Domus settings.");
  const [enrollments, notificationPreferences] = await Promise.all([
    role === "tenant" ? getAutopayEnrollments(user.id) : Promise.resolve([]),
    getUserNotificationPreferenceSettings(user.id)
  ]);
  const rentCollectionStatus = role === "owner" ? await getRentCollectionConnectStatus(user.id) : null;
  const managerReminderAccounts: Array<{ id: string; name: string; enabled: boolean }> = [];
  if (role === "owner") {
    const admin = createAdminClient();
    const { data: memberships, error: membershipError } = await admin.from("ownership_account_members")
      .select("account_id").eq("profile_id", user.id).eq("member_role", "owner").eq("active", true);
    if (!membershipError && memberships?.length) {
      const accountIds = memberships.map((member) => member.account_id);
      const [{ data: accounts, error: accountError }, { data: homes, error: homeError }] = await Promise.all([
        admin.from("ownership_accounts").select("id, display_name, managers_can_send_reminders, managed_client")
          .in("id", accountIds),
        admin.from("properties").select("id, owner_account_id").in("owner_account_id", accountIds)
      ]);
      if (!accountError && !homeError && homes?.length) {
        const { data: managers, error: managerError } = await admin.from("property_managers")
          .select("property_id").in("property_id", homes.map((home) => home.id)).eq("active", true);
        if (!managerError) {
          const managedHomes = new Set((managers ?? []).map((manager) => manager.property_id));
          const accountIdsWithManagers = new Set(homes.filter((home) => managedHomes.has(home.id))
            .map((home) => home.owner_account_id));
          managerReminderAccounts.push(...(accounts ?? [])
            .filter((account) => !account.managed_client && accountIdsWithManagers.has(account.id))
            .map((account) => ({ id: account.id, name: account.display_name,
              enabled: account.managers_can_send_reminders })));
        }
      }
    }
  }
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
    <main id="main-content" className="app-surface min-h-screen px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">Settings</h1>
          <p className="text-sm text-[var(--ink-2)]">
            Manage your Domus experience and preferences.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={workspacePath} title="Return to your main workspace.">
                Back to Workspace
              </Link>
            </Button>
          </div>
        </header>

        {connectMessage === "ready" ? (
          <Alert variant="success" className="rounded-xl px-4 py-3">
            {role === "owner"
              ? "Rent payments are set up."
              : "Your payment setup is already ready."}
          </Alert>
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
                      No autopay enrollments yet. Enable autopay from your Payments section.
                    </p>
                  ) : null}
                </div>
              )
            },
            bank: {
              title: "Bank Account",
              description: "Manage where your payouts go.",
              content: (
                <BankSettings
                  stripeConnected={profile.stripeOnboardingComplete}
                  stripeAccountId={profile.stripeAccountId}
                  role={role === "tenant" ? "owner" : role}
                  onGetExpressDashboardUrl={getExpressDashboardUrl}
                  rentCollectionConnected={rentCollectionStatus?.connected ?? false}
                  rentCollectionConnectHref={getRentCollectionConnectHref(rentCollectionStatus)}
                  rentCollectionAccounts={rentCollectionStatus?.accounts ?? []}
                  legacyProfileTarget={rentCollectionStatus?.legacyProfileTarget ?? false}
                  profileConnected={rentCollectionStatus?.profileConnected ?? profile.stripeOnboardingComplete}
                />
              )
            },
            notifications: {
              title: "Notifications",
              description: "Choose how you want Domus to contact you.",
              content: (
                <div className="space-y-4">
                <NotificationPreferences
                  options={NOTIFICATION_EMAIL_PREFERENCE_OPTIONS}
                  settings={notificationPreferences}
                  onUpdatePreferences={updateNotificationPreferences}
                  onPauseNotifications={pauseNotificationEmails}
                  onResumeNotifications={resumeNotificationEmails}
                />
                {role === "owner" ? <ManagerReminderPermissions accounts={managerReminderAccounts}
                  onSetPermission={setManagerReminderPermission} /> : null}
                </div>
              )
            },
            askDomus: {
              title: "Ask Domus",
              content: <AskDomusSettings initialEnabled={Boolean(consentResult?.data?.ai_consent_at)}
                onSetConsent={setAskDomusConsent} />
            },
            appearance: {
              title: "Appearance",
              content: (
                <div className="space-y-4">
                  <ThemeSettingsPanel />
                  <InstallDomusSettingsCard />
                </div>
              )
            },
            security: {
              title: "Security",
              content: <div className="space-y-4"><FaceIdSettings /><PasswordSettings /></div>
            },
            yourData: {
              title: "Your data",
              content: <YourDataSettings />
            },
            account: {
              title: "Account & Data",
              description: "Manage your data. Destructive actions cannot be undone.",
              content: (
                <AccountDataSettings
                  onDeleteAllProperties={deleteAllProperties}
                  onDeleteAllTenants={deleteAllTenants}
                  onDeleteAllManagers={deleteAllManagers}
                  onDeleteAllLeases={deleteAllLeases}
                  onDeleteAllFinancialData={deleteAllFinancialData}
                  onFullAccountWipe={fullAccountWipe}
                />
              )
            }
          }}
        />
      </div>
    </main>
  );
}
