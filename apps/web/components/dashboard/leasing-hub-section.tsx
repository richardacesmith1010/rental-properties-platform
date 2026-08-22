"use client";

import { useMemo } from "react";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { EmptyState } from "@/components/shared/empty-state";
import type { ActionState } from "@/app/actions";
import type { InvitationListItem } from "@/lib/invitations";
import type { RentalListingDTO } from "@/lib/leasing";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { PortfolioData } from "@/lib/portfolio";
import { formatCurrency, formatDate } from "@/lib/format";
import { Alert } from "@/components/ui/alert";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface LeasingHubSectionProps {
  portfolio: PortfolioData;
  invitations: InvitationListItem[];
  documents: OwnerDocumentsData;
  listings: RentalListingDTO[];
  applicationCount: number;
  approvedApplicationCount: number;
  chargeCount: number;
  pipelineReady?: boolean;
  pipelineWarning?: string | null;
  onOpenSection?: (sectionId: string) => void;
  onCreateListing?: StatefulAction;
  onUpdateListingStatus?: StatefulAction;
}

interface LeasingStage {
  id: string;
  label: string;
  description: string;
  done: boolean;
  metric: string;
  targetSection: string;
  actionLabel: string;
}

const listingStatuses: Array<RentalListingDTO["status"]> = ["draft", "published", "paused", "archived"];

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Listing actions are unavailable right now."
});

function listingStatusBadgeVariant(status: RentalListingDTO["status"]) {
  if (status === "published") return "success" as const;
  if (status === "paused") return "warning" as const;
  if (status === "archived") return "outline" as const;
  return "outline" as const;
}

function buildLeasingStages(params: {
  portfolio: PortfolioData;
  invitations: InvitationListItem[];
  documents: OwnerDocumentsData;
  applicationCount: number;
  approvedApplicationCount: number;
  chargeCount: number;
}): LeasingStage[] {
  const tenantInvites = params.invitations.filter((invite) => invite.role === "tenant");
  const pendingTenantInvites = tenantInvites.filter((invite) => invite.status === "pending");
  const activeLeases = params.portfolio.leases.filter((lease) => lease.active);
  const sentOrSignedPackets = params.documents.packets.filter(
    (packet) => packet.status === "sent" || packet.status === "signed"
  );

  return [
    {
      id: "properties_ready",
      label: "Property + Unit Ready",
      description: "Set up at least one active property and unit before inviting tenants.",
      done: params.portfolio.properties.length > 0 && params.portfolio.units.length > 0,
      metric: `${params.portfolio.properties.length} properties / ${params.portfolio.units.length} units`,
      targetSection: "operations",
      actionLabel: "Set up property"
    },
    {
      id: "tenant_invited",
      label: "Tenant Invited",
      description: "Invite the tenant who will apply/sign for the lease.",
      done: tenantInvites.length > 0,
      metric: `${tenantInvites.length} invites (${pendingTenantInvites.length} pending)`,
      targetSection: "invitations",
      actionLabel: "Invite tenant"
    },
    {
      id: "applications_reviewed",
      label: "Applications Reviewed",
      description: "Review and approve tenant applications before creating the lease.",
      done: params.approvedApplicationCount > 0,
      metric: `${params.applicationCount} applications (${params.approvedApplicationCount} approved)`,
      targetSection: "applications",
      actionLabel: "Review applications"
    },
    {
      id: "lease_created",
      label: "Lease Created",
      description: "Create and activate the lease terms for the selected unit.",
      done: activeLeases.length > 0,
      metric: `${activeLeases.length} active leases`,
      targetSection: "leases",
      actionLabel: "Create lease"
    },
    {
      id: "docs_sent",
      label: "Docs Sent for Signature",
      description: "Send lease packet(s) and confirm signature workflow is in motion.",
      done: sentOrSignedPackets.length > 0,
      metric: `${sentOrSignedPackets.length} packets sent/signed`,
      targetSection: "documents",
      actionLabel: "Send documents"
    },
    {
      id: "billing_live",
      label: "Billing Live",
      description: "Verify first rent charge appears so payment collection can begin.",
      done: params.chargeCount > 0,
      metric: `${params.chargeCount} open charges`,
      targetSection: "charges",
      actionLabel: "Review charges"
    }
  ];
}

function currentStepLabel(stages: LeasingStage[]) {
  const pending = stages.find((stage) => !stage.done);
  if (!pending) {
    return "Leasing workflow complete for current portfolio.";
  }
  return `Next best action: ${pending.label}`;
}

function ListingRow({
  listing,
  onUpdateListingStatus
}: {
  listing: RentalListingDTO;
  onUpdateListingStatus?: StatefulAction;
}) {
  const [state, action] = useFormState(onUpdateListingStatus ?? unavailableAction, null);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">{listing.headline}</p>
          <p className="text-xs text-zinc-500">{listing.propertyName}</p>
        </div>
        <Badge variant={listingStatusBadgeVariant(listing.status)} className="uppercase">
          {listing.status}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-zinc-600">{listing.description ?? "No description provided."}</p>
      <p className="mt-1 text-xs text-zinc-600">
        <span className="font-semibold">Rent:</span> {formatCurrency(listing.askingRentCents)}
        {listing.availableOn ? ` • Available ${formatDate(listing.availableOn)}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
        <span>{listing.bedroomCount ?? "?"} beds</span>
        <span>{listing.bathroomCount ?? "?"} baths</span>
      </div>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="listingId" value={listing.id} />
        <Select name="status" defaultValue={listing.status} className="w-[160px]">
          {listingStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
        <SubmitButton size="sm" variant="outline" title="Save listing status update.">
          Update status
        </SubmitButton>
      </form>
      {state && !state.success && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
      {state && state.success && <p className="mt-2 text-xs text-emerald-600">Listing status updated.</p>}
    </div>
  );
}

export function LeasingHubSection({
  portfolio,
  invitations,
  documents,
  listings,
  applicationCount,
  approvedApplicationCount,
  chargeCount,
  pipelineReady = true,
  pipelineWarning = null,
  onOpenSection,
  onCreateListing,
  onUpdateListingStatus
}: LeasingHubSectionProps) {
  const [createListingState, createListingAction] = useFormState(
    onCreateListing ?? unavailableAction,
    null
  );

  const stages = buildLeasingStages({
    portfolio,
    invitations,
    documents,
    applicationCount,
    approvedApplicationCount,
    chargeCount
  });

  const listingCounts = useMemo(() => {
    const counts: Record<RentalListingDTO["status"], number> = {
      draft: 0,
      published: 0,
      paused: 0,
      archived: 0
    };
    for (const listing of listings) {
      counts[listing.status] += 1;
    }
    return counts;
  }, [listings]);

  return (
    <div id="leasing" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Leasing Hub</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Use this workflow to move from empty unit to signed lease and active billing with minimal context switching.
          </p>
          {!pipelineReady && (
            <Alert variant="warning" className="text-xs font-normal">
              {pipelineWarning ?? "Pipeline persistence is not live yet. Workflow progress uses currently available records only."}
            </Alert>
          )}
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground">
            {currentStepLabel(stages)}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {stages.map((stage) => (
          <Card key={stage.id}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--ink)]">{stage.label}</p>
                <Badge variant={stage.done ? "success" : "outline"}>{stage.done ? "Done" : "Pending"}</Badge>
              </div>
              <p className="text-xs text-zinc-600">{stage.description}</p>
              <p className="text-xs font-medium text-zinc-700">{stage.metric}</p>
              <Button
                type="button"
                size="sm"
                variant={stage.done ? "outline" : "default"}
                title={`Go to ${stage.targetSection} to continue this leasing step.`}
                onClick={() => onOpenSection?.(stage.targetSection)}
              >
                {stage.actionLabel}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Listings</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Draft {listingCounts.draft}</Badge>
            <Badge variant="success">Published {listingCounts.published}</Badge>
            <Badge variant="warning">Paused {listingCounts.paused}</Badge>
            <Badge variant="outline">Archived {listingCounts.archived}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={createListingAction} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Create listing</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select name="propertyId" required>
                <option value="">Select property</option>
                {portfolio.properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
              <Input name="headline" placeholder="Headline" required />
              <Input name="askingRentDollars" placeholder="Asking rent (USD)" inputMode="decimal" required />
              <Input name="availableOn" type="date" placeholder="Available date" />
              <Input name="bedroomCount" placeholder="Bedrooms" inputMode="decimal" />
              <Input name="bathroomCount" placeholder="Bathrooms" inputMode="decimal" />
            </div>
            <Input name="description" className="mt-2" placeholder="Description" />
            <div className="mt-2 flex justify-end">
              <SubmitButton size="sm" title="Create a new rental listing in draft status.">
                Create listing
              </SubmitButton>
            </div>
              {createListingState && !createListingState.success && (
                <p className="mt-2 text-xs text-red-600">{createListingState.error}</p>
              )}
              {createListingState && createListingState.success && (
                <p className="mt-2 text-xs text-emerald-600">Listing created in draft status.</p>
              )}
            </form>

          {listings.length === 0 ? (
            <EmptyState message="No rental listings yet. Create a listing to start finding tenants." />
          ) : (
            <div className="space-y-2">
              {listings.map((listing) => (
                <ListingRow
                  key={listing.id}
                  listing={listing}
                  onUpdateListingStatus={onUpdateListingStatus}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
