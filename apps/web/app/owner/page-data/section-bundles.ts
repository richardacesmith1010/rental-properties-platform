import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { getAdminMaintenanceTickets } from "@/lib/maintenance";
import { getOwnerInvitations } from "@/lib/invitations";
import { getOwnerDocumentsData } from "@/lib/documents";
import { getInboxThreadsForUser } from "@/lib/inbox";
import { getAutomationRulesForUser, getAutomationTemplates } from "@/lib/automations";
import { getRentalListingsForUser } from "@/lib/leasing";
import { getApplicationsForUser } from "@/lib/applications";
import { getOwnerVendors } from "@/lib/vendors";
import { getOwnerExpenseData } from "@/lib/expenses";
import { getOwnerAnalyticsData } from "@/lib/analytics";
import { getRecentAuditLogs } from "@/lib/audit";
import { getRentIncreaseHistory } from "@/lib/rent-increases";
import { getDistributionHistory, getFinancialActivityFeed } from "@/lib/distributions";
import { getPendingChangeRequests } from "@/lib/distribution-approvals";
import { getPendingWithdrawals } from "@/lib/withdrawals";
import { arePropertyOwnersConnected } from "@/lib/stripe-connect";
import { getNewFeedbackCountForOwner } from "@/lib/feedback";
import { getOwnershipMembersForAccount, getPendingAccountDeleteRequests, getPendingAccountRenameRequests, type OwnershipAccountDTO } from "@/lib/ownership";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import { getPendingLLCInvitationsForAccount } from "@/lib/llc-invitations";
import { getManagerPaymentsDashboardData } from "@/lib/manager-payments-data";
import type { OwnerBundleId, ResolvedOwnerRequest } from "./types";

export async function hasOwnerManagerPaymentSection(propertyIds: string[]): Promise<boolean> {
  if (propertyIds.length === 0) {
    return false;
  }

  const admin = createAdminClient();
  const { data: assignments, error: assignmentsError } = await admin
    .from("property_managers")
    .select("manager_profile_id")
    .in("property_id", propertyIds)
    .eq("active", true);

  if (assignmentsError) {
    if (isMissingSchemaError(assignmentsError)) {
      return false;
    }

    console.error("[owner-page-data] Failed to load manager assignments for section availability:", assignmentsError);
    return false;
  }

  const managerIds = Array.from(
    new Set(
      (assignments ?? [])
        .map((assignment) => assignment.manager_profile_id)
        .filter((managerId): managerId is string => Boolean(managerId))
    )
  );

  if (managerIds.length === 0) {
    return false;
  }

  const { count, error: profileError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .in("id", managerIds)
    .not("email", "is", null);

  if (profileError) {
    if (isMissingSchemaError(profileError)) {
      return false;
    }

    console.error("[owner-page-data] Failed to load manager profiles for section availability:", profileError);
    return false;
  }

  return (count ?? 0) > 0;
}

// One section-bundle execution path for initial renders and fetch-style actions.
export async function loadOwnerSectionBundles(params: {
  userId: string;
  userEmail: string;
  request: ResolvedOwnerRequest;
  ownershipAccounts: OwnershipAccountDTO[];
  capabilities: FeatureCapabilitiesDTO;
  bundles: Set<OwnerBundleId>;
  connectedPropertyIds: Promise<string[]>;
  measure: <T>(name: string, work: () => Promise<T>, meta?: Record<string, unknown>) => Promise<T>;
}) {
  const { request, ownershipAccounts, capabilities, measure: measureOwnerWithRequest } = params;
  const activeAccountId = request.activeAccountId;
  const isLlcAccount = ownershipAccounts.find(account => account.id === activeAccountId)?.accountType === "llc";
  const hasBundle = (id: OwnerBundleId) => params.bundles.has(id);
  const [
    tickets,
    invitations,
    documents,
    inboxThreads,
    automationTemplates,
    automationRules,
    listings,
    applications,
    vendors,
    expenses,
    managerPaymentsData,
    analytics,
    auditLogs,
    rentIncreaseHistory,
    newFeedbackCount,
    ownershipMembers,
    pendingLlcInvitations,
    distributionHistory,
    pendingChangeRequests,
    pendingWithdrawals,
    financialActivityFeed,
    pendingAccountRenameRequests,
    pendingAccountDeleteRequests,
    ownerConnectedMap
  ] = await Promise.all([
    hasBundle("tickets")
      ? measureOwnerWithRequest("maintenance.admin-tickets", async () => getAdminMaintenanceTickets(
          params.userId,
          request.activeAccountId,
          await params.connectedPropertyIds
        ))
      : Promise.resolve(undefined),
    hasBundle("invitations")
      ? measureOwnerWithRequest("invitations.owner", () => getOwnerInvitations(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("documents")
      ? capabilities.documentsEnabled
        ? measureOwnerWithRequest("documents.owner", () => getOwnerDocumentsData(params.userId, request.activeAccountId))
        : Promise.resolve({
            templates: [],
            packets: [],
            propertyFiles: [],
            propertyFilesEnabled: false,
            propertyFilesWarning: "Property file vault is not enabled yet."
          })
      : Promise.resolve(undefined),
    hasBundle("inbox") && capabilities.inboxThreadsEnabled
      ? measureOwnerWithRequest("inbox.threads", () => getInboxThreadsForUser(params.userId))
      : Promise.resolve(undefined),
    hasBundle("automations") && capabilities.automationsEnabled
      ? measureOwnerWithRequest("automations.templates", () => getAutomationTemplates())
      : Promise.resolve(undefined),
    hasBundle("automations") && capabilities.automationsEnabled
      ? measureOwnerWithRequest("automations.rules", () => getAutomationRulesForUser(params.userId))
      : Promise.resolve(undefined),
    hasBundle("listings") && capabilities.leasingPipelineEnabled
      ? measureOwnerWithRequest("leasing.listings", () => getRentalListingsForUser(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("applications") && capabilities.leasingPipelineEnabled
      ? measureOwnerWithRequest("applications.user", () => getApplicationsForUser(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("vendors") && capabilities.vendorWorkflowEnabled
      ? measureOwnerWithRequest("vendors.owner", () => getOwnerVendors(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("expenses")
      ? measureOwnerWithRequest("expenses.owner", () => getOwnerExpenseData(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("manager-payments")
      ? measureOwnerWithRequest(
          "manager-payments.dashboard",
          () => getManagerPaymentsDashboardData(params.userId, request.activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("analytics")
      ? measureOwnerWithRequest("analytics.owner", () => getOwnerAnalyticsData(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("audit-logs")
      ? measureOwnerWithRequest("audit.recent", () => getRecentAuditLogs(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("rent-increases")
      ? measureOwnerWithRequest("rent-increases.history", () => getRentIncreaseHistory(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("feedback")
      ? measureOwnerWithRequest("feedback.new-count", () => getNewFeedbackCountForOwner(params.userEmail), {
          userId: params.userId
        })
      : Promise.resolve(undefined),
    hasBundle("ownership-members") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.members",
          () => getOwnershipMembersForAccount(params.userId, activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-members") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.pending-llc-invitations",
          () => getPendingLLCInvitationsForAccount(params.userId, activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.distribution-history",
          () => getDistributionHistory(activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.pending-change-requests",
          () => getPendingChangeRequests(activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.pending-withdrawals",
          () => getPendingWithdrawals(activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.financial-activity",
          () => getFinancialActivityFeed(activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance")
      ? measureOwnerWithRequest(
          "ownership.pending-rename-requests",
          () => getPendingAccountRenameRequests(ownershipAccounts.map((account) => account.id)),
          {
            ownershipAccountCount: ownershipAccounts.length
          }
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance")
      ? measureOwnerWithRequest(
          "ownership.pending-delete-requests",
          () => getPendingAccountDeleteRequests(ownershipAccounts.map((account) => account.id)),
          {
            ownershipAccountCount: ownershipAccounts.length
          }
        )
      : Promise.resolve(undefined),
    hasBundle("owner-connected-map")
      ? params.connectedPropertyIds.then((propertyIds) =>
          measureOwnerWithRequest(
            "stripe-connect.owner-map",
            () => arePropertyOwnersConnected(propertyIds),
            {
              propertyCount: propertyIds.length
            }
          )
        )
      : Promise.resolve(undefined)
  ]);
  return {
    tickets,
    invitations,
    documents,
    inboxThreads,
    automationTemplates,
    automationRules,
    listings,
    applications,
    vendors,
    expenses,
    managerPaymentsData,
    analytics,
    auditLogs,
    rentIncreaseHistory,
    newFeedbackCount,
    ownershipMembers,
    pendingLlcInvitations,
    distributionHistory,
    pendingChangeRequests,
    pendingWithdrawals,
    financialActivityFeed,
    pendingAccountRenameRequests,
    pendingAccountDeleteRequests,
    ownerConnectedMap,
    applicationCount: applications?.length,
    approvedApplicationCount: applications?.filter(application => application.status === "approved").length
  };
}
