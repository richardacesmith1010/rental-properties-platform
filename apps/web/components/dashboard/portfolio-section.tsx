"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import { Building2, Pencil } from "lucide-react";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/dashboard/empty-state";
import { EntityEditModal } from "@/components/dashboard/entity-edit-modal";
import { InlineEdit } from "@/components/dashboard/inline-edit";
import { SubmitButton } from "@/components/shared/submit-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AnimatedList } from "@/components/ui/animated-list";
import type { PropertyListItem } from "@/lib/portfolio";
import type { ActionState } from "@/app/actions";
import { Alert } from "@/components/ui/alert";
import { pluralize } from "@/lib/format";
import { buildEntityUpdateFormData, buildPropertyEditFields } from "@/lib/entity-edit-fields";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface PortfolioSectionProps {
  properties: PropertyListItem[];
  showControls?: boolean;
  previewCount?: number;
  onRenameProperty?: StatefulAction;
  onUpdateProperty?: StatefulAction;
  onDeleteProperty?: StatefulAction;
  onUpdateManagementFee?: StatefulAction;
  onSelectProperty?: (propertyId: string) => void;
  onGoToOperations?: () => void;
  getPropertyDetailHref?: (propertyId: string) => string;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Property actions are unavailable."
});

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <Alert variant="error" className="mb-3">
      {state.error}
    </Alert>
  );
}

function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return (
    <Alert variant="success" className="mb-3">
      {message}
    </Alert>
  );
}

export function PortfolioSection({
  properties,
  showControls = false,
  previewCount,
  onRenameProperty,
  onUpdateProperty,
  onDeleteProperty,
  onUpdateManagementFee,
  onSelectProperty,
  onGoToOperations,
  getPropertyDetailHref
}: PortfolioSectionProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [updateState, updateAction] = useFormState(onUpdateProperty ?? unavailableAction, null);
  const [deleteState, deleteAction] = useFormState(onDeleteProperty ?? unavailableAction, null);
  const [managementFeeState, managementFeeAction] = useFormState(
    onUpdateManagementFee ?? unavailableAction,
    null
  );
  const [activeEditPropertyId, setActiveEditPropertyId] = useState<string | null>(null);
  const [editingProperty, setEditingProperty] = useState<PropertyListItem | null>(null);
  const [confirmDeletePropertyId, setConfirmDeletePropertyId] = useState<string | null>(null);
  const deleteFormRefs = useRef<Record<string, HTMLFormElement | null>>({});
  const visibleProperties = previewCount && !expanded ? properties.slice(0, previewCount) : properties;
  const hasMore = previewCount != null && properties.length > previewCount;

  useEffect(() => {
    if (updateState?.success || deleteState?.success || managementFeeState?.success) {
      setActiveEditPropertyId(null);
      setEditingProperty(null);
      setConfirmDeletePropertyId(null);
    }
  }, [deleteState, managementFeeState, updateState]);

  return (
    <Card id="portfolio" className="border border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Your Portfolio</CardTitle>
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
            description="Add your first property to start managing your portfolio."
            actionLabel={onGoToOperations ? "Add Property" : undefined}
            onAction={onGoToOperations}
            actionVariant="default"
          />
        ) : (
          <>
            <AnimatedList>
              {visibleProperties.map((property, i) => (
              <div
                key={property.id}
                role={onSelectProperty && activeEditPropertyId !== property.id ? "button" : undefined}
                tabIndex={onSelectProperty && activeEditPropertyId !== property.id ? 0 : undefined}
                className={
                  onSelectProperty && activeEditPropertyId !== property.id
                    ? "rounded-2xl border border-border/40 bg-card/80 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2"
                    : undefined
                }
                onClick={() => {
                  if (onSelectProperty && activeEditPropertyId !== property.id) {
                    onSelectProperty(property.id);
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    onSelectProperty &&
                    activeEditPropertyId !== property.id &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    onSelectProperty(property.id);
                  }
                }}
                title={
                  onSelectProperty && activeEditPropertyId !== property.id
                    ? `Open the dashboard filtered to ${property.name}.`
                    : undefined
                }
              >
                <DataRow last={i === visibleProperties.length - 1}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {showControls && onRenameProperty ? (
                          <InlineEdit
                            value={property.name}
                            className="max-w-full text-base font-medium text-foreground"
                            successMessage="Property renamed."
                            title={`Rename ${property.name}.`}
                            validate={(nextName) =>
                              nextName.length > 120 ? "Property name must be under 120 characters." : null
                            }
                            onSave={async (nextName) => {
                              const formData = new FormData();
                              formData.set("propertyId", property.id);
                              formData.set("name", nextName);
                              const result = await onRenameProperty(null, formData);
                              if (result?.success) {
                                router.refresh();
                                return { message: result.message ?? "Property renamed." };
                              }
                              return { error: result?.error ?? "Unable to rename this property right now." };
                            }}
                          />
                        ) : (
                          <p className="text-base font-medium text-foreground">{property.name}</p>
                        )}
                      </div>
                      {showControls && onUpdateProperty ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11 shrink-0 rounded-md sm:h-8 sm:w-8"
                          onClick={() => setEditingProperty(property)}
                          title={`Edit ${property.name}`}
                          aria-label={`Edit ${property.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-500">{property.addressLine1}</p>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      {property.city}, {property.state} {property.postalCode}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500">{property.ownerAccountName}</p>
                    {property.managementFeeCents > 0 ? (
                      <p className="mt-0.5 text-sm text-zinc-500">
                        Management fee: ${(property.managementFeeCents / 100).toFixed(2)}
                      </p>
                    ) : null}
                    {showControls && activeEditPropertyId === property.id && (
                      <div className="mt-3 space-y-3" onClick={(event) => event.stopPropagation()}>
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
                  <div
                    className="flex flex-col items-stretch gap-2 sm:items-end"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <p className="text-sm text-zinc-500">{pluralize(property.unitCount, "unit")}</p>
                    {getPropertyDetailHref ? (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={getPropertyDetailHref(property.id)}
                          onClick={(event) => event.stopPropagation()}
                          title={`Open property details for ${property.name}.`}
                        >
                          View Details
                        </Link>
                      </Button>
                    ) : null}
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
              </div>
              ))}
            </AnimatedList>
            {hasMore ? (
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded((current) => !current)}
                  title={expanded ? "Collapse the property list preview." : "Show the full property list."}
                >
                  {expanded ? "Show Less" : `View All Properties (${properties.length})`}
                </Button>
              </div>
            ) : null}
          </>
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
      {editingProperty && onUpdateProperty ? (
        <EntityEditModal
          open
          onClose={() => setEditingProperty(null)}
          title="Edit Property"
          entityType="property"
          fields={buildPropertyEditFields(editingProperty)}
          onSave={async (updates) => {
            const result = await onUpdateProperty(
              null,
              buildEntityUpdateFormData({ propertyId: editingProperty.id }, updates)
            );
            if (result?.success) {
              router.refresh();
              return { message: result.message ?? "Property updated." };
            }
            return { error: result?.error ?? "Unable to update this property right now." };
          }}
        />
      ) : null}
    </Card>
  );
}
