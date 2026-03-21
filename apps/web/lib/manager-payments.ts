export type ManagerPaymentConfigType = "percentage" | "flat";
export type ManagerPaymentCategory = "commission" | "reimbursement" | "custom";
export type ManagerPaymentStatus = "pending" | "paid" | "cancelled";

export const MANAGER_PAYMENTS_WARNING = "Manager payments require the Sprint 62 database update.";

export interface ManagerAssignmentOption {
  id: string;
  fullName: string;
  email: string;
  propertyIds: string[];
  propertyNames: string[];
}

export interface ManagerPaymentConfigDTO {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  managerProfileId: string;
  managerName: string;
  managerEmail: string;
  paymentType: ManagerPaymentConfigType;
  percentageRate: number | null;
  flatAmountCents: number | null;
  baseRentCents: number | null;
  label: string;
  frequency: string;
  active: boolean;
  calculatedAmountCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface ManagerPaymentDTO {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  managerProfileId: string;
  managerName: string;
  managerEmail: string;
  category: ManagerPaymentCategory;
  description: string;
  amountCents: number;
  status: ManagerPaymentStatus;
  paymentDate: string;
  paidAt: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  configId: string | null;
  createdAt: string;
}

export interface ManagerPaymentsDashboardData {
  configs: ManagerPaymentConfigDTO[];
  payments: ManagerPaymentDTO[];
  managers: ManagerAssignmentOption[];
  warning: string | null;
}

export interface ManagerInvoicePdfData {
  invoiceNumber: string;
  invoiceDate: string;
  fromName: string;
  fromEmail: string;
  toName: string;
  toEmail: string;
  propertyName: string;
  propertyAddress: string;
  lineItems: Array<{
    description: string;
    amount: string;
  }>;
  totalFormatted: string;
  category: string;
  status: string;
  notes?: string | null;
  generatedAt: string;
}

export function calculateCommission(baseRentCents: number, percentageRate: number): number {
  return Math.round(baseRentCents * (percentageRate / 100));
}

export function calculateConfiguredManagerPaymentAmount(config: {
  paymentType: ManagerPaymentConfigType;
  percentageRate: number | null;
  flatAmountCents: number | null;
  baseRentCents: number | null;
}): number {
  if (config.paymentType === "flat") {
    return config.flatAmountCents ?? 0;
  }

  return calculateCommission(config.baseRentCents ?? 0, config.percentageRate ?? 0);
}

export function generateInvoiceNumber(paymentId: string, issuedAt = new Date()): string {
  const datePart = issuedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const idPart = paymentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  return `INV-${datePart}-${idPart}`;
}

export function buildManagerInvoiceFileName(paymentId: string): string {
  return `domus-manager-invoice-${paymentId}.pdf`;
}

export function formatManagerPaymentCategory(category: ManagerPaymentCategory): string {
  switch (category) {
    case "commission":
      return "Property Management Fee";
    case "reimbursement":
      return "Reimbursement";
    case "custom":
    default:
      return "Custom Payment";
  }
}
