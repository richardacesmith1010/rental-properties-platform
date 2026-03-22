import dynamic from "next/dynamic";
import { createElement } from "react";
import type { DashboardData } from "@/lib/dashboard";
import type { PortfolioData, PropertyListItem } from "@/lib/portfolio";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { InvitationListItem } from "@/lib/invitations";
import type { NotificationDTO } from "@/lib/notifications";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { VendorDTO } from "@/lib/vendors";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import type {
  AccountDeleteRequestDTO,
  AccountRenameRequestDTO,
  OwnershipAccountDTO,
  OwnershipMemberDTO
} from "@/lib/ownership";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { AutomationRuleDTO, AutomationTemplateDTO } from "@/lib/automations";
import type { InboxThreadDTO } from "@/lib/inbox";
import type { RentalListingDTO } from "@/lib/leasing";
import type { ApplicationDTO } from "@/lib/applications";
import type { AnalyticsDashboardData } from "@/lib/analytics";
import type { AuditLogEntry } from "@/lib/audit";
import type { RentIncreaseEntry } from "@/lib/rent-increases";
import type { DistributionHistoryEntry, FinancialActivityEvent } from "@/lib/distributions";
import type { DistributionChangeRequestDTO } from "@/lib/distribution-approvals";
import type { WithdrawalRequestDTO } from "@/lib/withdrawals";
import type {
  ManagerAssignmentOption,
  ManagerPaymentConfigDTO,
  ManagerPaymentDTO
} from "@/lib/manager-payments";
import type { ActionState } from "@/app/actions";

export type FormAction = (formData: FormData) => Promise<void>;
export type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export interface SectionRendererProps {
  activeSection: string;
  activeSectionLabel: string;
  occupancy: number;
  data: DashboardData;
  canManagePortfolio: boolean;
  safePortfolio: PortfolioData;
  filteredPortfolio: PortfolioData;
  tickets: MaintenanceTicket[];
  filteredTickets: MaintenanceTicket[];
  invitations: InvitationListItem[];
  safeNotifications: NotificationDTO[];
  safeInboxThreads: InboxThreadDTO[];
  safeDocuments: OwnerDocumentsData;
  safeAutomationTemplates: AutomationTemplateDTO[];
  safeAutomationRules: AutomationRuleDTO[];
  safeListings: RentalListingDTO[];
  safeApplications: ApplicationDTO[];
  managerPaymentConfigs: ManagerPaymentConfigDTO[];
  managerPayments: ManagerPaymentDTO[];
  managerPaymentManagers: ManagerAssignmentOption[];
  managerPaymentsWarning?: string | null;
  safeVendors: VendorDTO[];
  safeExpenses: ExpenseDashboardData;
  safeAnalytics: AnalyticsDashboardData;
  auditLogs: AuditLogEntry[];
  rentIncreaseHistory: RentIncreaseEntry[];
  safeOwnershipAccounts: OwnershipAccountDTO[];
  ownershipMembers?: OwnershipMemberDTO[];
  pendingAccountRenameRequests?: AccountRenameRequestDTO[];
  pendingAccountDeleteRequests?: AccountDeleteRequestDTO[];
  distributionHistory?: DistributionHistoryEntry[];
  pendingChangeRequests?: DistributionChangeRequestDTO[];
  pendingWithdrawals?: WithdrawalRequestDTO[];
  financialActivityFeed?: FinancialActivityEvent[];
  activeAccountId?: string | null;
  currentUserId?: string;
  availableProperties: PropertyListItem[];
  selectedPropertyId: string | null;
  selectedProperty: PropertyListItem | null;
  selectedPropertySummary: {
    property: {
      id: string;
      name: string;
      address?: string;
    };
    unitCount: number;
    occupiedUnits: number;
    monthlyRentCents: number;
    openTickets: number;
  } | null;
  onSelectProperty: (propertyId: string | null) => void;
  safeCapabilities: FeatureCapabilitiesDTO;
  sortedVendors: VendorDTO[];
  hasLeasingSection: boolean;
  hasApplicationsSection: boolean;
  hasManagerPaymentsSection: boolean;
  hasInboxSection: boolean;
  hasAutomationsSection: boolean;
  hasNotificationsSection: boolean;
  hasOwnershipSection: boolean;
  hasInvitationsSection: boolean;
  hasDocumentsSection: boolean;
  hasVendorsSection: boolean;
  hasExpensesSection: boolean;
  hasAnalyticsSection: boolean;
  hasActivitySection: boolean;
  applicationCount?: number;
  approvedApplicationCount?: number;
  stripeConnected?: boolean;
  ownerConnectedMap?: Map<string, boolean>;
  onGenerateChargesHref?: string;
  onPayCharge: FormAction;
  onDeletePendingCharge?: StatefulAction;
  onEditCharge?: StatefulAction;
  onCreateManualCharge?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onRecordManualPayment?: StatefulAction;
  onSendBatchPaymentReminder?: StatefulAction;
  onUpdateTicketStatus?: StatefulAction;
  onInviteTenant?: StatefulAction;
  onInviteManager?: StatefulAction;
  onInviteOwner?: StatefulAction;
  onResendInvite?: StatefulAction;
  onRevokeInvite?: StatefulAction;
  onMarkNotificationRead?: StatefulAction;
  onMarkAllNotificationsRead?: StatefulAction;
  onCreateInboxThread?: StatefulAction;
  onSendInboxMessage?: StatefulAction;
  onEnableAutomation?: StatefulAction;
  onDisableAutomation?: StatefulAction;
  onCreateRentalListing?: StatefulAction;
  onUpdateListingStatus?: StatefulAction;
  onCreateApplication?: StatefulAction;
  onReviewApplication?: StatefulAction;
  onAddApplicationNote?: StatefulAction;
  onRecordScreeningScore?: StatefulAction;
  onCreateDocumentTemplate?: StatefulAction;
  onDeleteDocumentTemplate?: StatefulAction;
  onCreateDocumentPacket?: StatefulAction;
  onSendDocumentPacket?: StatefulAction;
  onUploadPropertyFile?: StatefulAction;
  onDeletePropertyFile?: StatefulAction;
  onUpdateFileVisibility?: StatefulAction;
  onCreateVendor?: StatefulAction;
  onUpdateVendor?: StatefulAction;
  onAssignVendor?: StatefulAction;
  onUploadMaintenancePhoto?: StatefulAction;
  onDeleteMaintenancePhoto?: StatefulAction;
  onCreateExpense?: StatefulAction;
  onUpdateExpense?: StatefulAction;
  onDeleteExpense?: StatefulAction;
  onSetupManagerPaymentConfig?: StatefulAction;
  onRecordManagerPayment?: StatefulAction;
  onMarkManagerPaymentPaid?: StatefulAction;
  onCancelManagerPayment?: StatefulAction;
  onGenerateMonthlyManagerPayments?: StatefulAction;
  onCreateOwnershipAccount?: StatefulAction;
  onLinkPropertyToOwnershipAccount?: StatefulAction;
  onRenameOwnershipAccount?: StatefulAction;
  onVoteOnAccountRename?: StatefulAction;
  onRequestDeleteLLC?: StatefulAction;
  onVoteOnDeleteLLC?: StatefulAction;
  onInitiateAccountStripeConnect?: StatefulAction;
  onUpdateDistributionConfig?: StatefulAction;
  onSubmitDistributionChangeRequest?: StatefulAction;
  onVoteOnDistributionChange?: StatefulAction;
  onInitiateMemberPayoutConnect?: StatefulAction;
  onSubmitWithdrawalRequest?: StatefulAction;
  onVoteOnWithdrawal?: StatefulAction;
  onInitiatePlaidLink?: StatefulAction;
  onCompletePlaidLink?: StatefulAction;
  onRefreshPlaidBalance?: StatefulAction;
  onDisconnectPlaid?: StatefulAction;
  onExecuteApprovedWithdrawal?: StatefulAction;
  onUpdateManagementFee?: StatefulAction;
  onCreateProperty: StatefulAction;
  onCreateUnit: StatefulAction;
  onCreateLease: StatefulAction;
  onRenameProperty?: StatefulAction;
  onUpdateProperty?: StatefulAction;
  onDeleteProperty?: StatefulAction;
  onUpdateUnitField?: StatefulAction;
  onUpdateUnit?: StatefulAction;
  onDeleteUnit?: StatefulAction;
  onUpdateLease?: StatefulAction;
  onUpdateRentAmount?: StatefulAction;
  onUpdateTenantDisplayInfo?: StatefulAction;
  onUpdateManagerInfo?: StatefulAction;
  onDeleteLease?: StatefulAction;
  onRenewLease?: StatefulAction;
  onTerminateLease?: StatefulAction;
  onAddTicketComment?: StatefulAction;
  openSection: (sectionId: string) => void;
  openLeaseWizard: () => void;
  openTenantInviteWizard: () => void;
  goToSectionIfVisible: (sectionId: string) => void;
  handleTenantInviteSuccess: () => void;
  handleManagerInviteSuccess: () => void;
  handleOwnerInviteSuccess: () => void;
  handleVendorCreatedSuccess: () => void;
  handlePropertyCreated: () => void;
  handleUnitCreated: () => void;
  handleLeaseCreated: () => void;
  isOwnerDailyOpsCarousel?: boolean;
}

function SectionSkeleton() {
  return createElement(
    "div",
    {
      className: "rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 shadow-sm"
    },
    "Loading section..."
  );
}

const LazyNotificationsSection = dynamic(
  () => import("./notifications-section").then((module) => ({ default: module.NotificationsSection })),
  { loading: () => createElement(SectionSkeleton) }
);

const LazyInboxSection = dynamic(
  () => import("./inbox-section").then((module) => ({ default: module.InboxSection })),
  { loading: () => createElement(SectionSkeleton) }
);

const LazyDocumentsSection = dynamic(
  () => import("./documents-section").then((module) => ({ default: module.DocumentsSection })),
  { loading: () => createElement(SectionSkeleton) }
);

const LazyOwnershipSection = dynamic(
  () => import("./ownership-section").then((module) => ({ default: module.OwnershipSection })),
  { loading: () => createElement(SectionSkeleton) }
);

const LazyAutomationTemplatesSection = dynamic(
  () => import("./automation-templates-section").then((module) => ({ default: module.AutomationTemplatesSection })),
  { loading: () => createElement(SectionSkeleton) }
);

export const lazySectionComponents = {
  notifications: LazyNotificationsSection,
  inbox: LazyInboxSection,
  documents: LazyDocumentsSection,
  ownership: LazyOwnershipSection,
  automations: LazyAutomationTemplatesSection
} as const;
