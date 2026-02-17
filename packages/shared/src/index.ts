export type UserRole = "owner" | "manager" | "tenant";

export interface Property {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  unitCount: number;
}

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  monthlyRentCents: number;
  occupied: boolean;
}

export interface Lease {
  id: string;
  unitId: string;
  tenantProfileId: string;
  startDate: string;
  endDate: string;
  monthlyRentCents: number;
  dueDayOfMonth: number;
  active: boolean;
}

export interface RentCharge {
  id: string;
  leaseId: string;
  dueDate: string;
  amountCents: number;
  status: "pending" | "paid" | "late";
}

export interface MaintenanceTicket {
  id: string;
  propertyId: string;
  unitId: string | null;
  tenantProfileId: string | null;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
}
