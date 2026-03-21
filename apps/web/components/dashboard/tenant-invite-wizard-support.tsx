import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Mail,
  Phone,
  UserRound
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PropertyListItem, UnitListItem } from "@/lib/portfolio";

export type WizardStep = 0 | 1 | 2 | 3;

export interface TenantInviteWizardDraft {
  propertyId: string;
  unitId: string;
  fullName: string;
  email: string;
  phone: string;
  monthlyRentDollars: string;
  leaseStartDate: string;
  leaseEndDate: string;
}

export const STEP_TITLES = [
  "Property & unit",
  "Tenant details",
  "Rent & lease",
  "Invitation sent"
] as const;

export function getUnitsForProperty(units: UnitListItem[], propertyId: string) {
  return units.filter((unit) => unit.propertyId === propertyId);
}

export function createDefaultDraft(properties: PropertyListItem[], units: UnitListItem[]): TenantInviteWizardDraft {
  const firstPropertyId = properties[0]?.id ?? "";
  const firstUnitId = firstPropertyId ? getUnitsForProperty(units, firstPropertyId)[0]?.id ?? "" : "";

  return {
    propertyId: firstPropertyId,
    unitId: firstUnitId,
    fullName: "",
    email: "",
    phone: "",
    monthlyRentDollars: "",
    leaseStartDate: "",
    leaseEndDate: ""
  };
}

export function getTenantInviteStepError(params: {
  step: WizardStep;
  draft: TenantInviteWizardDraft;
  availableUnits: number;
}) {
  const { step, draft, availableUnits } = params;

  if (step === 0) {
    if (!draft.propertyId) {
      return "Select a property first.";
    }
    if (availableUnits === 0) {
      return "Add a unit to this property before inviting a tenant.";
    }
    if (!draft.unitId) {
      return "Select a unit for this tenant.";
    }
  }

  if (step === 1) {
    if (!draft.fullName.trim()) {
      return "Enter the tenant's name.";
    }
    if (!draft.email.trim()) {
      return "Enter the tenant's email address.";
    }
  }

  return null;
}

export function TenantInviteWizardProgress({ step }: { step: WizardStep }) {
  const current = step + 1;
  const percent = Math.round((current / STEP_TITLES.length) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Step {current} of {STEP_TITLES.length}</span>
        <span className="text-muted-foreground">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEP_TITLES.map((label, index) => (
          <div
            key={label}
            className={[
              "rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-300",
              step === index
                ? "border-primary/40 bg-primary/10 text-foreground"
                : step > index
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700"
                  : "border-border bg-card text-muted-foreground"
            ].join(" ")}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TenantInviteStepOne({
  properties,
  availableUnits,
  draft,
  onPropertyChange,
  onUnitChange
}: {
  properties: PropertyListItem[];
  availableUnits: UnitListItem[];
  draft: TenantInviteWizardDraft;
  onPropertyChange: (propertyId: string) => void;
  onUnitChange: (unitId: string) => void;
}) {
  const selectedProperty = properties.find((property) => property.id === draft.propertyId) ?? null;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="tenant-invite-property">
            Property
          </label>
          <Select
            id="tenant-invite-property"
            value={draft.propertyId}
            onChange={(event) => onPropertyChange(event.target.value)}
            title="Choose the property for this tenant invitation."
          >
            <option value="">Select property</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
          {selectedProperty ? (
            <p className="text-xs text-muted-foreground">{selectedProperty.addressLine1}, {selectedProperty.city}, {selectedProperty.state}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="tenant-invite-unit">
            Unit
          </label>
          <Select
            id="tenant-invite-unit"
            value={draft.unitId}
            onChange={(event) => onUnitChange(event.target.value)}
            disabled={!draft.propertyId || availableUnits.length === 0}
            title="Choose the unit this tenant will occupy."
          >
            <option value="">Select unit</option>
            {availableUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.unitNumber}
              </option>
            ))}
          </Select>
          {draft.propertyId && availableUnits.length === 0 ? (
            <p className="text-xs text-amber-600">Add a unit to this property before sending an invitation.</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-3">
          <Building2 className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <p className="font-medium text-foreground">Property-linked invitations keep the onboarding clear.</p>
            <p className="mt-1">Tenants will see exactly which home they were invited to manage as soon as they accept the email.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TenantInviteStepTwo({
  draft,
  onDraftChange
}: {
  draft: TenantInviteWizardDraft;
  onDraftChange: (draft: TenantInviteWizardDraft) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-foreground" htmlFor="tenant-invite-name">
            Full name
          </label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="tenant-invite-name"
              value={draft.fullName}
              onChange={(event) => onDraftChange({ ...draft, fullName: event.target.value })}
              className="pl-9"
              placeholder="Alex Tenant"
              title="Enter the tenant's full name."
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="tenant-invite-email">
            Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="tenant-invite-email"
              type="email"
              value={draft.email}
              onChange={(event) => onDraftChange({ ...draft, email: event.target.value })}
              className="pl-9"
              placeholder="tenant@example.com"
              title="Enter the tenant's email address."
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="tenant-invite-phone">
            Phone (optional)
          </label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="tenant-invite-phone"
              type="tel"
              value={draft.phone}
              onChange={(event) => onDraftChange({ ...draft, phone: event.target.value })}
              className="pl-9"
              placeholder="(555) 555-1212"
              title="Optionally record the tenant's phone number."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TenantInviteStepThree({
  draft,
  onDraftChange
}: {
  draft: TenantInviteWizardDraft;
  onDraftChange: (draft: TenantInviteWizardDraft) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="tenant-invite-rent">
            Monthly rent (optional)
          </label>
          <Input
            id="tenant-invite-rent"
            type="number"
            min="0"
            step="0.01"
            value={draft.monthlyRentDollars}
            onChange={(event) => onDraftChange({ ...draft, monthlyRentDollars: event.target.value })}
            placeholder="1850.00"
            title="Optionally include the monthly rent in the invite email."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="tenant-invite-lease-start">
            Lease start (optional)
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="tenant-invite-lease-start"
              type="date"
              value={draft.leaseStartDate}
              onChange={(event) => onDraftChange({ ...draft, leaseStartDate: event.target.value })}
              className="pl-9"
              title="Optionally include the lease start date in the invite email."
            />
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-foreground" htmlFor="tenant-invite-lease-end">
            Lease end (optional)
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="tenant-invite-lease-end"
              type="date"
              value={draft.leaseEndDate}
              onChange={(event) => onDraftChange({ ...draft, leaseEndDate: event.target.value })}
              className="pl-9"
              title="Optionally include the lease end date in the invite email."
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        These details are optional. If you skip them now, you can still finish lease setup later from the dashboard.
      </div>
    </div>
  );
}

export function TenantInviteSuccess({
  summary,
  successMessage
}: {
  summary: { propertyName: string; unitLabel: string; email: string; fullName: string };
  successMessage: string | null;
}) {
  return (
    <div className="space-y-5 text-center">
      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      <div className="mx-auto inline-flex rounded-full bg-emerald-500/12 p-4 text-emerald-600">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <div>
        <h3 className="text-2xl font-semibold text-foreground">Invitation sent to {summary.email}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {summary.fullName} will receive a branded Domus email with a secure link to create their account.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-muted/40 px-4 py-4 text-left text-sm">
        <p><span className="font-semibold text-foreground">Property:</span> <span className="text-muted-foreground">{summary.propertyName}</span></p>
        <p className="mt-2"><span className="font-semibold text-foreground">Unit:</span> <span className="text-muted-foreground">{summary.unitLabel}</span></p>
        <p className="mt-2"><span className="font-semibold text-foreground">Tenant:</span> <span className="text-muted-foreground">{summary.fullName}</span></p>
      </div>
    </div>
  );
}
