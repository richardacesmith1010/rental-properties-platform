export interface MobileChargeDTO {
  id: string;
  propertyLabel: string;
  dueDate: string;
  amountCents: number;
  status: "pending" | "late";
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
}

export interface MobileDocumentDTO {
  id: string;
  templateName: string;
  propertyLabel: string;
  packetStatus: "draft" | "sent" | "signed" | "void";
  signerStatus: "pending" | "signed";
  createdAt: string;
  signedAt: string | null;
}

export interface MobileTenantData {
  charges: MobileChargeDTO[];
  tickets: MobileTicketDTO[];
  units: MobileTenantUnitDTO[];
  documents: MobileDocumentDTO[];
}
