"use client";

import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import type { PortfolioData } from "@/lib/portfolio";
import type { ActionState } from "@/app/actions";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface OperationsSectionProps {
  portfolio: PortfolioData;
  onCreateProperty: StatefulAction;
  onCreateUnit: StatefulAction;
  onCreateLease: StatefulAction;
}

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
      {state.error}
    </p>
  );
}

function FormSuccess({ state }: { state: ActionState }) {
  if (!state || !state.success) return null;
  return (
    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
      Saved successfully!
    </p>
  );
}

export function OperationsSection({
  portfolio,
  onCreateProperty,
  onCreateUnit,
  onCreateLease,
}: OperationsSectionProps) {
  const [propertyState, propertyAction] = useFormState(onCreateProperty, null);
  const [unitState, unitAction] = useFormState(onCreateUnit, null);
  const [leaseState, leaseAction] = useFormState(onCreateLease, null);

  return (
    <div id="operations" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Add Property */}
      <Card>
        <CardHeader>
          <CardTitle>Add Property</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" action={propertyAction}>
            <FormError state={propertyState} />
            <FormSuccess state={propertyState} />
            <Input name="name" placeholder="Property name" required />
            <Input name="addressLine1" placeholder="Street address" required />
            <Input name="city" placeholder="City" required />
            <Input name="state" placeholder="State" required />
            <Input name="postalCode" placeholder="ZIP" required />
            <SubmitButton className="w-full">Save Property</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Add Unit */}
      <Card>
        <CardHeader>
          <CardTitle>Add Unit</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" action={unitAction}>
            <FormError state={unitState} />
            <FormSuccess state={unitState} />
            <Select name="propertyId" required>
              <option value="">Select property</option>
              {portfolio.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </Select>
            <Input name="unitNumber" placeholder="Unit number (ex: 2B)" required />
            <Input
              name="bedrooms"
              type="number"
              min={0}
              placeholder="Bedrooms"
              defaultValue={1}
              required
            />
            <Input
              name="bathrooms"
              type="number"
              min={0}
              step="0.5"
              placeholder="Bathrooms"
              defaultValue={1}
              required
            />
            <Input
              name="monthlyRentDollars"
              type="number"
              min={1}
              step="0.01"
              placeholder="Monthly rent (USD)"
              required
            />
            <SubmitButton className="w-full">Save Unit</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Create Lease */}
      <Card>
        <CardHeader>
          <CardTitle>Create Lease</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" action={leaseAction}>
            <FormError state={leaseState} />
            <FormSuccess state={leaseState} />
            <Select name="unitId" required>
              <option value="">Select unit</option>
              {portfolio.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.propertyName} &bull; Unit {unit.unitNumber}
                </option>
              ))}
            </Select>
            <Select name="tenantProfileId" required>
              <option value="">Select tenant</option>
              {portfolio.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.fullName} ({tenant.email})
                </option>
              ))}
            </Select>
            <Input name="startDate" type="date" required />
            <Input name="endDate" type="date" required />
            <Input
              name="dueDayOfMonth"
              type="number"
              min={1}
              max={28}
              defaultValue={1}
              required
            />
            <Input
              name="monthlyRentDollars"
              type="number"
              min={1}
              step="0.01"
              placeholder="Monthly rent (USD)"
              required
            />
            <Input
              name="depositDollars"
              type="number"
              min={0}
              step="0.01"
              placeholder="Deposit (USD)"
              defaultValue={0}
              required
            />
            <SubmitButton className="w-full">Save Lease</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
