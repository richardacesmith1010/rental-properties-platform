import type { StripeAccountHealthStatus } from "@/lib/stripe";

export interface OwnershipAccountDTO {
  id: string;
  accountType: "individual" | "llc";
  displayName: string;
  memberCount: number;
  joinCode: string | null;
  stripeConnected: boolean;
  distributionMode: string;
  stripeAccountId?: string | null;
  stripeStatus?: StripeAccountHealthStatus | null;
  plaidConnected: boolean;
  bankName: string | null;
  bankMask: string | null;
  balanceCents: number | null;
  balanceUpdatedAt: string | null;
}

export interface OwnershipMemberDTO {
  profileId: string;
  email: string;
  fullName: string;
  memberRole: "admin" | "owner" | "member" | "viewer";
  active: boolean;
  canReceiveCriticalAlerts: boolean;
  distributionPct: number | null;
  payoutStripeConnected: boolean;
}

export interface ActiveLlcMembershipDTO {
  accountId: string;
  accountName: string;
  payoutStripeConnected: boolean;
}

export interface AccountRenameRequestDTO {
  id: string;
  ownershipAccountId: string;
  requestedBy: string;
  requestedByName: string;
  proposedName: string;
  currentName: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  votesRequired: number;
  votesReceived: number;
  votes: Array<{ voterId: string; vote: "approve" | "reject" }>;
  createdAt: string;
}

export interface AccountDeleteRequestDTO {
  id: string;
  ownershipAccountId: string;
  requestedBy: string;
  requestedByName: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  votesRequired: number;
  votesReceived: number;
  votes: Array<{ voterId: string; vote: "approve" | "reject" }>;
  createdAt: string;
}

export interface OwnershipAccountRow {
  id: string;
  account_type: string;
  display_name: string;
  join_code: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  stripe_status: StripeAccountHealthStatus | null;
  distribution_mode: string | null;
  plaid_account_id: string | null;
  plaid_bank_name: string | null;
  plaid_bank_mask: string | null;
  plaid_balance_cents: number | null;
  plaid_balance_updated_at: string | null;
}

export interface GovernanceProfileRow {
  id: string;
  full_name: string | null;
}

export interface AccountRenameRequestRow {
  id: string;
  ownership_account_id: string;
  requested_by: string;
  proposed_name: string;
  current_name: string;
  status: AccountRenameRequestDTO["status"];
  votes_required: number;
  votes_received: number;
  created_at: string;
}

export interface AccountRenameVoteRow {
  request_id: string;
  voter_id: string;
  vote: "approve" | "reject";
}

export interface AccountDeleteRequestRow {
  id: string;
  ownership_account_id: string;
  requested_by: string;
  reason: string | null;
  status: AccountDeleteRequestDTO["status"];
  votes_required: number;
  votes_received: number;
  created_at: string;
}

export interface AccountDeleteVoteRow {
  request_id: string;
  voter_id: string;
  vote: "approve" | "reject";
}

export interface OwnershipAccountsPayload {
  property_account_ids: string[];
  member_rows: Array<{ account_id: string }>;
  creator_rows: Array<{ id: string }>;
  accounts: OwnershipAccountRow[];
  member_counts: Array<{ account_id: string; member_count: number }>;
}