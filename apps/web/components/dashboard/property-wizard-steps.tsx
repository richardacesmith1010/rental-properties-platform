"use client";

import type { Dispatch, SetStateAction } from "react";
import { Building2, Home, UserRoundPlus } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import {
  PROPERTY_TYPE_OPTIONS, createUnitDraft, shouldAdvanceOnEnter,
  type PropertyType, type UnitDraft, type LeaseDraft, type WizardStep
} from "./property-wizard-drafts";

interface PropertyAndUnitStepsProps {
  step: WizardStep;
  propertyName: string;
  setPropertyName: Dispatch<SetStateAction<string>>;
  addressLine1: string;
  setAddressLine1: Dispatch<SetStateAction<string>>;
  city: string;
  setCity: Dispatch<SetStateAction<string>>;
  stateCode: string;
  setStateCode: Dispatch<SetStateAction<string>>;
  postalCode: string;
  setPostalCode: Dispatch<SetStateAction<string>>;
  propertyType: PropertyType;
  setPropertyType: Dispatch<SetStateAction<PropertyType>>;
  hasMultipleUnits: boolean;
  setHasMultipleUnits: Dispatch<SetStateAction<boolean>>;
  units: UnitDraft[];
  setUnits: Dispatch<SetStateAction<UnitDraft[]>>;
  goNext: () => void;
}

export function PropertyAndUnitSteps({
  step,
  propertyName,
  setPropertyName,
  addressLine1,
  setAddressLine1,
  city,
  setCity,
  stateCode,
  setStateCode,
  postalCode,
  setPostalCode,
  propertyType,
  setPropertyType,
  hasMultipleUnits,
  setHasMultipleUnits,
  units,
  setUnits,
  goNext,
}: PropertyAndUnitStepsProps) {
  return (
    <>
      {step === "property" ? (
        <form
          className="space-y-5"
          onKeyDown={(event) => {
            if (shouldAdvanceOnEnter(event)) {
              event.preventDefault();
              goNext();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            goNext();
          }}
        >
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
            <Building2 className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Property details</h3>
              <p className="text-sm text-muted-foreground">
                Start with the address and property type.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium text-foreground md:col-span-2">
              <span>Property name</span>
              <Input
                data-autofocus="true"
                value={propertyName}
                onChange={(event) => setPropertyName(event.target.value)}
                placeholder="Maple House"
                title="Enter a recognizable property name."
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-foreground md:col-span-2">
              <span>Street address</span>
              <Input
                value={addressLine1}
                onChange={(event) => setAddressLine1(event.target.value)}
                placeholder="123 Main St"
                title="Enter the street address."
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              <span>City</span>
              <Input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Springfield"
                title="Enter the city."
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              <span>State</span>
              <Input
                value={stateCode}
                onChange={(event) => setStateCode(event.target.value)}
                placeholder="IL"
                title="Enter the two-letter state code."
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              <span>ZIP code</span>
              <Input
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                placeholder="62701"
                title="Enter the ZIP code."
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              <span>Property type</span>
              <Select
                value={propertyType}
                onChange={(event) => setPropertyType(event.target.value as PropertyType)}
                title="Choose the property type."
              >
                {PROPERTY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </form>
      ) : null}

      {step === "unit" ? (
        <form
          className="space-y-5"
          onKeyDown={(event) => {
            if (shouldAdvanceOnEnter(event)) {
              event.preventDefault();
              goNext();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            goNext();
          }}
        >
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
            <Home className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Units</h3>
              <p className="text-sm text-muted-foreground">
                Add a unit now. Its rent and name will appear in the lease.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
            <Button
              type="button"
              variant={hasMultipleUnits ? "outline" : "default"}
              size="sm"
              onClick={() => setHasMultipleUnits(false)}
              title="Set up a single rentable unit."
            >
              One unit
            </Button>
            <Button
              type="button"
              variant={hasMultipleUnits ? "default" : "outline"}
              size="sm"
              onClick={() => setHasMultipleUnits(true)}
              title="Add multiple rentable units to this property."
            >
              Multiple units
            </Button>
          </div>

          <div className="space-y-3">
            {units.map((unit, index) => (
              <div key={unit.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {unit.label || `Unit ${index + 1}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Rent, beds, baths, and square footage live here.
                    </p>
                  </div>
                  {hasMultipleUnits && units.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setUnits((current) => current.filter((entry) => entry.id !== unit.id))
                      }
                      title="Remove this draft unit."
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <label className="space-y-1.5 text-sm font-medium text-foreground xl:col-span-1">
                    <span>Label</span>
                    <Input
                      data-autofocus={index === 0 ? "true" : undefined}
                      value={unit.label}
                      onChange={(event) =>
                        setUnits((current) =>
                          current.map((entry) =>
                            entry.id === unit.id ? { ...entry, label: event.target.value } : entry,
                          ),
                        )
                      }
                      placeholder="Unit A"
                      title="Enter the unit label."
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    <span>Bedrooms</span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={unit.bedrooms}
                      onChange={(event) =>
                        setUnits((current) =>
                          current.map((entry) =>
                            entry.id === unit.id
                              ? { ...entry, bedrooms: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      title="Enter the bedroom count."
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    <span>Bathrooms</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={unit.bathrooms}
                      onChange={(event) =>
                        setUnits((current) =>
                          current.map((entry) =>
                            entry.id === unit.id
                              ? { ...entry, bathrooms: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      title="Enter the bathroom count."
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    <span>Sq ft</span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={unit.squareFeet}
                      onChange={(event) =>
                        setUnits((current) =>
                          current.map((entry) =>
                            entry.id === unit.id
                              ? { ...entry, squareFeet: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      placeholder="Optional"
                      title="Enter square footage if you know it."
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    <span>Monthly rent</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={unit.monthlyRentDollars}
                      onChange={(event) =>
                        setUnits((current) =>
                          current.map((entry) =>
                            entry.id === unit.id
                              ? { ...entry, monthlyRentDollars: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      placeholder="2350"
                      title="Enter the monthly rent for this unit."
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {hasMultipleUnits ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setUnits((current) => [...current, createUnitDraft(current.length)])}
              title="Add another unit to this setup draft."
            >
              Add another unit
            </Button>
          ) : null}
        </form>
      ) : null}
    </>
  );
}

interface LeaseStepProps {
  step: WizardStep;
  lease: LeaseDraft;
  setLease: Dispatch<SetStateAction<LeaseDraft>>;
  units: UnitDraft[];
  goNext: () => void;
}

export function LeaseStep({ step, lease, setLease, units, goNext }: LeaseStepProps) {
  return (
    <>
      {step === "lease" ? (
        <form
          className="space-y-5"
          onKeyDown={(event) => {
            if (shouldAdvanceOnEnter(event)) {
              event.preventDefault();
              goNext();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            goNext();
          }}
        >
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
            <UserRoundPlus className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Lease and tenant</h3>
              <p className="text-sm text-muted-foreground">
                Have a tenant? Domus will invite them and create the lease.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
            <Button
              type="button"
              variant={lease.hasTenant ? "default" : "outline"}
              size="sm"
              onClick={() => setLease((current) => ({ ...current, hasTenant: true }))}
              title="Set up the first lease and send the tenant invite now."
            >
              Yes, I have a tenant
            </Button>
            <Button
              type="button"
              variant={!lease.hasTenant ? "default" : "outline"}
              size="sm"
              onClick={() => setLease((current) => ({ ...current, hasTenant: false }))}
              title="Skip the lease and tenant for now."
            >
              No, skip for now
            </Button>
          </div>

          {lease.hasTenant ? (
            <div className="grid gap-4 md:grid-cols-2">
              {units.length > 1 ? (
                <label className="space-y-1.5 text-sm font-medium text-foreground md:col-span-2">
                  <span>Which unit is this lease for?</span>
                  <Select
                    value={lease.leasedUnitId}
                    onChange={(event) =>
                      setLease((current) => ({ ...current, leasedUnitId: event.target.value }))
                    }
                    title="Choose the unit for this first lease."
                  >
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.label}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              <label className="space-y-1.5 text-sm font-medium text-foreground md:col-span-2">
                <span>Tenant email</span>
                <Input
                  data-autofocus="true"
                  type="email"
                  value={lease.tenantEmail}
                  onChange={(event) =>
                    setLease((current) => ({ ...current, tenantEmail: event.target.value }))
                  }
                  placeholder="tenant@example.com"
                  title="Enter the tenant email. Domus will send the invitation there."
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-foreground">
                <span>Lease start date</span>
                <Input
                  type="date"
                  value={lease.startDate}
                  onChange={(event) =>
                    setLease((current) => ({ ...current, startDate: event.target.value }))
                  }
                  title="Enter the lease start date."
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-foreground">
                <span>Lease end date</span>
                <Input
                  type="date"
                  value={lease.endDate}
                  onChange={(event) =>
                    setLease((current) => ({ ...current, endDate: event.target.value }))
                  }
                  title="Enter the lease end date."
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-foreground">
                <span>Monthly rent</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lease.monthlyRentDollars}
                  onChange={(event) =>
                    setLease((current) => ({ ...current, monthlyRentDollars: event.target.value }))
                  }
                  title="Confirm the monthly rent for the lease."
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-foreground">
                <span>Security deposit</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lease.depositDollars}
                  onChange={(event) =>
                    setLease((current) => ({ ...current, depositDollars: event.target.value }))
                  }
                  title="Optional security deposit amount."
                />
              </label>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-5 text-sm leading-6 text-muted-foreground">
              Domus will create the property and unit(s) now. You can add the tenant and lease later
              from the Leases section.
            </div>
          )}
        </form>
      ) : null}
    </>
  );
}
