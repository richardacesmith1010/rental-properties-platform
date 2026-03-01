"use client";

import { useFormState } from "react-dom";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UnitListItem } from "@/lib/portfolio";
import type { ActionState } from "@/app/actions";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface UnitsSectionProps {
  units: UnitListItem[];
  showControls?: boolean;
  onUpdateUnit?: StatefulAction;
  onDeleteUnit?: StatefulAction;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Unit actions are unavailable."
});

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

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

export function UnitsSection({
  units,
  showControls = false,
  onUpdateUnit,
  onDeleteUnit
}: UnitsSectionProps) {
  const [updateState, updateAction] = useFormState(onUpdateUnit ?? unavailableAction, null);
  const [deleteState, deleteAction] = useFormState(onDeleteUnit ?? unavailableAction, null);

  return (
    <Card id="units">
      <CardHeader>
        <CardTitle>Units</CardTitle>
      </CardHeader>
      <CardContent>
        {showControls && (
          <>
            <FormError state={updateState} />
            <FormError state={deleteState} />
            <FormSuccess state={updateState} message="Unit updated." />
            <FormSuccess state={deleteState} message="Unit archived." />
          </>
        )}

        {units.length === 0 ? (
          <EmptyState message="No units yet. Add one in Operations." />
        ) : (
          <div>
            {units.map((unit, i) => (
              <DataRow key={unit.id} last={i === units.length - 1}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">
                    {unit.propertyName} • Unit {unit.unitNumber}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {unit.bedrooms} bd / {unit.bathrooms} ba • {unit.occupied ? "Occupied" : "Vacant"}
                  </p>

                  {showControls && (
                    <form action={updateAction} className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="unitId" value={unit.id} />
                      <Input name="unitNumber" defaultValue={unit.unitNumber} required />
                      <Input
                        name="bedrooms"
                        type="number"
                        min={0}
                        step="1"
                        defaultValue={unit.bedrooms}
                        required
                      />
                      <Input
                        name="bathrooms"
                        type="number"
                        min={0}
                        step="0.5"
                        defaultValue={unit.bathrooms}
                        required
                      />
                      <Input
                        name="monthlyRentDollars"
                        type="number"
                        min={1}
                        step="0.01"
                        defaultValue={unit.monthlyRentCents / 100}
                        required
                      />
                      <div className="sm:col-span-2">
                        <SubmitButton size="sm" variant="outline" title="Save updates for this unit.">
                          Save Unit Changes
                        </SubmitButton>
                      </div>
                    </form>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <p className="text-xs text-zinc-500">{dollars(unit.monthlyRentCents)}</p>
                  {showControls && (
                    <form
                      action={deleteAction}
                      onSubmit={(event) => {
                        if (!window.confirm("Are you sure? This will archive the unit.")) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="unitId" value={unit.id} />
                      <Button type="submit" size="sm" variant="destructive" title="Archive this unit.">
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
