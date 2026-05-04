import type { PropertyFileDTO } from "@/lib/documents";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type {
  LeaseListItem,
  PropertyListItem,
  TenantOption,
  UnitListItem
} from "@/lib/portfolio";
import type { ChargeCategory, ChargeStatus } from "@/lib/charge-audit";

type PropertyActivityType = "infraction" | "notice" | "warning" | "note";

export interface PropertyChargeRecord {
  id: string;
  leaseId: string;
  propertyId: string;
  tenantProfileId: string | null;
  tenantName: string;
  unitNumber: string;
  category: ChargeCategory;
  amountCents: number;
  dueDate: string;
  status: ChargeStatus;
  paymentDate: string | null;
}

export interface PropertyPaymentRecord {
  id: string;
  chargeId: string;
  propertyId: string;
  tenantProfileId: string | null;
  tenantName: string;
  unitNumber: string;
  amountCents: number;
  paidAt: string;
  method: string;
}

export interface PropertyDocumentRecord extends PropertyFileDTO {
  uploaderName: string;
}

export interface PropertyActivityRecord {
  id: string;
  tenantProfileId: string;
  tenantName: string;
  propertyId: string;
  unitId: string | null;
  unitNumber: string | null;
  leaseId: string | null;
  activityType: PropertyActivityType;
  title: string;
  description: string;
  createdAt: string;
  createdBy: string;
  authorName: string;
}

export interface PropertyDetailData {
  property: PropertyListItem;
  units: UnitListItem[];
  leases: LeaseListItem[];
  tenants: TenantOption[];
  charges: PropertyChargeRecord[];
  payments: PropertyPaymentRecord[];
  maintenance: MaintenanceTicket[];
  documents: {
    files: PropertyDocumentRecord[];
    propertyFilesEnabled: boolean;
    propertyFilesWarning: string | null;
  };
  activity: PropertyActivityRecord[];
}
