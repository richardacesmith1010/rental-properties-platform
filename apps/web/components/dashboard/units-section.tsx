"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { DoorOpen } from "lucide-react";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatedList } from "@/components/ui/animated-list";
import type { UnitListItem } from "@/lib/portfolio";
import type { ActionState } from "@/app/actions";
import { formatCurrency } from "@/lib/format";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface UnitsSectionProps {
  units: UnitListItem[];
  showControls?: boolean;
  onUpdateUnit?: StatefulAction;
  onDeleteUnit?: StatefulAction;
  onGoToOperations?: () => void;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Unit actions are unavailable."
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

export function UnitsSection({
  units,
  showControls = false,
  onUpdateUnit,
  onDeleteUnit,
  onGoToOperations
}: UnitsSectionProps) {
  const [updateState, updateAction] = useFormState(onUpdateUnit ?? unavailableAction, null);
  const [deleteState, deleteAction] = useFormState(onDeleteUnit ?? unavailableAction, null);
  const [activeEditUnitId, setActiveEditUnitId] = useState<string | null>(null);
  const [confirmDeleteUnitId, setConfirmDeleteUnitId] = useState<string | null>(null);
  const deleteFormRefs = useRef<Record<string, HTMLFormElement | null>>({});

  useEffect(() => {
    if (updateState?.success || deleteState?.success) {
      setActiveEditUnitId(null);
      setConfirmDeleteUnitId(null);
    }
  }, [deleteState, updateState]);

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
          <EmptyState
            icon={DoorOpen}
            title="No units yet"
            description="Add units to your properties to start creating leases."
            actionLabel={onGoToOperations ? "Go to Operations" : undefined}
            onAction={onGoToOperations}
          />
        ) : (
          <AnimatedList>
            {units.map((unit, i) => (
              <DataRow key={unit.id} last={i === units.length - 1}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">
                    {unit.propertyName} • Unit {unit.unitNumber}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span>{unit.bedrooms} bd / {unit.bathrooms} ba</span>
                    <Badge variant={unit.occupied ? "success" : "outline"}>
                      {unit.occupied ? "Occupied" : "Vacant"}
                    </Badge>
                  </div>

                  {showControls && activeEditUnitId === unit.id && (
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
                  <p className="text-xs text-zinc-500">{formatCurrency(unit.monthlyRentCents)}</p>
                  {showControls && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant={activeEditUnitId === unit.id ? "default" : "outline"}
                        onClick={() =>
                          setActiveEditUnitId((current) =>
                            current === unit.id ? null : unit.id
                          )
                        }
                        title={
                          activeEditUnitId === unit.id
                            ? "Hide unit edit controls."
                            : "Open unit edit controls."
                        }
                      >
                        {activeEditUnitId === unit.id ? "Done" : "Manage"}
                      </Button>
                      {activeEditUnitId === unit.id && (
                        <form
                          action={deleteAction}
                          ref={(node) => {
                            deleteFormRefs.current[unit.id] = node;
                          }}
                        >
                          <input type="hidden" name="unitId" value={unit.id} />
                          <SubmitButton
                            size="sm"
                            variant="destructive"
                            onClick={(event) => {
                              event.preventDefault();
                              setConfirmDeleteUnitId(unit.id);
                            }}
                            title="Archive this unit."
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
        title="Archive Unit?"
        description="Are you sure? This will archive the unit and remove it from active leasing options."
        confirmLabel="Archive Unit"
        open={confirmDeleteUnitId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDeleteUnitId(null);
          }
        }}
        onConfirm={() => {
          if (!confirmDeleteUnitId) return;
          deleteFormRefs.current[confirmDeleteUnitId]?.requestSubmit();
        }}
      />
    </Card>
  );
}
