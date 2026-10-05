export type Direction = "in" | "out";
export type Institution = "fidelity" | "navy_federal" | "other";
export type ExpenseCategory =
  | "mortgage" | "insurance" | "property_tax" | "hoa" | "repair"
  | "maintenance" | "utility" | "management_fee" | "legal" | "other";

export interface BankRow {
  i: number;
  postedOn: string;
  amountCents: number;
  direction: Direction;
  description: string;
  occurrenceIndex: number;
  fingerprint: string;
}

export interface BankRule {
  id: string;
  bank_account_id: string | null;
  direction: Direction;
  match_text: string;
  action: "rent" | "expense" | "transfer" | "skip";
  lease_id: string | null;
  property_id: string | null;
  expense_category: ExpenseCategory | null;
  label: string | null;
  created_at: string;
}

export interface BankCharge {
  id: string;
  leaseId: string;
  propertyId: string;
  propertyName: string;
  tenantName: string;
  dueDate: string;
  amountCents: number;
  status: "pending" | "paid" | "late" | "waived";
}

export interface BankProperty { id: string; name: string }
export interface TransferLeg {
  bankAccountId: string;
  postedOn: string;
  amountCents: number;
  direction: Direction;
  kind: "rent" | "transfer";
}

export type BankChoice =
  | { kind: "rent"; rentChargeId: string }
  | { kind: "expense"; propertyId: string; category: ExpenseCategory; label: string }
  | { kind: "transfer" };

export type Suggestion =
  | ({ text: string; kind: "rent"; rentChargeId: string; propertyId: string } & BankChoice)
  | ({ text: string; kind: "expense"; propertyId: string | null; category: ExpenseCategory; label: string })
  | { text: string; kind: "transfer" };

export interface MatchResult {
  i: number;
  status: "already" | "transfer" | "auto" | "ask" | "personal";
  suggestion?: Suggestion;
  rule?: BankRule;
  choice?: BankChoice;
}
