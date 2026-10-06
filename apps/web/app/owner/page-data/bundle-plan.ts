import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import type { OwnerDashboardSectionAvailability } from "@/components/dashboard/types";
import type { OwnerBundleId } from "./types";
export function buildOwnerBundlePlan(params: {
  capabilities: FeatureCapabilitiesDTO;
  initialOwnerHomePage: boolean;
  deferHomeOnlyBundles?: boolean;
  initialSectionId: string | null;
  isLlcAccount: boolean;
  sectionAvailability: OwnerDashboardSectionAvailability;
}): {
  bundles: Set<OwnerBundleId>;
  sectionAvailability: OwnerDashboardSectionAvailability;
} {
  const bundles = new Set<OwnerBundleId>([
    "dashboard",
    "portfolio",
    "announcement-properties",
    "notifications",
    "notification-preferences",
    "rent-collection-status",
  ]);

  if (params.initialOwnerHomePage) {
    if (!params.deferHomeOnlyBundles) {
      bundles.add("invitations");
      bundles.add("tickets");
      bundles.add("expenses");
      bundles.add("manager-payments");
      bundles.add("feedback");
    }

    if (params.isLlcAccount) {
      bundles.add("ownership-members");
    }

    return {
      bundles,
      sectionAvailability: params.sectionAvailability
    };
  }

  switch (params.initialSectionId) {
    case "overview":
      bundles.add("tickets");
      break;
    case "charges":
      bundles.add("owner-connected-map");
      break;
    case "maintenance":
      bundles.add("tickets");
      if (params.capabilities.vendorWorkflowEnabled) {
        bundles.add("vendors");
      }
      break;
    case "leasing":
      bundles.add("invitations");
      if (params.capabilities.documentsEnabled) {
        bundles.add("documents");
      }
      if (params.capabilities.leasingPipelineEnabled) {
        bundles.add("listings");
      }
      break;
    case "applications":
      if (params.capabilities.leasingPipelineEnabled) {
        bundles.add("applications");
        bundles.add("listings");
      }
      break;
    case "inbox":
      if (params.capabilities.inboxThreadsEnabled) {
        bundles.add("inbox");
      }
      break;
    case "automations":
      if (params.capabilities.automationsEnabled) {
        bundles.add("automations");
      }
      break;
    case "activity":
      bundles.add("audit-logs");
      break;
    case "ownership":
      bundles.add("ownership-members");
      bundles.add("ownership-governance");
      break;
    case "members":
      bundles.add("ownership-members");
      break;
    case "invitations":
      bundles.add("invitations");
      break;
    case "documents":
      if (params.capabilities.documentsEnabled) {
        bundles.add("documents");
      }
      break;
    case "vendors":
      if (params.capabilities.vendorWorkflowEnabled) {
        bundles.add("vendors");
      }
      break;
    case "expenses":
      bundles.add("expenses");
      if (params.capabilities.vendorWorkflowEnabled) {
        bundles.add("vendors");
      }
      if (params.capabilities.documentsEnabled) {
        bundles.add("documents");
      }
      break;
    case "analytics":
      bundles.add("analytics");
      break;
    case "leases":
      bundles.add("rent-increases");
      break;
    case "manager-payments":
      bundles.add("manager-payments");
      break;
    default:
      break;
  }

  return {
    bundles,
    sectionAvailability: params.sectionAvailability
  };
}

export function buildOwnerSectionAvailability(params: {
  capabilities: FeatureCapabilitiesDTO;
  hasManagedProperties: boolean;
  hasManagerPaymentsSection: boolean;
  isLlcAccount: boolean;
}): OwnerDashboardSectionAvailability {
  return {
    hasActivitySection: true,
    hasAnalyticsSection: params.hasManagedProperties,
    hasApplicationsSection: params.capabilities.leasingPipelineEnabled,
    hasAutomationsSection: true,
    hasDocumentsSection: true,
    hasExpensesSection: true,
    hasInboxSection: true,
    hasInvitationsSection: true,
    hasLeasingSection: true,
    hasManagerPaymentsSection: params.hasManagerPaymentsSection,
    hasMembersSection: params.capabilities.ownershipEnabled && params.isLlcAccount,
    hasNotificationsSection: true,
    hasOwnershipSection: true,
    hasVendorsSection: true
  };
}
