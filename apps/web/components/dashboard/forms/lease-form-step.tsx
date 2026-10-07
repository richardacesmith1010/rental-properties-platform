"use client";

import type { Dispatch, SetStateAction } from "react";
import { Building2, ClipboardList, UserRound } from "lucide-react";
import type { PortfolioData } from "@/lib/portfolio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { LeaseCollectionSetting } from "@/components/dashboard/lease-collection-setting";
import { FieldLabel } from "./form-helpers";
import type { LeaseDraft } from "./lease-form-draft";

interface LeaseFormStepProps {
  stepIndex: number;
  portfolio: PortfolioData;
  draft: LeaseDraft;
  setDraft: Dispatch<SetStateAction<LeaseDraft>>;
  unitsForSelectedProperty: PortfolioData["units"];
  tenantsForSelectedProperty: PortfolioData["tenants"];
  selectedProperty: PortfolioData["properties"][number] | null;
  hasNoProperties: boolean;
  hasNoUnitsForSelectedProperty: boolean;
  hasNoTenantsForSelectedProperty: boolean;
  requiredComplete: boolean;
  effectiveLateFeeDollars: string;
  setLateFeeTouched: Dispatch<SetStateAction<boolean>>;
  handleCreateProperty: () => void;
  handleAddUnit: () => void;
  handleInviteTenant: () => void;
  action: (formData: FormData) => void;
}

export function LeaseFormStep({
  stepIndex, portfolio, draft, setDraft, unitsForSelectedProperty,
  tenantsForSelectedProperty, selectedProperty, hasNoProperties,
  hasNoUnitsForSelectedProperty, hasNoTenantsForSelectedProperty,
  requiredComplete, effectiveLateFeeDollars, setLateFeeTouched,
  handleCreateProperty, handleAddUnit, handleInviteTenant, action
}: LeaseFormStepProps) {
  const renderStep = () => {
    if (stepIndex === 0) {
      if (hasNoProperties) {
        return (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-5">
            <div className="flex items-start gap-3">
              <ClipboardList className="mt-0.5 h-5 w-5 text-[var(--accent)]" />
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-[var(--ink)]">No properties found</p>
                  <p className="mt-1 text-sm text-[var(--ink-2)]">
                    Create a property before you set up a lease.
                  </p>
                </div>
                <Button type="button" onClick={handleCreateProperty} title="Open the property setup flow.">
                  Create Property
                </Button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-2)]">Step 1: Select the property first. Everything else depends on this.</p>
          <FieldLabel htmlFor="lease-property">Property</FieldLabel>
          <Select
            id="lease-property"
            value={draft.propertyId}
            onChange={(event) =>
              setDraft((current) => {
                const propertyId = event.target.value;
                const nextUnits = portfolio.units.filter((unit) => unit.propertyId === propertyId);
                const nextTenants = portfolio.tenants.filter((tenant) =>
                  tenant.propertyIds.includes(propertyId)
                );

                return {
                  ...current,
                  propertyId,
                  unitId:
                    nextUnits.some((unit) => unit.id === current.unitId)
                      ? current.unitId
                      : nextUnits.length === 1
                        ? nextUnits[0]?.id ?? ""
                        : "",
                  tenantProfileId:
                    nextTenants.some((tenant) => tenant.id === current.tenantProfileId)
                      ? current.tenantProfileId
                      : nextTenants.length === 1
                        ? nextTenants[0]?.id ?? ""
                        : ""
                };
              })
            }
            required
          >
            <option value="">Select property</option>
            {portfolio.properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </div>
      );
    }

    if (stepIndex === 1) {
      if (hasNoUnitsForSelectedProperty && selectedProperty) {
        return (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-5">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-5 w-5 text-[var(--accent)]" />
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-[var(--ink)]">{selectedProperty.name} has no units</p>
                  <p className="mt-1 text-sm text-[var(--ink-2)]">
                    Add a unit to this property before creating a lease.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={handleAddUnit} title="Open the unit setup flow.">
                  Add a Unit
                </Button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-2)]">Step 2: Select the unit for this lease.</p>
          <FieldLabel htmlFor="lease-unit" required>Unit</FieldLabel>
          <Select
            id="lease-unit"
            value={draft.unitId}
            onChange={(event) => setDraft((current) => ({ ...current, unitId: event.target.value }))}
            required
            disabled={!draft.propertyId}
          >
            <option value="">Select unit</option>
            {unitsForSelectedProperty.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.propertyName} • {unit.unitNumber}
              </option>
            ))}
          </Select>
          {!draft.propertyId && <p className="text-xs text-[var(--warn)]">Pick a property first.</p>}
        </div>
      );
    }

    if (stepIndex === 2) {
      if (hasNoTenantsForSelectedProperty) {
        return (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-5">
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 h-5 w-5 text-[var(--accent)]" />
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-[var(--ink)]">No tenants available</p>
                  <p className="mt-1 text-sm text-[var(--ink-2)]">
                    Invite a tenant to this property first. They&apos;ll receive an email to set up their account.
                  </p>
                </div>
                <Button type="button" onClick={handleInviteTenant} title="Open the tenant invite flow.">
                  Invite Tenant
                </Button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-2)]">Step 3: Select a tenant linked to this property.</p>
          <FieldLabel htmlFor="lease-tenant" required>Tenant</FieldLabel>
          <Select
            id="lease-tenant"
            value={draft.tenantProfileId}
            onChange={(event) => setDraft((current) => ({ ...current, tenantProfileId: event.target.value }))}
            required
            disabled={!draft.propertyId}
          >
            <option value="">Select tenant</option>
            {tenantsForSelectedProperty.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.fullName} ({tenant.email})
              </option>
            ))}
          </Select>
          {draft.propertyId && tenantsForSelectedProperty.length === 0 && (
            <p className="text-xs text-[var(--warn)]">No tenants are linked to this property yet. Invite a tenant first.</p>
          )}
        </div>
      );
    }

    if (stepIndex === 3) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-2)]">Step 4: Enter lease start and end dates.</p>
          <FieldLabel htmlFor="lease-start-date" required>Start Date</FieldLabel>
          <Input
            id="lease-start-date"
            type="date"
            value={draft.startDate}
            onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
            required
          />
          <FieldLabel htmlFor="lease-end-date" required>End Date</FieldLabel>
          <Input
            id="lease-end-date"
            type="date"
            value={draft.endDate}
            onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
            required
          />
        </div>
      );
    }

    if (stepIndex === 4) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-2)]">Step 5: Enter billing terms.</p>
          <FieldLabel htmlFor="lease-due-day">Due Day of Month</FieldLabel>
          <Input
            id="lease-due-day"
            type="number"
            min={1}
            max={28}
            value={draft.dueDayOfMonth}
            onChange={(event) => setDraft((current) => ({ ...current, dueDayOfMonth: event.target.value }))}
            required
            placeholder="Due day of month"
          />
          <FieldLabel htmlFor="lease-rent" required>Monthly Rent</FieldLabel>
          <Input
            id="lease-rent"
            type="number"
            min={1}
            step="0.01"
            value={draft.monthlyRentDollars}
            onChange={(event) => setDraft((current) => ({ ...current, monthlyRentDollars: event.target.value }))}
            required
            placeholder="Monthly rent (USD)"
          />
          <FieldLabel htmlFor="lease-deposit">Deposit</FieldLabel>
          <Input
            id="lease-deposit"
            type="number"
            min={0}
            step="0.01"
            value={draft.depositDollars}
            onChange={(event) => setDraft((current) => ({ ...current, depositDollars: event.target.value }))}
            placeholder="Deposit (USD)"
          />
          <FieldLabel htmlFor="lease-late-fee">Late Fee ($)</FieldLabel>
          <Input
            id="lease-late-fee"
            type="number"
            min={0}
            step="0.01"
            value={effectiveLateFeeDollars}
            onChange={(event) => {
              setLateFeeTouched(true);
              setDraft((current) => ({ ...current, lateFeeDollars: event.target.value }));
            }}
            placeholder="Suggested at 5% of monthly rent"
          />
          <FieldLabel htmlFor="lease-grace-period">Grace Period (days)</FieldLabel>
          <Input
            id="lease-grace-period"
            type="number"
            min={0}
            max={30}
            value={draft.gracePeriodDays}
            onChange={(event) => setDraft((current) => ({ ...current, gracePeriodDays: event.target.value }))}
            placeholder="Days before the late fee applies"
          />
          <LeaseCollectionSetting
            checked={draft.collectsOutsideDomus}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                collectsOutsideDomus: event.target.checked
              }))
            }
          />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--ink-2)]">Final step: review and save the lease.</p>
        <div className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--ink-2)]">
          <p><span className="font-semibold">Property:</span> {portfolio.properties.find((property) =>
            property.id === draft.propertyId)?.name ?? "Not set"}</p>
          <p><span className="font-semibold">Unit:</span> {portfolio.units.find((unit) =>
            unit.id === draft.unitId)?.unitNumber ?? "Not set"}</p>
          <p><span className="font-semibold">Tenant:</span> {portfolio.tenants.find((tenant) =>
            tenant.id === draft.tenantProfileId)?.email ?? "Not set"}</p>
          <p><span className="font-semibold">Dates:</span> {draft.startDate || "?"} → {draft.endDate || "?"}</p>
          <p><span className="font-semibold">Billing:</span> day {draft.dueDayOfMonth || "?"}, ${draft.monthlyRentDollars || "?"}/month</p>
          <p><span className="font-semibold">Late Fee:</span> ${effectiveLateFeeDollars || "0.00"}</p>
          <p><span className="font-semibold">Grace Period:</span> {draft.gracePeriodDays || "5"} days</p>
          <p><span className="font-semibold">Payment tracking:</span> {draft.collectsOutsideDomus
            ? "Tenant pays outside Domus" : "Managed in Domus"}</p>
        </div>
        {!requiredComplete && (
          <p className="text-xs text-[var(--warn)]">You can skip steps. Add all needed details before saving the lease.</p>
        )}
        <form className="space-y-2" action={action}>
          <input type="hidden" name="unitId" value={draft.unitId} />
          <input type="hidden" name="tenantProfileId" value={draft.tenantProfileId} />
          <input type="hidden" name="startDate" value={draft.startDate} />
          <input type="hidden" name="endDate" value={draft.endDate} />
          <input type="hidden" name="dueDayOfMonth" value={draft.dueDayOfMonth} />
          <input type="hidden" name="monthlyRentDollars" value={draft.monthlyRentDollars} />
          <input type="hidden" name="depositDollars" value={draft.depositDollars} />
          <input type="hidden" name="lateFeeDollars" value={effectiveLateFeeDollars} />
          <input type="hidden" name="gracePeriodDays" value={draft.gracePeriodDays} />
          <input type="hidden" name="collectsOutsideDomus" value={String(draft.collectsOutsideDomus)} />
          <SubmitButton className="w-full" title="Save this lease with the details above." disabled={!requiredComplete}>
            Save Lease
          </SubmitButton>
        </form>
      </div>
    );
  };

  return renderStep();
}
