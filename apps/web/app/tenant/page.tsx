import Link from "next/link";
import {
  addTicketComment,
  createMaintenanceTicket,
  deleteMaintenancePhoto,
  disableAutopay,
  markAllNotificationsRead,
  markNotificationRead,
  requestManualPaymentConfirmation,
  sendInboxMessage,
  signDocumentPacket,
  signOut,
  payWithCard,
  setupAutopay,
  uploadMaintenancePhoto
} from "@/app/actions";
import { payWithACH } from "@/app/actions/charges";
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
import { TenantOverview } from "@/components/dashboard/tenant-overview";
import { TenantRentCard } from "@/components/dashboard/tenant-rent-card";
import { EmptyState as DashboardEmptyState } from "@/components/shared/empty-state";
import { StripeTestModeBanner } from "@/components/shared/stripe-test-mode-banner";
import { formatCurrency, formatDate, formatDateTime, formatUnitLabel } from "@/lib/format";
import { arePropertyOwnersConnected } from "@/lib/stripe-connect";
import { CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { SectionNotFoundState } from "@/components/dashboard/section-renderer-support";
import { TenantBottomBar } from "@/components/dashboard/tenant-bottom-bar";
import { getTenantPayState, getNextRentDueDate } from "@/lib/tenant-pay-state";

export const dynamic = "force-dynamic";

type TenantSection = "overview" | "charges" | "maintenance" | "documents" | "notifications";

const tenantSectionLabel: Record<TenantSection, string> = {
  overview: "Home",
  charges: "Rent",
  maintenance: "Problems",
  documents: "Lease",
  notifications: "Messages"
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
  const hasUnknownSection = sectionValue !== null && !isTenantSection(sectionValue);
  const activeSection: TenantSection = isTenantSection(sectionValue) ? sectionValue : "overview";
  const capabilities = await getFeatureCapabilities();

  const [
    paymentData,
    paymentHistory,
    leaseDetails,
    maintenanceData,
    documentsData,
    notifications,
    inboxThreads,
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
    getAutopayEnrollments(user.id)
  ]);

  const openTicketCount = maintenanceData.tickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "in_progress"
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
  const hasActiveLease = leaseDetails.length > 0;
  const ownerConnectedMap = await arePropertyOwnersConnected(
    paymentData.charges.map((charge) => charge.propertyId)
  );
  const currentCharge = paymentData.charges[0] ?? null;
  const ownerConnected = currentCharge ? ownerConnectedMap.get(currentCharge.propertyId) ?? false : false;
  const stripeConfigured = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const payState = getTenantPayState({
    charge: currentCharge,
    ownerConnected,
    stripeConfigured,
    lease: currentLease ? { monthlyRentCents: currentLease.monthlyRentCents, dueDayOfMonth: leaseDetails[0].dueDayOfMonth } : null,
    lastPayment: paymentHistory[0] ? { paidAt: paymentHistory[0].paidAt } : null
  });
  const rentDueDate = currentCharge?.dueDate ?? (leaseDetails[0] ? getNextRentDueDate(leaseDetails[0].dueDayOfMonth) : null);
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
      label: `${charge.propertyName} • ${formatUnitLabel(charge.unitNumber)}`,
      category: "Rent",
      href: "/tenant?section=charges",
      description: `${charge.status} • ${formatCurrency(charge.amountCents)}`,
      keywords: [charge.propertyName, charge.unitNumber, charge.status, charge.dueDate]
    })),
    ...leaseDetails.map((lease) => ({
      id: `lease:${lease.leaseId}`,
      label: `${lease.propertyName} • ${formatUnitLabel(lease.unitNumber)}`,
      category: "Lease",
      href: "/tenant?section=overview",
      description: `${formatDate(lease.startDate)} to ${formatDate(lease.endDate)}`,
      keywords: [lease.propertyName, lease.unitNumber, lease.leaseStatus]
    })),
    ...maintenanceData.tickets.map((ticket) => ({
      id: `ticket:${ticket.id}`,
      label: ticket.title,
      category: "Problems",
      href: "/tenant?section=maintenance",
      description: `${ticket.propertyName}${ticket.unitNumber ? ` • ${formatUnitLabel(ticket.unitNumber)}` : ""}`,
      keywords: [ticket.title, ticket.description, ticket.propertyName, ticket.unitNumber ?? ""]
    })),
    ...documentsData.packets.map((packet) => ({
      id: `document:${packet.id}`,
      label: packet.templateName,
      category: "Lease",
      href: "/tenant?section=documents",
      description: packet.signerStatus,
      keywords: [packet.templateName, packet.signerStatus]
    })),
    ...notifications.map((notification) => ({
      id: `notification:${notification.id}`,
      label: notification.title,
      category: "Messages",
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
        notifications={notifications}
        onDismissNotification={markNotificationRead}
        onClearAllNotifications={markAllNotificationsRead}
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
        notifications={notifications}
        onDismissNotification={markNotificationRead}
        onClearAllNotifications={markAllNotificationsRead}
        searchItems={searchItems}
      />

      <main id="main-content" className="relative flex-1 lg:ml-[260px]">
        <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-8">
          <div id="overview">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">{activeSection === "overview" ? `Hi, ${displayName}` : tenantSectionLabel[activeSection]}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">{activeSection === "overview" ? "Your rent, problems, and lease at a glance." : activeSection === "charges" ? "Pay rent and see what you've paid." : "Everything you need for your home."}</p>
          </div>
        </div>

        <div className="space-y-6 px-6 pb-24 pt-6 lg:px-8">
          <StripeTestModeBanner />
          {activeSection !== "overview" || hasUnknownSection ? (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--ink)]">
                {hasUnknownSection ? "Section not found" : tenantSectionLabel[activeSection]}
              </h2>
            </div>
          ) : null}

          {hasUnknownSection ? (
            <SectionNotFoundState activeSection={sectionValue ?? "unknown"} role="tenant" />
          ) : null}

          {!hasUnknownSection && activeSection === "overview" && (
            <div className="space-y-5">
              <TenantOverview
                userName={displayName}
                charges={paymentData.charges}
                nextCharge={nextCharge}
                lease={currentLease}
                openTicketCount={openTicketCount}
                tickets={maintenanceData.tickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress").map((ticket) => ({ id: ticket.id, title: ticket.title, status: ticket.status }))}
                payState={payState}
                rentDueDate={rentDueDate}
                rentAmountCents={currentLease?.monthlyRentCents}
                lastPaidAt={paymentHistory[0]?.paidAt ?? null}
                lateFeeCents={leaseDetails[0]?.lateFeeCents ?? 0}
                onPayCharge={payWithCard as (formData: FormData) => Promise<void>}
                onPayWithACH={payWithACH as (formData: FormData) => Promise<void>}
                onRequestManualPaymentConfirmation={requestManualPaymentConfirmation}
                hasActiveLease={hasActiveLease}
                autopayEnrollments={autopayEnrollments}
                onSetupAutopay={setupAutopay}
              />

            </div>
          )}

          {!hasUnknownSection && activeSection === "charges" && (
            <div className="space-y-6">
              <TenantRentCard charges={paymentData.charges} payState={payState} rentDueDate={rentDueDate} rentAmountCents={currentLease?.monthlyRentCents ?? null} lastPaidAt={paymentHistory[0]?.paidAt ?? null} lateFeeCents={leaseDetails[0]?.lateFeeCents ?? 0} onPayCharge={payWithCard as (formData: FormData) => Promise<void>} onPayWithACH={payWithACH as (formData: FormData) => Promise<void>} onRequestManualPaymentConfirmation={requestManualPaymentConfirmation} autopayEnrollments={autopayEnrollments} onSetupAutopay={setupAutopay} />
              <ChargesSection
                charges={paymentData.charges}
                onPayCharge={payWithCard as (formData: FormData) => Promise<void>}
                onPayWithACH={payWithACH as (formData: FormData) => Promise<void>}
                ownerConnectedMap={ownerConnectedMap}
                isTenantView
                autopayEnrollments={autopayEnrollments}
                onSetupAutopay={setupAutopay}
                onDisableAutopay={disableAutopay}
                hideTenantPaymentControls
              />
              <Card>
                <CardHeader>
                  <CardTitle>Past payments</CardTitle>
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
                          className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold tabular-nums text-[var(--ink)]">
                                {formatCurrency(payment.amountCents)}
                              </p>
                              <Badge variant="outline">
                                {payment.category === "late_fee" ? "Late Fee" : "Rent"}
                              </Badge>
                              <Badge variant="outline">{payment.method.toUpperCase()}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {payment.propertyName} • {formatUnitLabel(payment.unitNumber)}
                            </p>
                            <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">
                              Paid {formatDateTime(payment.paidAt)} • Due {formatDate(payment.dueDate)}
                            </p>
                            {payment.referenceNote ? (
                              <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">
                                Reference: {payment.referenceNote}
                              </p>
                            ) : null}
                          </div>
                          <Button asChild variant="outline">
                            <Link href={`/payments/receipt/${payment.chargeId}`} title="Open a printable payment receipt.">
                              View Receipt
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {!hasUnknownSection && activeSection === "maintenance" && (
            <>
              <TicketForm
                units={maintenanceData.units}
                onCreateTicket={createMaintenanceTicket}
                photoWorkflowEnabled={capabilities.photoWorkflowEnabled}
                photoWorkflowWarning={capabilities.warnings.photoWorkflow}
                viewerRole="tenant"
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

          {!hasUnknownSection && activeSection === "documents" && (
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

          {!hasUnknownSection && activeSection === "notifications" &&
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
      <TenantBottomBar activeItemId={activeSection} />
    </div>
  );
}
