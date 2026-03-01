"use client";

import { useFormState } from "react-dom";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PropertyListItem } from "@/lib/portfolio";
import type { ActionState } from "@/app/actions";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface PortfolioSectionProps {
  properties: PropertyListItem[];
  showControls?: boolean;
  onUpdateProperty?: StatefulAction;
  onDeleteProperty?: StatefulAction;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Property actions are unavailable."
});

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
      {state.error}
    </p>
  );
}

function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return (
    <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
      {message}
    </p>
  );
}

export function PortfolioSection({
  properties,
  showControls = false,
  onUpdateProperty,
  onDeleteProperty
}: PortfolioSectionProps) {
  const [updateState, updateAction] = useFormState(onUpdateProperty ?? unavailableAction, null);
  const [deleteState, deleteAction] = useFormState(onDeleteProperty ?? unavailableAction, null);

  return (
    <Card id="portfolio">
      <CardHeader>
        <CardTitle>Your Portfolio</CardTitle>
      </CardHeader>
      <CardContent>
        {showControls && (
          <>
            <FormError state={updateState} />
            <FormError state={deleteState} />
            <FormSuccess state={updateState} message="Property updated." />
            <FormSuccess state={deleteState} message="Property archived." />
          </>
        )}

        {properties.length === 0 ? (
          <EmptyState message="Start by adding your first property." />
        ) : (
          <div>
            {properties.map((property, i) => (
              <DataRow key={property.id} last={i === properties.length - 1}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">{property.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{property.addressLine1}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {property.city}, {property.state} {property.postalCode}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{property.ownerAccountName}</p>
                  {showControls && (
                    <form action={updateAction} className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="propertyId" value={property.id} />
                      <Input name="name" defaultValue={property.name} required />
                      <Input name="addressLine1" defaultValue={property.addressLine1} required />
                      <Input name="city" defaultValue={property.city} required />
                      <Input name="state" defaultValue={property.state} required />
                      <Input name="postalCode" defaultValue={property.postalCode} required />
                      <div className="sm:col-span-2">
                        <SubmitButton size="sm" variant="outline" title="Save updates to this property profile.">
                          Save Property Changes
                        </SubmitButton>
                      </div>
                    </form>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-xs text-zinc-500">{property.unitCount} units</p>
                  {showControls && (
                    <form
                      action={deleteAction}
                      onSubmit={(event) => {
                        if (!window.confirm("Are you sure? This will archive the property.")) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="propertyId" value={property.id} />
                      <Button type="submit" size="sm" variant="destructive" title="Archive this property.">
                        Archive
                      </Button>
                    </form>
                  )}
                </div>
              </DataRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
