import Link from "next/link";
import {
  createCheckoutForCharge,
  createMaintenanceTicket,
  signOut,
  markNotificationRead,
  markAllNotificationsRead,
  signDocumentPacket
} from "@/app/actions";
import {
  getAuthenticatedUser,
  getCurrentUserRole,
  getRoleHomePath,
  getUserProfileSummary
} from "@/lib/auth";
import { getTenantPaymentData } from "@/lib/tenant-payments";
import { getTenantMaintenanceData } from "@/lib/maintenance";
import { getTenantDocumentsData } from "@/lib/documents";
import { getNotificationsForUser } from "@/lib/notifications";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidebarNav, MobileTopBar } from "@/components/dashboard/sidebar-nav";
import { KpiCard } from "@/components/shared/kpi-card";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { TicketForm } from "@/components/dashboard/ticket-form";
import { MaintenanceSection } from "@/components/dashboard/maintenance-section";
import { TenantDocumentsSection } from "@/components/dashboard/tenant-documents-section";
import { NotificationsSection } from "@/components/dashboard/notifications-section";
import { GamificationSummary } from "@/components/gamification/gamification-summary";
import { AchievementChecker } from "@/components/gamification/achievement-checker";
import { formatCurrency, formatDate } from "@/lib/format";
import { getUserGamification } from "@/lib/gamification";
import {
  ChevronLeft,
  ChevronRight,
  CreditCard
} from "lucide-react";
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
  notifications: "Notifications"
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

  const [paymentData, maintenanceData, documentsData, notifications, gamification] = await Promise.all([
    getTenantPaymentData(user.id),
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
    getUserGamification(user.id)
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

  return (
    <div className="app-surface flex min-h-screen flex-col lg:flex-row">
      <MobileTopBar
        userEmail={user.email ?? "unknown"}
        role="tenant"
        fullName={profile.fullName}
        nickname={profile.nickname}
        avatarUrl={profile.avatarUrl}
        onSignOut={signOut}
        unreadNotificationCount={unreadNotificationCount}
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
      />

      <main className="relative flex-1 lg:ml-[260px]">
        <AchievementChecker currentLevel={gamification.currentLevel} />
        <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-8">
          <div id="overview">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Tenant Workspace</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Manage rent, tickets, documents, and alerts in one place.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:max-w-md sm:items-end">
            <GamificationSummary
              totalXp={gamification.totalXp}
              currentLevel={gamification.currentLevel}
              streakCount={gamification.streakCount}
              role="tenant"
              className="w-full"
            />
            <Badge className="self-start border border-violet-200 bg-violet-50 text-violet-700 capitalize sm:self-end">
              tenant
            </Badge>
          </div>
        </div>

        <div className="space-y-6 px-6 pb-8 pt-6 lg:px-8">
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
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Snapshot</p>
                <p className="mt-1 text-xl font-bold text-zinc-900">
                  {formatCurrency(outstandingCents)} outstanding
                </p>
                <p className="text-sm text-zinc-600">
                  {paymentData.charges.length} open charge{paymentData.charges.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Outstanding Rent"
                  value={formatCurrency(outstandingCents)}
                  badge={`${paymentData.charges.length} open charge${paymentData.charges.length === 1 ? "" : "s"}`}
                  gradient="linear-gradient(135deg, #7c3aed, #10b981)"
                  alert={outstandingCents > 0}
                />
                <KpiCard
                  label="Late Charges"
                  value={lateChargeCount.toString()}
                  badge={lateChargeCount > 0 ? "Needs payment" : "All current"}
                  gradient="linear-gradient(135deg, #f59e0b, #ef4444)"
                  alert={lateChargeCount > 0}
                />
                <KpiCard
                  label="Open Tickets"
                  value={openTicketCount.toString()}
                  badge={`${maintenanceData.tickets.length} total`}
                  gradient="linear-gradient(135deg, #06b6d4, #3b82f6)"
                />
                <KpiCard
                  label="Pending Signatures"
                  value={pendingDocumentCount.toString()}
                  badge={`${unreadNotificationCount} unread alerts`}
                  gradient="linear-gradient(135deg, #10b981, #14b8a6)"
                />
              </div>
            </div>
          )}

          {activeSection === "charges" && (
            <Card id="charges">
              <CardHeader>
                <CardTitle>Outstanding Rent Charges</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentData.charges.length === 0 ? (
                  <EmptyState
                    message="No charges yet. Charges appear automatically when your lease is active."
                    showDom
                  />
                ) : (
                  <div>
                    {paymentData.charges.map((charge, i) => (
                      <DataRow key={charge.id} last={i === paymentData.charges.length - 1}>
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">
                            {charge.propertyLabel}
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-500">Due {formatDate(charge.dueDate)}</p>
                          <Badge
                            variant={charge.status === "late" ? "destructive" : "warning"}
                            className="mt-1"
                          >
                            {charge.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-zinc-900">
                            {formatCurrency(charge.amountCents)}
                          </p>
                          <form action={createCheckoutForCharge} className="mt-2">
                            <input type="hidden" name="chargeId" value={charge.id} />
                            <SubmitButton
                              size="sm"
                              title="Open secure checkout to pay this charge."
                            >
                              <CreditCard className="mr-2 h-3.5 w-3.5" />
                              Pay with Card
                            </SubmitButton>
                          </form>
                        </div>
                      </DataRow>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeSection === "maintenance" && (
            <>
              <TicketForm
                units={maintenanceData.units}
                onCreateTicket={createMaintenanceTicket}
              />

              <MaintenanceSection
                tickets={maintenanceData.tickets}
                showControls={false}
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
            (capabilities.notificationsEnabled ? (
              <NotificationsSection
                notifications={notifications}
                onMarkRead={markNotificationRead}
                onMarkAllRead={markAllNotificationsRead}
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
