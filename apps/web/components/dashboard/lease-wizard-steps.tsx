import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  DoorOpen,
  Mail,
  UserRound
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PropertyListItem, TenantOption, UnitListItem } from "@/lib/portfolio";
import {
  LEASE_WIZARD_STEP_TITLES,
  getEffectiveLeaseEndDate,
  type LeaseWizardDraft,
  type LeaseWizardStep
} from "./lease-wizard-support";

export function LeaseWizardProgress({ step }: { step: LeaseWizardStep }) {
  const current = step + 1;
  const percent = Math.round((current / LEASE_WIZARD_STEP_TITLES.length) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">
          Step {current} of {LEASE_WIZARD_STEP_TITLES.length}
        </span>
        <span className="text-muted-foreground">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LEASE_WIZARD_STEP_TITLES.map((label, index) => (
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

export function LeaseWizardStepOne({
  properties,
  availableUnits,
  draft,
  onPropertyChange,
  onUnitChange,
  onCreatePropertyAction,
  onAddUnitAction
}: {
  properties: PropertyListItem[];
  availableUnits: UnitListItem[];
  draft: LeaseWizardDraft;
  onPropertyChange: (propertyId: string) => void;
  onUnitChange: (unitId: string) => void;
  onCreatePropertyAction: () => void;
  onAddUnitAction: (propertyId: string) => void;
}) {
  const selectedProperty = properties.find((property) => property.id === draft.propertyId) ?? null;
  const selectedUnit = availableUnits.find((unit) => unit.id === draft.unitId) ?? null;

  if (properties.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-5 text-sm">
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-0.5 h-5 w-5 text-primary" />
          <div className="space-y-4">
            <div>
              <p className="font-medium text-foreground">No properties found</p>
              <p className="mt-1 text-muted-foreground">
                You need to create a property before you can set up a lease.
              </p>
            </div>
            <Button
              type="button"
              onClick={onCreatePropertyAction}
              title="Open the property setup flow."
            >
              Create Property
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-property">
            Property
          </label>
          <Select
            id="lease-wizard-property"
            value={draft.propertyId}
            onChange={(event) => onPropertyChange(event.target.value)}
            title="Choose the property for this new lease."
          >
            <option value="">Select property</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
          {selectedProperty ? (
            <p className="text-xs text-muted-foreground">
              {selectedProperty.addressLine1}, {selectedProperty.city}, {selectedProperty.state}
            </p>
          ) : null}
        </div>

        {selectedProperty && availableUnits.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-4 w-4 text-primary" />
              <div className="space-y-4">
                <div>
                  <p className="font-medium text-foreground">{selectedProperty.name} has no units</p>
                  <p className="mt-1 text-muted-foreground">
                    Add a unit to this property before creating a lease.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onAddUnitAction(selectedProperty.id)}
                  title={`Open the unit setup flow for ${selectedProperty.name}.`}
                >
                  Add a Unit
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-unit">
              Vacant unit
            </label>
            <Select
              id="lease-wizard-unit"
              value={draft.unitId}
              onChange={(event) => onUnitChange(event.target.value)}
              disabled={!draft.propertyId || availableUnits.length === 0}
              title="Choose a vacant unit for this lease."
            >
              <option value="">Select unit</option>
              {availableUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.unitNumber}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {selectedUnit ? (
        <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <DoorOpen className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="font-medium text-foreground">Unit details</p>
              <p className="mt-1">
                {selectedUnit.unitNumber} • {selectedUnit.bedrooms} bd / {selectedUnit.bathrooms} ba
              </p>
              <p className="mt-1">
                Target rent: {formatCurrency(selectedUnit.monthlyRentCents)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="font-medium text-foreground">Pick the home first.</p>
              <p className="mt-1">Domus only offers vacant units here so you cannot accidentally double-book a lease.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LeaseWizardStepTwo({
  draft,
  onDraftChange
}: {
  draft: LeaseWizardDraft;
  onDraftChange: (draft: LeaseWizardDraft) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">Lease type</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={draft.leaseType === "fixed_term" ? "default" : "outline"}
            onClick={() => onDraftChange({ ...draft, leaseType: "fixed_term" })}
            title="Create a fixed-term lease with a defined end date."
          >
            Fixed term
          </Button>
          <Button
            type="button"
            variant={draft.leaseType === "month_to_month" ? "default" : "outline"}
            onClick={() => onDraftChange({ ...draft, leaseType: "month_to_month" })}
            title="Create a month-to-month lease using a rolling annual anchor."
          >
            Month-to-month
          </Button>
        </div>
        {draft.leaseType === "month_to_month" ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Domus currently stores a rolling 12-month anchor date for month-to-month billing because the live lease schema still requires an end date.
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-start-date">
            Start date
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="lease-wizard-start-date"
              type="date"
              value={draft.startDate}
              onChange={(event) => onDraftChange({ ...draft, startDate: event.target.value })}
              className="pl-9"
              title="Choose the lease start date."
            />
          </div>
        </div>

        {draft.leaseType === "fixed_term" ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-end-date">
              End date
            </label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="lease-wizard-end-date"
                type="date"
                value={draft.endDate}
                onChange={(event) => onDraftChange({ ...draft, endDate: event.target.value })}
                className="pl-9"
                title="Choose the lease end date."
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Month-to-month anchor</p>
            <p className="mt-1">
              Domus will store {draft.startDate ? formatDate(getEffectiveLeaseEndDate(draft)) : "an end date"} as the rolling billing anchor.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-rent">
            Monthly rent
          </label>
          <Input
            id="lease-wizard-rent"
            type="number"
            min="0"
            step="0.01"
            value={draft.monthlyRentDollars}
            onChange={(event) => onDraftChange({ ...draft, monthlyRentDollars: event.target.value })}
            placeholder="1850.00"
            title="Enter the monthly rent amount."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-deposit">
            Security deposit (optional)
          </label>
          <Input
            id="lease-wizard-deposit"
            type="number"
            min="0"
            step="0.01"
            value={draft.depositDollars}
            onChange={(event) => onDraftChange({ ...draft, depositDollars: event.target.value })}
            placeholder="0.00"
            title="Enter the security deposit amount if there is one."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-due-day">
            Due day of month
          </label>
          <Input
            id="lease-wizard-due-day"
            type="number"
            min="1"
            max="28"
            value={draft.dueDayOfMonth}
            onChange={(event) => onDraftChange({ ...draft, dueDayOfMonth: event.target.value })}
            title="Choose which day rent is due each month."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-grace-period">
            Grace period (days)
          </label>
          <Input
            id="lease-wizard-grace-period"
            type="number"
            min="0"
            max="30"
            value={draft.gracePeriodDays}
            onChange={(event) => onDraftChange({ ...draft, gracePeriodDays: event.target.value })}
            title="Set the grace period before late fees apply."
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-late-fee">
            Late fee
          </label>
          <Input
            id="lease-wizard-late-fee"
            type="number"
            min="0"
            step="0.01"
            value={draft.lateFeeDollars}
            onChange={(event) => onDraftChange({ ...draft, lateFeeDollars: event.target.value })}
            placeholder="0.00"
            title="Set the flat late fee amount for missed rent."
          />
        </div>
      </div>
    </div>
  );
}

export function LeaseWizardStepThree({
  draft,
  tenants,
  onDraftChange,
  onInviteTenantAction
}: {
  draft: LeaseWizardDraft;
  tenants: TenantOption[];
  onDraftChange: (draft: LeaseWizardDraft) => void;
  onInviteTenantAction: () => void;
}) {
  const filteredTenants = draft.tenantSearch.trim()
    ? tenants.filter((tenant) => {
        const needle = draft.tenantSearch.toLowerCase();
        return (
          tenant.fullName.toLowerCase().includes(needle) || tenant.email.toLowerCase().includes(needle)
        );
      })
    : tenants;
  const selectedTenant = tenants.find((tenant) => tenant.id === draft.tenantProfileId) ?? null;

  if (tenants.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-5 text-sm">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 h-5 w-5 text-primary" />
          <div className="space-y-4">
            <div>
              <p className="font-medium text-foreground">No tenants available</p>
              <p className="mt-1 text-muted-foreground">
                Invite a tenant to this property first. They&apos;ll get an email to set up their account.
              </p>
            </div>
            <Button
              type="button"
              onClick={onInviteTenantAction}
              title="Open the tenant invite flow."
            >
              Invite Tenant
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">Tenant source</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={draft.tenantMode === "existing" ? "default" : "outline"}
            onClick={() => onDraftChange({ ...draft, tenantMode: "existing" })}
            title="Attach this lease to a tenant already in Domus."
          >
            Existing tenant
          </Button>
          <Button
            type="button"
            variant={draft.tenantMode === "invite_new" ? "default" : "outline"}
            onClick={() => onDraftChange({ ...draft, tenantMode: "invite_new" })}
            title="Invite a brand-new tenant as part of this lease setup."
          >
            Invite new tenant
          </Button>
        </div>
      </div>

      {draft.tenantMode === "existing" ? (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-tenant-search">
                Search tenants
              </label>
              <Input
                id="lease-wizard-tenant-search"
                value={draft.tenantSearch}
                onChange={(event) => onDraftChange({ ...draft, tenantSearch: event.target.value })}
                placeholder="Search by name or email"
                title="Filter existing tenants by name or email."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-tenant-select">
                Tenant
              </label>
              <Select
                id="lease-wizard-tenant-select"
                value={draft.tenantProfileId}
                onChange={(event) => onDraftChange({ ...draft, tenantProfileId: event.target.value })}
                disabled={filteredTenants.length === 0}
                title="Select an existing tenant profile for this lease."
              >
                <option value="">Select tenant</option>
                {filteredTenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.fullName} ({tenant.email})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {selectedTenant ? (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                <div>
                  <p className="font-medium text-foreground">Tenant selected</p>
                  <p className="mt-1">{selectedTenant.fullName}</p>
                  <p className="mt-1">{selectedTenant.email}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No tenant selected yet.</p>
              <p className="mt-1">Choose an existing tenant already linked to this property, or switch to invite a new tenant.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-invite-name">
              Full name
            </label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="lease-wizard-invite-name"
                value={draft.tenantFullName}
                onChange={(event) => onDraftChange({ ...draft, tenantFullName: event.target.value })}
                className="pl-9"
                placeholder="Alex Tenant"
                title="Enter the new tenant's full name."
              />
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-invite-email">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="lease-wizard-invite-email"
                type="email"
                value={draft.tenantEmail}
                onChange={(event) => onDraftChange({ ...draft, tenantEmail: event.target.value })}
                className="pl-9"
                placeholder="tenant@example.com"
                title="Enter the new tenant's email address."
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground md:col-span-2">
            <p className="font-medium text-foreground">Domus will send a branded tenant invitation first.</p>
            <p className="mt-1">If the invite succeeds and Domus gets a tenant profile ID back immediately, the lease will be created in the same flow.</p>
          </div>
        </div>
      )}
    </div>
  );
}
