import type { DashboardData } from "@/lib/dashboard";
import type { DashboardCapabilities } from "@/components/dashboard/types";
import type { UserProfileSummary, AppRole } from "@/lib/auth";
import type { OwnershipAccountDTO, ActiveLlcMembershipDTO, OwnershipMemberDTO, AccountDeleteRequestDTO, AccountRenameRequestDTO } from "@/lib/ownership";
import type { AnalyticsDashboardData } from "@/lib/analytics";
import type { NotificationPreferenceSettings } from "@/lib/notification-preferences";
import type { NotificationDTO } from "@/lib/notifications";
import type { AutomationRuleDTO, AutomationTemplateDTO } from "@/lib/automations";
import type { InboxThreadDTO } from "@/lib/inbox";
import type { RentalListingDTO } from "@/lib/leasing";
import type { ApplicationDTO } from "@/lib/applications";
import type { VendorDTO } from "@/lib/vendors";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { AuditLogEntry } from "@/lib/audit";
import type { DistributionHistoryEntry, FinancialActivityEvent } from "@/lib/distributions";
import type { DistributionChangeRequestDTO } from "@/lib/distribution-approvals";
import type { WithdrawalRequestDTO } from "@/lib/withdrawals";
import type { RentIncreaseEntry } from "@/lib/rent-increases";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { InvitationListItem } from "@/lib/invitations";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { LLCInvitationDTO } from "@/lib/llc-invitations";
import type { RentCollectionConnectStatus } from "@/lib/stripe-connect";
import type { PortfolioData } from "@/lib/portfolio";
import { getAdministeredPropertyOptions } from "@/lib/property-access";
import { getManagerPaymentsDashboardData } from "@/lib/manager-payments-data";

export type OwnerWorkflowMode = "daily_ops" | "new_property" | "new_tenant" | "new_manager" | "records";
export type OwnerBundleId =
  | "analytics"
  | "announcement-properties"
  | "applications"
  | "audit-logs"
  | "automations"
  | "dashboard"
  | "documents"
  | "expenses"
  | "feedback"
  | "inbox"
  | "invitations"
  | "manager-payments"
  | "notification-preferences"
  | "notifications"
  | "owner-connected-map"
  | "ownership-governance"
  | "ownership-members"
  | "portfolio"
  | "rent-collection-status"
  | "rent-increases"
  | "tickets"
  | "vendors"
  | "listings";

export interface OwnerPageSearchParams {
  generated?: string | string[];
  section?: string | string[];
  mode?: string | string[];
  account?: string | string[];
  property?: string | string[];
}

export interface ResolvedOwnerRequest {
  accountParam: string | null;
  activeAccountId: string | null;
  generatedMessage: string | null;
  hasExplicitSection: boolean;
  initialOwnerHomePage: boolean;
  initialOwnerWorkflowMode?: OwnerWorkflowMode;
  initialPropertyId: string | null;
  initialSectionId: string | null;
  requestedMode: string | null;
  requestedPropertyId: string | null;
  requestedSectionId: string | null;
}

interface OwnerPageResolvedBase {
  generatedMessage: string | null;
  initialOwnerHomePage: boolean;
  initialOwnerWorkflowMode?: OwnerWorkflowMode;
  initialPropertyId: string | null;
  initialSectionId: string | null;
  profile: UserProfileSummary;
  role: AppRole;
}

export interface OwnerPageNeedsOnboarding extends OwnerPageResolvedBase {
  status: "needs-onboarding";
  ownershipAccounts: OwnershipAccountDTO[];
}

export interface OwnerPageNeedsSetup extends OwnerPageResolvedBase {
  status: "needs-setup";
  ownershipAccounts: OwnershipAccountDTO[];
}

export interface OwnerPageRoleMismatch {
  status: "role-mismatch";
  role: AppRole;
}

export interface OwnerPageReadyData extends OwnerPageResolvedBase {
  status: "ready";
  activeAccountId: string | null;
  analytics?: AnalyticsDashboardData;
  announcementProperties?: Awaited<ReturnType<typeof getAdministeredPropertyOptions>>;
  applications?: ApplicationDTO[];
  applicationCount?: number;
  approvedApplicationCount?: number;
  auditLogs?: AuditLogEntry[];
  automationRules?: AutomationRuleDTO[];
  automationTemplates?: AutomationTemplateDTO[];
  capabilities: DashboardCapabilities;
  dashboard: DashboardData;
  distributionHistory?: DistributionHistoryEntry[];
  documents?: OwnerDocumentsData;
  expenses?: ExpenseDashboardData;
  financialActivityFeed?: FinancialActivityEvent[];
  inboxThreads?: InboxThreadDTO[];
  invitations?: InvitationListItem[];
  isEmpty: boolean;
  listings?: RentalListingDTO[];
  loadedBundles: OwnerBundleId[];
  llcPayoutMemberships?: ActiveLlcMembershipDTO[];
  managerPaymentsData?: Awaited<ReturnType<typeof getManagerPaymentsDashboardData>>;
  newFeedbackCount?: number;
  notificationPreferenceSettings?: NotificationPreferenceSettings | null;
  notifications?: NotificationDTO[];
  ownerConnectedMap?: Map<string, boolean>;
  ownershipAccounts: OwnershipAccountDTO[];
  ownershipMembers?: OwnershipMemberDTO[];
  pendingAccountDeleteRequests?: AccountDeleteRequestDTO[];
  pendingAccountRenameRequests?: AccountRenameRequestDTO[];
  pendingChangeRequests?: DistributionChangeRequestDTO[];
  pendingLlcInvitations?: LLCInvitationDTO[];
  pendingWithdrawals?: WithdrawalRequestDTO[];
  portfolio: PortfolioData;
  rentCollectionStatus: RentCollectionConnectStatus;
  rentIncreaseHistory?: RentIncreaseEntry[];
  tickets?: MaintenanceTicket[];
  vendors?: VendorDTO[];
}

export type OwnerPageLoadResult =
  | OwnerPageNeedsOnboarding
  | OwnerPageNeedsSetup
  | OwnerPageReadyData
  | OwnerPageRoleMismatch;
