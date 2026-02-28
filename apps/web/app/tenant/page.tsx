import {
  createCheckoutForCharge,
  createMaintenanceTicket,
  signOut,
  markNotificationRead,
  signDocumentPacket
} from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { getTenantPaymentData } from "@/lib/tenant-payments";
import { getTenantMaintenanceData } from "@/lib/maintenance";
import { getTenantDocumentsData } from "@/lib/documents";
import { getNotificationsForUser } from "@/lib/notifications";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { TicketForm } from "@/components/dashboard/ticket-form";
import { MaintenanceSection } from "@/components/dashboard/maintenance-section";
import { TenantDocumentsSection } from "@/components/dashboard/tenant-documents-section";
import { NotificationsSection } from "@/components/dashboard/notifications-section";
import { LogOut, CreditCard } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TenantPage() {
  const { user } = await requireRole(["tenant"]);
  const capabilities = await getFeatureCapabilities();

  const [paymentData, maintenanceData, documentsData, notifications] = await Promise.all([
    getTenantPaymentData(user.id),
    getTenantMaintenanceData(user.id),
    capabilities.documentsEnabled
      ? getTenantDocumentsData(user.id)
      : Promise.resolve({ packets: [] }),
    capabilities.notificationsEnabled
      ? getNotificationsForUser(user.id)
      : Promise.resolve([])
  ]);

  return (
    <div className="min-h-screen bg-[#fafafa] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header card */}
        <Card>
          <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-5">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">
                Tenant Workspace
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Pay rent, track maintenance, and more.
              </p>
            </div>
            <form action={signOut}>
              <SubmitButton variant="outline" size="sm">
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sign out
              </SubmitButton>
            </form>
          </CardContent>
        </Card>

        {/* Outstanding Rent Charges */}
        <Card>
          <CardHeader>
            <CardTitle>Outstanding Rent Charges</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentData.charges.length === 0 ? (
              <EmptyState message="You currently have no pending rent charges." />
            ) : (
              <div>
                {paymentData.charges.map((charge, i) => (
                  <DataRow key={charge.id} last={i === paymentData.charges.length - 1}>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        {charge.propertyLabel}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">Due {charge.dueDate}</p>
                      <Badge
                        variant={charge.status === "late" ? "destructive" : "warning"}
                        className="mt-1"
                      >
                        {charge.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-zinc-900">
                        ${(charge.amountCents / 100).toLocaleString()}
                      </p>
                      <form action={createCheckoutForCharge} className="mt-2">
                        <input type="hidden" name="chargeId" value={charge.id} />
                        <SubmitButton size="sm">
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

        {/* Submit Maintenance Request */}
        <TicketForm
          units={maintenanceData.units}
          onCreateTicket={createMaintenanceTicket}
        />

        {/* My Maintenance Requests */}
        <MaintenanceSection
          tickets={maintenanceData.tickets}
          showControls={false}
          photoWorkflowEnabled={capabilities.photoWorkflowEnabled}
          photoWorkflowWarning={capabilities.warnings.photoWorkflow}
        />

        <TenantDocumentsSection
          packets={documentsData.packets}
          onSignPacket={signDocumentPacket}
          isFeatureReady={capabilities.documentsEnabled}
          featureWarning={capabilities.warnings.documents}
          assetAccessEnabled={capabilities.documentAssetAccessEnabled}
          assetAccessWarning={
            capabilities.documentsEnabled && !capabilities.documentAssetAccessEnabled
              ? "Document records are available, but secure file links are not configured yet."
              : null
          }
        />

        {capabilities.notificationsEnabled ? (
          <NotificationsSection
            notifications={notifications}
            onMarkRead={markNotificationRead}
          />
        ) : (
          <FeatureWarning
            title="Notifications Unavailable"
            message={
              capabilities.warnings.notifications ??
              "Notifications are not ready yet. Complete setup and reload."
            }
          />
        )}
      </div>
    </div>
  );
}
