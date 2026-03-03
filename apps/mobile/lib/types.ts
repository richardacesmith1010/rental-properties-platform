export interface MobileChargeDTO {
  id: string;
  propertyLabel: string;
  dueDate: string;
  amountCents: number;
  status: "pending" | "late";
}

export interface MobilePaymentDTO {
  id: string;
  amountCents: number;
  paidAt: string;
  method: string;
}

export interface MobileTenantUnitDTO {
  id: string;
  propertyId: string;
  propertyName: string;
  unitNumber: string;
}

export interface MobileTicketDTO {
  id: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: string;
  propertyName: string;
  unitNumber: string | null;
  photoCount: number;
}

export interface MobileDocumentDTO {
  id: string;
  templateName: string;
  propertyLabel: string;
  packetStatus: "draft" | "sent" | "signed" | "void";
  signerStatus: "pending" | "signed";
  signerId: string | null;
  createdAt: string;
  signedAt: string | null;
}

export interface MobileTenantData {
  charges: MobileChargeDTO[];
  payments: MobilePaymentDTO[];
  tickets: MobileTicketDTO[];
  units: MobileTenantUnitDTO[];
  documents: MobileDocumentDTO[];
}

export type ProfileRole = "owner" | "manager" | "tenant";

export interface MobilePropertySummaryDTO {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  unitCount: number;
  occupiedUnitCount: number;
}

export interface MobileOwnerTicketDTO {
  id: string;
  title: string;
  description: string;
  status: MobileTicketDTO["status"];
  priority: MobileTicketDTO["priority"];
  createdAt: string;
  propertyName: string;
  unitNumber: string | null;
  vendorName: string | null;
  photoCount: number;
}

export interface MobileNotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
