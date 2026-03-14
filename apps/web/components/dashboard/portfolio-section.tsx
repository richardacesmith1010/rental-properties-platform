"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { Building2 } from "lucide-react";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AnimatedList } from "@/components/ui/animated-list";
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
  onUpdateManagementFee?: StatefulAction;
  onGoToOperations?: () => void;
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
  onDeleteProperty,
  onUpdateManagementFee,
  onGoToOperations
}: PortfolioSectionProps) {
  const [updateState, updateAction] = useFormState(onUpdateProperty ?? unavailableAction, null);
  const [deleteState, deleteAction] = useFormState(onDeleteProperty ?? unavailableAction, null);
  const [managementFeeState, managementFeeAction] = useFormState(
    onUpdateManagementFee ?? unavailableAction,
    null
  );
  const [activeEditPropertyId, setActiveEditPropertyId] = useState<string | null>(null);
  const [confirmDeletePropertyId, setConfirmDeletePropertyId] = useState<string | null>(null);
  const deleteFormRefs = useRef<Record<string, HTMLFormElement | null>>({});

  useEffect(() => {
    if (updateState?.success || deleteState?.success || managementFeeState?.success) {
      setActiveEditPropertyId(null);
      setConfirmDeletePropertyId(null);
    }
  }, [deleteState, managementFeeState, updateState]);

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
            <FormError state={managementFeeState} />
            <FormSuccess state={updateState} message="Property updated." />
            <FormSuccess state={deleteState} message="Property archived." />
            <FormSuccess state={managementFeeState} message="Management fee updated." />
          </>
        )}

        {properties.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No properties yet"
            description="Create your first property to start managing your portfolio."
            actionLabel={onGoToOperations ? "Go to Operations" : undefined}
            onAction={onGoToOperations}
          />
        ) : (
          <AnimatedList>
            {properties.map((property, i) => (
              <DataRow key={property.id} last={i === properties.length - 1}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">{property.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{property.addressLine1}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {property.city}, {property.state} {property.postalCode}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{property.ownerAccountName}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Management fee: ${(property.managementFeeCents / 100).toFixed(2)}
                  </p>
                  {showControls && activeEditPropertyId === property.id && (
                    <div className="mt-3 space-y-3">
                      <form action={updateAction} className="grid gap-2 sm:grid-cols-2">
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
                      {onUpdateManagementFee ? (
                        <form action={managementFeeAction} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                          <input type="hidden" name="propertyId" value={property.id} />
                          <div className="space-y-1">
                            <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                              Management fee (USD)
                            </label>
                            <Input
                              name="managementFeeDollars"
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={(property.managementFeeCents / 100).toFixed(2)}
                              title="Set the management fee that routes to the assigned manager on each online payment."
                            />
                          </div>
                          <SubmitButton
                            size="sm"
                            variant="outline"
                            title="Save the management fee split for this property."
                          >
                            Save Fee
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-xs text-zinc-500">{property.unitCount} units</p>
                  {showControls && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant={activeEditPropertyId === property.id ? "default" : "outline"}
                        onClick={() =>
                          setActiveEditPropertyId((current) =>
                            current === property.id ? null : property.id
                          )
                        }
                        title={
                          activeEditPropertyId === property.id
                            ? "Hide property edit controls."
                            : "Open property edit controls."
                        }
                      >
                        {activeEditPropertyId === property.id ? "Done" : "Manage"}
                      </Button>
                      {activeEditPropertyId === property.id && (
                        <form
                          action={deleteAction}
                          ref={(node) => {
                            deleteFormRefs.current[property.id] = node;
                          }}
                        >
                          <input type="hidden" name="propertyId" value={property.id} />
                          <SubmitButton
                            size="sm"
                            variant="destructive"
                            onClick={(event) => {
                              event.preventDefault();
                              setConfirmDeletePropertyId(property.id);
                            }}
                            title="Archive this property."
                          >
                            Archive
                          </SubmitButton>
                        </form>
                      )}
                    </>
                  )}
                </div>
              </DataRow>
            ))}
          </AnimatedList>
        )}
      </CardContent>
      <ConfirmDialog
        title="Archive Property?"
        description="Are you sure? This will archive the property and remove it from active workflows."
        confirmLabel="Archive Property"
        open={confirmDeletePropertyId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDeletePropertyId(null);
          }
        }}
        onConfirm={() => {
          if (!confirmDeletePropertyId) return;
          deleteFormRefs.current[confirmDeletePropertyId]?.requestSubmit();
        }}
      />
    </Card>
  );
}
