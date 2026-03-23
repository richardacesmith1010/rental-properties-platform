import Link from "next/link";
import {
  addTicketComment,
  createCheckoutForCharge,
  createMaintenanceTicket,
  deleteMaintenancePhoto,
  disableAutopay,
  markAllNotificationsRead,
  markNotificationRead,
  requestManualPaymentConfirmation,
  sendInboxMessage,
  signDocumentPacket,
  signOut,
  setupAutopay,
  uploadMaintenancePhoto
} from "@/app/actions";
import { getAutopayEnrollments } from "@/app/actions/autopay";
import {
  getAuthenticatedUser,
  getCurrentUserRole,
  getRoleHomePath,
  getUserProfileSummary
} from "@/lib/auth";
import { getTenantPaymentData } from "@/lib/tenant-payments";
import { getTenantPaymentHistory } from "@/lib/payment-history";
import { getTenantLeaseDetails } from "@/lib/leases";
import { getTenantMaintenanceData } from "@/lib/maintenance";
import { getTenantDocumentsData } from "@/lib/documents";
import { getNotificationsForUser } from "@/lib/notifications";
import { getInboxThreadsForUser } from "@/lib/inbox";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { SidebarNav, MobileTopBar } from "@/components/dashboard/sidebar-nav";
import type { GlobalSearchItem } from "@/components/dashboard/global-search";
import { ChargesSection } from "@/components/dashboard/charges-section";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { TicketForm } from "@/components/dashboard/ticket-form";
import { MaintenanceSection } from "@/components/dashboard/maintenance-section";
import { TenantDocumentsSection } from "@/components/dashboard/tenant-documents-section";
import { InboxSection } from "@/components/dashboard/inbox-section";
import { TenantLeaseDetails } from "@/components/dashboard/tenant-lease-details";
import { TenantOverview } from "@/components/dashboard/tenant-overview";
import { EmptyState as DashboardEmptyState } from "@/components/shared/empty-state";
import { StripeTestModeBanner } from "@/components/shared/stripe-test-mode-banner";
import { GamificationSummary } from "@/components/gamification/gamification-summary";
import { AchievementChecker } from "@/components/gamification/achievement-checker";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { getUserGamification } from "@/lib/gamification";
import { arePropertyOwnersConnected } from "@/lib/stripe-connect";
import { ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type TenantSection = "overview" | "charges" | "maintenance" | "documents" | "notifications";

const tenantSectionOrder: TenantSection[] = [
  "overview",
  "charges",
  "maintenance",
  "documents",
  "notifications"
];

const tenantSectionLabel: Record<TenantSection, string> = {
  overview: "Overview",
  charges: "Charges",
  maintenance: "Maintenance",
  documents: "Documents",
  notifications: "Inbox"
};

function parseSearchParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

function isTenantSection(value: string | null): value is TenantSection {
  return value === "overview" ||
    value === "charges" ||
    value === "maintenance" ||
    value === "documents" ||
    value === "notifications";
}

function buildTenantHref(section: TenantSection) {
  const params = new URLSearchParams();
  params.set("section", section);
  return `/tenant?${params.toString()}`;
}

function getTenantDisplayName(params: {
  nickname?: string | null;
  fullName?: string | null;
  userEmail: string;
}) {
  const nickname = params.nickname?.trim();
  if (nickname) {
    return nickname;
  }

  const firstName = params.fullName?.trim().split(/\s+/)[0];
  if (firstName) {
    return firstName;
  }

  return params.userEmail;
}

interface TenantPageProps {
  searchParams?: {
    section?: string | string[];
  };
}

export default async function TenantPage({ searchParams }: TenantPageProps) {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);

  if (role !== "tenant") {
    redirect(getRoleHomePath(role));
  }

  const profile = await getUserProfileSummary(user.id);
  if (!profile.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const sectionValue = parseSearchParam(searchParams?.section);
  const activeSection: TenantSection = isTenantSection(sectionValue) ? sectionValue : "overview";
  const activeSectionIndex = tenantSectionOrder.indexOf(activeSection);
  const previousSection = activeSectionIndex > 0 ? tenantSectionOrder[activeSectionIndex - 1] : null;
  const nextSection = activeSectionIndex < tenantSectionOrder.length - 1
    ? tenantSectionOrder[activeSectionIndex + 1]
    : null;

  const capabilities = await getFeatureCapabilities();

  const [
    paymentData,
    paymentHistory,
    leaseDetails,
    maintenanceData,
    documentsData,
    notifications,
    inboxThreads,
    gamification,
    autopayEnrollments
  ] = await Promise.all([
    getTenantPaymentData(user.id),
    getTenantPaymentHistory(user.id),
    getTenantLeaseDetails(user.id),
    getTenantMaintenanceData(user.id),
    capabilities.documentsEnabled
      ? getTenantDocumentsData(user.id)
      : Promise.resolve({
          packets: [],
          files: [],
          propertyFilesEnabled: false,
          propertyFilesWarning: "Shared property files are not enabled yet."
        }),
    capabilities.notificationsEnabled
      ? getNotificationsForUser(user.id)
      : Promise.resolve([]),
    capabilities.inboxThreadsEnabled
      ? getInboxThreadsForUser(user.id)
      : Promise.resolve([]),
    getUserGamification(user.id),
    getAutopayEnrollments(user.id)
  ]);

  const outstandingCents = paymentData.charges.reduce(
    (sum, charge) => sum + charge.amountCents,
    0
  );
  const lateChargeCount = paymentData.charges.filter((charge) => charge.status === "late").length;
  const openTicketCount = maintenanceData.tickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "in_progress"
  ).length;
  const pendingDocumentCount = documentsData.packets.filter(
    (packet) => packet.signerStatus !== "signed"
  ).length;
  const unreadNotificationCount = notifications.filter((notification) => !notification.readAt).length;
  const displayName = getTenantDisplayName({
    nickname: profile.nickname,
    fullName: profile.fullName,
    userEmail: user.email ?? "Resident"
  });
  const nextCharge = paymentData.charges[0]
    ? {
        amountCents: paymentData.charges[0].amountCents,
        dueDate: paymentData.charges[0].dueDate
      }
    : null;
  const currentLease = leaseDetails[0]
    ? {
        startDate: leaseDetails[0].startDate,
        endDate: leaseDetails[0].endDate,
        propertyName: leaseDetails[0].propertyName,
        unitLabel: leaseDetails[0].unitNumber,
        monthlyRentCents: leaseDetails[0].monthlyRentCents
      }
    : null;
  const ownerConnectedMap = await arePropertyOwnersConnected(
    paymentData.charges.map((charge) => charge.propertyId)
  );
  const inboxProperties = Array.from(
    new Map(
      leaseDetails.map((lease) => [
        lease.propertyId,
        { id: lease.propertyId, name: lease.propertyName }
      ])
    ).values()
  );
  const searchItems: GlobalSearchItem[] = [
    ...paymentData.charges.map((charge) => ({
      id: `charge:${charge.id}`,
      label: `${charge.propertyName} • Unit ${charge.unitNumber}`,
      category: "Charges",
      href: "/tenant?section=charges",
      description: `${charge.status} • ${formatCurrency(charge.amountCents)}`,
      keywords: [charge.propertyName, charge.unitNumber, charge.status, charge.dueDate]
    })),
    ...leaseDetails.map((lease) => ({
      id: `lease:${lease.leaseId}`,
      label: `${lease.propertyName} • Unit ${lease.unitNumber}`,
      category: "Lease",
      href: "/tenant?section=overview",
      description: `${formatDate(lease.startDate)} to ${formatDate(lease.endDate)}`,
      keywords: [lease.propertyName, lease.unitNumber, lease.leaseStatus]
    })),
    ...maintenanceData.tickets.map((ticket) => ({
      id: `ticket:${ticket.id}`,
      label: ticket.title,
      category: "Maintenance",
      href: "/tenant?section=maintenance",
      description: `${ticket.propertyName}${ticket.unitNumber ? ` • Unit ${ticket.unitNumber}` : ""}`,
      keywords: [ticket.title, ticket.description, ticket.propertyName, ticket.unitNumber ?? ""]
    })),
    ...documentsData.packets.map((packet) => ({
      id: `document:${packet.id}`,
      label: packet.templateName,
      category: "Documents",
      href: "/tenant?section=documents",
      description: packet.signerStatus,
      keywords: [packet.templateName, packet.signerStatus]
    })),
    ...notifications.map((notification) => ({
      id: `notification:${notification.id}`,
      label: notification.title,
      category: "Notifications",
      href: "/tenant?section=notifications",
      description: notification.body,
      keywords: [notification.title, notification.body, notification.type]
    }))
  ];

  return (
    <div className="app-surface flex min-h-screen flex-col lg:flex-row">
      <MobileTopBar
        userEmail={user.email ?? "unknown"}
        role="tenant"
        fullName={profile.fullName}
        nickname={profile.nickname}
        avatarUrl={profile.avatarUrl}
        navPreset="tenant"
        activeItemId={activeSection}
        onSignOut={signOut}
        unreadNotificationCount={unreadNotificationCount}
        searchItems={searchItems}
      />

      <SidebarNav
        userEmail={user.email ?? "unknown"}
        role="tenant"
        fullName={profile.fullName}
        nickname={profile.nickname}
        avatarUrl={profile.avatarUrl}
        navPreset="tenant"
        onSignOut={signOut}
        activeItemId={activeSection}
        unreadNotificationCount={unreadNotificationCount}
        searchItems={searchItems}
      />

      <main id="main-content" className="relative flex-1 lg:ml-[260px]">
        <AchievementChecker currentLevel={gamification.currentLevel} />
        <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-8">
          <div id="overview">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              {maintenanceData.units[0]?.propertyName ?? "Tenant Portal"}
            </h1>
            {maintenanceData.units.length > 0 && (
              <p className="mt-1 text-sm text-zinc-500">
                {maintenanceData.units[0].propertyName} &middot; Unit {maintenanceData.units[0].unitNumber}
              </p>
            )}
          </div>
          {activeSection !== "overview" ? (
            <div className="flex w-full flex-col gap-3 sm:max-w-md sm:items-end">
              <GamificationSummary
                totalXp={gamification.totalXp}
                currentLevel={gamification.currentLevel}
                streakCount={gamification.streakCount}
                role="tenant"
                className="w-full"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-6 px-6 pb-8 pt-6 lg:px-8">
          <StripeTestModeBanner />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">
              {tenantSectionLabel[activeSection]}
            </h2>
            <div className="flex items-center gap-2">
              {previousSection ? (
                <Link
                  href={buildTenantHref(previousSection)}
                  className="inline-flex items-center justify-center rounded-md border border-zinc-200 p-2 text-zinc-700 hover:bg-zinc-50"
                  title="Previous section"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              ) : (
                <span className="inline-flex items-center justify-center rounded-md border border-zinc-200 p-2 text-zinc-300">
                  <ChevronLeft className="h-4 w-4" />
                </span>
              )}
              {nextSection ? (
                <Link
                  href={buildTenantHref(nextSection)}
                  className="inline-flex items-center justify-center rounded-md border border-zinc-200 p-2 text-zinc-700 hover:bg-zinc-50"
                  title="Next section"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="inline-flex items-center justify-center rounded-md border border-zinc-200 p-2 text-zinc-300">
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </div>
          </div>

          {activeSection === "overview" && (
            <div className="space-y-5">
        <TenantOverview
          userName={displayName}
          charges={paymentData.charges}
          nextCharge={nextCharge}
          lease={currentLease}
          openTicketCount={openTicketCount}
                buildSectionHref={buildTenantHref}
                onPayCharge={createCheckoutForCharge as (formData: FormData) => Promise<void>}
                onRequestManualPaymentConfirmation={requestManualPaymentConfirmation}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Open Tickets</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900">{openTicketCount}</p>
                  <p className="text-xs text-zinc-500">{maintenanceData.tickets.length} total</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Documents</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900">{pendingDocumentCount}</p>
                  <p className="text-xs text-zinc-500">pending signature{pendingDocumentCount === 1 ? "" : "s"}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Outstanding</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900">{formatCurrency(outstandingCents)}</p>
                  <p className="text-xs text-zinc-500">
                    {lateChargeCount > 0 ? `${lateChargeCount} overdue` : "current balance"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeSection === "charges" && (
            <div className="space-y-6">
              <TenantLeaseDetails leases={leaseDetails} />
              <ChargesSection
                charges={paymentData.charges}
                onPayCharge={createCheckoutForCharge as (formData: FormData) => Promise<void>}
                ownerConnectedMap={ownerConnectedMap}
                isTenantView
                autopayEnrollments={autopayEnrollments}
                onSetupAutopay={setupAutopay}
                onDisableAutopay={disableAutopay}
              />
              <Card>
                <CardHeader>
                  <CardTitle>Payment History</CardTitle>
                </CardHeader>
                <CardContent>
                  {paymentHistory.length === 0 ? (
                    <DashboardEmptyState
                      icon={CreditCard}
                      title="No payments yet"
                      description="No payments yet. Your payment history will appear here."
                    />
                  ) : (
                    <div className="space-y-3">
                      {paymentHistory.map((payment) => (
                        <div
                          key={payment.paymentId}
                          className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-zinc-900">
                                {formatCurrency(payment.amountCents)}
                              </p>
                              <Badge variant="outline">
                                {payment.category === "late_fee" ? "Late Fee" : "Rent"}
                              </Badge>
                              <Badge variant="outline">{payment.method.toUpperCase()}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-zinc-500">
                              {payment.propertyName} • Unit {payment.unitNumber}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              Paid {formatDateTime(payment.paidAt)} • Due {formatDate(payment.dueDate)}
                            </p>
                            {payment.referenceNote ? (
                              <p className="mt-1 text-xs text-zinc-500">
                                Reference: {payment.referenceNote}
                              </p>
                            ) : null}
                          </div>
                          <Link
                            href={`/payments/receipt/${payment.chargeId}`}
                            className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                            title="Open a printable payment receipt."
                          >
                            View Receipt
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeSection === "maintenance" && (
            <>
              <TicketForm
                units={maintenanceData.units}
                onCreateTicket={createMaintenanceTicket}
                photoWorkflowEnabled={capabilities.photoWorkflowEnabled}
                photoWorkflowWarning={capabilities.warnings.photoWorkflow}
              />

              <MaintenanceSection
                tickets={maintenanceData.tickets}
                showControls={false}
                currentUserId={user.id}
                viewerRole="tenant"
                onUploadPhoto={capabilities.photoWorkflowEnabled ? uploadMaintenancePhoto : undefined}
                onDeletePhoto={capabilities.photoWorkflowEnabled ? deleteMaintenancePhoto : undefined}
                onAddComment={addTicketComment}
                photoWorkflowEnabled={capabilities.photoWorkflowEnabled}
                photoWorkflowWarning={capabilities.warnings.photoWorkflow}
              />
            </>
          )}

          {activeSection === "documents" && (
            <TenantDocumentsSection
              packets={documentsData.packets}
              files={documentsData.files}
              onSignPacket={signDocumentPacket}
              isFeatureReady={capabilities.documentsEnabled}
              featureWarning={capabilities.warnings.documents}
              propertyFilesEnabled={documentsData.propertyFilesEnabled}
              propertyFilesWarning={documentsData.propertyFilesWarning}
              assetAccessEnabled={capabilities.documentAssetAccessEnabled}
              assetAccessWarning={
                capabilities.documentsEnabled && !capabilities.documentAssetAccessEnabled
                  ? "Document records are available, but secure file links are not configured yet."
                  : null
              }
            />
          )}

          {activeSection === "notifications" &&
            (capabilities.notificationsEnabled || capabilities.inboxThreadsEnabled ? (
              <InboxSection
                notifications={notifications}
                threads={inboxThreads}
                properties={inboxProperties}
                onMarkRead={markNotificationRead}
                onMarkAllRead={markAllNotificationsRead}
                onSendMessage={sendInboxMessage}
                threadsReady={capabilities.inboxThreadsEnabled}
                threadsWarning={capabilities.warnings.inboxThreads}
                messageSectionId="notifications"
              />
            ) : (
              <FeatureWarning
                title="Notifications Unavailable"
                message={
                  capabilities.warnings.notifications ??
                  "Notifications are not ready yet. Complete setup and reload."
                }
              />
            ))}
        </div>
      </main>
    </div>
  );
}
