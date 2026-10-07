import { formatDate, formatDateTime, formatUnitLabel } from "@/lib/format";

export interface ReceiptPdfData {
  receiptNumber: string;
  tenantName: string;
  propertyName: string;
  propertyAddress: string;
  unitLabel: string;
  amountFormatted: string;
  dueDate: string;
  paidDate: string;
  paymentMethod: string;
  leaseLabel: string;
  categoryLabel: string;
  referenceNote?: string | null;
  generatedAt: string;
}

export interface LeaseSummaryPdfData {
  leaseNumber: string;
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  propertyAddress: string;
  unitLabel: string;
  monthlyRentFormatted: string;
  depositFormatted: string;
  dueDayLabel: string;
  gracePeriodLabel: string;
  lateFeeFormatted: string;
  leasePeriodLabel: string;
  leaseStatusLabel: string;
  generatedAt: string;
}

export interface ReceiptQueryShape {
  charge: {
    id: string;
    lease_id: string;
    due_date: string;
    amount_cents: number;
    category: string | null;
  };
  payment: {
    id: string;
    paid_at: string;
    amount_cents: number;
    method: string;
    reference_note: string | null;
  };
  lease: {
    id: string;
    tenant_profile_id: string;
    unit_id: string;
    start_date: string;
    end_date: string;
    monthly_rent_cents: number;
    deposit_cents: number;
    due_day_of_month: number;
    late_fee_cents: number | null;
    grace_period_days: number | null;
    lease_status: string | null;
  };
  unit: {
    id: string;
    unit_number: string;
    property_id: string;
  };
  property: {
    id: string;
    name: string;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  };
  tenantProfile: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
}

export interface LeaseQueryShape {
  lease: ReceiptQueryShape["lease"];
  unit: ReceiptQueryShape["unit"];
  property: ReceiptQueryShape["property"];
  tenantProfile: ReceiptQueryShape["tenantProfile"];
}

function formatPaymentMethod(method: string) {
  switch (method.toLowerCase()) {
    case "card":
      return "Card";
    case "ach":
      return "ACH";
    case "check":
      return "Check";
    case "cash":
      return "Cash";
    case "autopay":
      return "Autopay";
    case "other":
      return "Other";
    default:
      return method.charAt(0).toUpperCase() + method.slice(1);
  }
}

function formatLeaseStatus(status: string | null) {
  const normalized = status ?? "active";
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCategory(category: string | null) {
  return category === "late_fee" ? "Late Fee" : "Rent";
}

function formatGracePeriod(days: number | null) {
  const safeDays = days ?? 0;
  return `${safeDays} day${safeDays === 1 ? "" : "s"}`;
}

function formatCurrencyForPdf(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(cents / 100);
}

function buildPropertyAddress(params: {
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}) {
  return [params.addressLine1, params.city, params.state, params.postalCode]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(", ");
}

function getTenantName(profile: { full_name: string | null; email: string | null } | null) {
  const fullName = profile?.full_name?.trim();
  if (fullName) {
    return fullName;
  }

  return profile?.email ?? "Tenant";
}

export function buildReceiptNumber(paymentId: string) {
  const normalized = paymentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  return `DOM-${normalized || paymentId.slice(0, 8).toUpperCase()}`;
}

export function buildReceiptFileName(chargeId: string) {
  return `domus-receipt-${chargeId}.pdf`;
}

export function buildReceiptsExportFileName(year: number) {
  return `domus-receipts-${year}.pdf`;
}

export function buildLeaseSummaryFileName(leaseId: string) {
  return `domus-lease-summary-${leaseId}.pdf`;
}

function buildLeaseNumber(leaseId: string) {
  const normalized = leaseId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  return `LEASE-${normalized || leaseId.slice(0, 8).toUpperCase()}`;
}

export function buildReceiptPdfData(shape: ReceiptQueryShape): ReceiptPdfData {
  return {
    receiptNumber: buildReceiptNumber(shape.payment.id),
    tenantName: getTenantName(shape.tenantProfile),
    propertyName: shape.property.name,
    propertyAddress:
      buildPropertyAddress({
        addressLine1: shape.property.address_line1,
        city: shape.property.city,
        state: shape.property.state,
        postalCode: shape.property.postal_code
      }) || shape.property.name,
    unitLabel: formatUnitLabel(shape.unit.unit_number),
    amountFormatted: formatCurrencyForPdf(shape.payment.amount_cents),
    dueDate: formatDate(shape.charge.due_date),
    paidDate: formatDateTime(shape.payment.paid_at),
    paymentMethod: formatPaymentMethod(shape.payment.method),
    leaseLabel: `${formatDate(shape.lease.start_date)} - ${formatDate(shape.lease.end_date)}`,
    categoryLabel: formatCategory(shape.charge.category),
    referenceNote: shape.payment.reference_note,
    generatedAt: formatDateTime(new Date())
  };
}

export function buildLeaseSummaryPdfData(shape: LeaseQueryShape): LeaseSummaryPdfData {
  return {
    leaseNumber: buildLeaseNumber(shape.lease.id),
    tenantName: getTenantName(shape.tenantProfile),
    tenantEmail: shape.tenantProfile?.email ?? "Not available",
    propertyName: shape.property.name,
    propertyAddress:
      buildPropertyAddress({
        addressLine1: shape.property.address_line1,
        city: shape.property.city,
        state: shape.property.state,
        postalCode: shape.property.postal_code
      }) || shape.property.name,
    unitLabel: formatUnitLabel(shape.unit.unit_number),
    monthlyRentFormatted: formatCurrencyForPdf(shape.lease.monthly_rent_cents),
    depositFormatted: formatCurrencyForPdf(shape.lease.deposit_cents),
    dueDayLabel: `Day ${shape.lease.due_day_of_month} of each month`,
    gracePeriodLabel: formatGracePeriod(shape.lease.grace_period_days),
    lateFeeFormatted: formatCurrencyForPdf(shape.lease.late_fee_cents ?? 0),
    leasePeriodLabel: `${formatDate(shape.lease.start_date)} - ${formatDate(shape.lease.end_date)}`,
    leaseStatusLabel: formatLeaseStatus(shape.lease.lease_status),
    generatedAt: formatDateTime(new Date())
  };
}

