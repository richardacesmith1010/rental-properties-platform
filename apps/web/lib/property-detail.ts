import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminMaintenanceTickets } from "@/lib/maintenance";
import { getPortfolioData } from "@/lib/portfolio";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  getPropertyActivityData,
  getPropertyChargeData,
  getPropertyDocumentData
} from "@/lib/property-detail-queries";
import type { PropertyDetailData } from "@/lib/property-detail-types";

export type {
  PropertyActivityRecord,
  PropertyChargeRecord,
  PropertyDetailData,
  PropertyDocumentRecord,
  PropertyPaymentRecord
} from "@/lib/property-detail-types";

export async function getPropertyDetailData(
  propertyId: string,
  userId: string
): Promise<PropertyDetailData | null> {
  const canAccess = await canUserAdministerProperty(userId, propertyId);
  if (!canAccess) {
    return null;
  }

  const admin = createAdminClient();
  const [
    portfolio,
    maintenance,
    chargeData,
    documentData,
    activity
  ] = await Promise.all([
    getPortfolioData(userId),
    getAdminMaintenanceTickets(userId),
    getPropertyChargeData(admin, propertyId),
    getPropertyDocumentData(admin, propertyId),
    getPropertyActivityData(admin, propertyId)
  ]);

  const property = portfolio.properties.find(
    (item) => item.id === propertyId
  );
  if (!property) {
    return null;
  }

  return {
    property,
    units: portfolio.units
      .filter((unit) => unit.propertyId === propertyId)
      .sort((left, right) => left.unitNumber.localeCompare(right.unitNumber)),
    leases: portfolio.leases
      .filter((lease) => lease.propertyId === propertyId)
      .sort((left, right) => right.startDate.localeCompare(left.startDate)),
    tenants: portfolio.tenants.filter((tenant) =>
      tenant.propertyIds.includes(propertyId)
    ),
    charges: chargeData.charges,
    payments: chargeData.payments,
    maintenance: maintenance
      .filter((ticket) => ticket.propertyId === propertyId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    documents: documentData,
    activity
  };
}
