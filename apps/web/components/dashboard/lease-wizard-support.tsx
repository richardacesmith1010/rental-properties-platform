import type { LeaseListItem, PropertyListItem, TenantOption, UnitListItem } from "@/lib/portfolio";

export type LeaseWizardStep = 0 | 1 | 2 | 3;
export type LeaseType = "fixed_term" | "month_to_month";
export type TenantSelectionMode = "existing" | "invite_new";

export interface LeaseWizardDraft {
  propertyId: string;
  unitId: string;
  leaseType: LeaseType;
  startDate: string;
  endDate: string;
  monthlyRentDollars: string;
  depositDollars: string;
  dueDayOfMonth: string;
  gracePeriodDays: string;
  lateFeeDollars: string;
  tenantMode: TenantSelectionMode;
  tenantProfileId: string;
  tenantSearch: string;
  tenantFullName: string;
  tenantEmail: string;
}

export const LEASE_WIZARD_STEP_TITLES = [
  "Property & unit",
  "Lease terms",
  "Assign tenant",
  "Review & create"
] as const;

function firstOfNextMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

function addYearsMinusOneDay(dateIso: string, years: number) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function getEffectiveLeaseEndDate(draft: LeaseWizardDraft) {
  if (!draft.startDate) {
    return draft.endDate;
  }

  if (draft.leaseType === "month_to_month") {
    return addYearsMinusOneDay(draft.startDate, 1);
  }

  return draft.endDate;
}

export function getVacantUnitsForProperty(
  units: UnitListItem[],
  leases: LeaseListItem[],
  propertyId: string
) {
  const activeLeaseUnitIds = new Set(
    leases.filter((lease) => lease.active && lease.leaseStatus === "active").map((lease) => lease.unitId)
  );

  return units.filter(
    (unit) =>
      unit.propertyId === propertyId &&
      unit.active &&
      !unit.occupied &&
      !activeLeaseUnitIds.has(unit.id)
  );
}

export function getTenantsForProperty(tenants: TenantOption[], propertyId: string) {
  return tenants.filter((tenant) => tenant.propertyIds.includes(propertyId));
}

export function createDefaultLeaseWizardDraft(params: {
  properties: PropertyListItem[];
  units: UnitListItem[];
  leases: LeaseListItem[];
  tenants: TenantOption[];
  selectedPropertyId?: string | null;
}): LeaseWizardDraft {
  const propertyId =
    (params.selectedPropertyId &&
      params.properties.some((property) => property.id === params.selectedPropertyId)
      ? params.selectedPropertyId
      : params.properties.length === 1
        ? params.properties[0]?.id
        : "") ?? "";
  const availableUnits = propertyId
    ? getVacantUnitsForProperty(params.units, params.leases, propertyId)
    : [];
  const availableTenants = propertyId
    ? getTenantsForProperty(params.tenants, propertyId)
    : [];
  const unitId = availableUnits.length === 1 ? availableUnits[0]?.id ?? "" : "";
  const tenantProfileId =
    availableTenants.length === 1 ? availableTenants[0]?.id ?? "" : "";
  const startDate = firstOfNextMonth();

  return {
    propertyId,
    unitId,
    leaseType: "fixed_term",
    startDate,
    endDate: addYearsMinusOneDay(startDate, 1),
    monthlyRentDollars: "",
    depositDollars: "0",
    dueDayOfMonth: "1",
    gracePeriodDays: "5",
    lateFeeDollars: "0",
    tenantMode: "existing",
    tenantProfileId,
    tenantSearch: "",
    tenantFullName: "",
    tenantEmail: ""
  };
}

function isPositiveNumber(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

export function getLeaseWizardStepError(params: {
  step: LeaseWizardStep;
  draft: LeaseWizardDraft;
  availableUnits: number;
  availableTenants: number;
}) {
  const { step, draft, availableUnits, availableTenants } = params;

  if (step === 0) {
    if (!draft.propertyId) {
      return "Select a property first.";
    }
    if (availableUnits === 0) {
      return "This property has no vacant units available for a lease.";
    }
    if (!draft.unitId) {
      return "Select a vacant unit before continuing.";
    }
  }

  if (step === 1) {
    if (!draft.startDate) {
      return "Choose a lease start date.";
    }
    if (draft.leaseType === "fixed_term") {
      if (!draft.endDate) {
        return "Choose a lease end date.";
      }
      if (draft.endDate <= draft.startDate) {
        return "End date must be after start date.";
      }
    }
    if (!isPositiveNumber(draft.monthlyRentDollars)) {
      return "Monthly rent must be greater than $0.";
    }
  }

  if (step === 2) {
    if (availableTenants === 0) {
      return "Invite a tenant to this property first.";
    }
    if (draft.tenantMode === "existing") {
      if (!draft.tenantProfileId) {
        return "Select an existing tenant or switch to invite a new tenant.";
      }
    } else {
      if (!draft.tenantFullName.trim()) {
        return "Enter the tenant's full name.";
      }
      if (!draft.tenantEmail.trim()) {
        return "Enter the tenant's email address.";
      }
    }
  }

  return null;
}
