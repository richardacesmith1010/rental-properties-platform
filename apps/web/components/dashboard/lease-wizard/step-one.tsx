import { Building2, ClipboardList, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import type { PropertyListItem, UnitListItem } from "@/lib/portfolio";
import { type LeaseWizardDraft } from "../lease-wizard-support";

export function LeaseWizardStepOne({
  properties,
  availableUnits,
  totalUnitsForProperty,
  draft,
  onPropertyChange,
  onUnitChange,
  onCreatePropertyAction,
  onAddUnitAction
}: {
  properties: PropertyListItem[];
  availableUnits: UnitListItem[];
  totalUnitsForProperty: number;
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
                Create a property before you set up a lease.
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
                  <p className="font-medium text-foreground">
                    {totalUnitsForProperty === 0
                      ? `${selectedProperty.name} has no units`
                      : `Every unit at ${selectedProperty.name} has a lease`}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {totalUnitsForProperty === 0
                      ? "Add a unit to this property before creating a lease."
                      : "Add a new unit, or end a lease first."}
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
              <p className="mt-1">Only empty units appear here. This prevents two leases for one unit.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

