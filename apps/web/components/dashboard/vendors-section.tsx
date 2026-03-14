"use client";

import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { HardHat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import { AnimatedList } from "@/components/ui/animated-list";
import type { ActionState } from "@/app/actions";
import type { VendorDTO } from "@/lib/vendors";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import { Select } from "@/components/ui/select";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface VendorsSectionProps {
  vendors: VendorDTO[];
  ownershipAccounts: OwnershipAccountDTO[];
  onCreateVendor: StatefulAction;
  onUpdateVendor?: StatefulAction;
  onCreateVendorSuccess?: () => void;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Vendor update is unavailable."
});

const tradeOptions = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "hvac", label: "HVAC" },
  { value: "general", label: "General" },
  { value: "landscaping", label: "Landscaping" },
  { value: "cleaning", label: "Cleaning" },
  { value: "roofing", label: "Roofing" },
  { value: "painting", label: "Painting" },
  { value: "appliance", label: "Appliance" },
  { value: "other", label: "Other" }
];
const CREATE_VENDOR_STEPS = [
  "Vendor Name",
  "Contact Email",
  "Contact Phone",
  "Trade Category",
  "Ownership Account",
  "Preferred",
  "Review & Save"
] as const;

interface VendorDraft {
  name: string;
  email: string;
  phone: string;
  tradeCategory: string;
  ownerAccountId: string;
  preferred: boolean;
}

function tradeLabel(value: string | null) {
  if (!value) {
    return "Other";
  }
  return tradeOptions.find((option) => option.value === value)?.label ?? value;
}

function StepPill({
  label,
  active,
  done,
  skipped
}: {
  label: string;
  active: boolean;
  done: boolean;
  skipped: boolean;
}) {
  const className = active
    ? "border-violet-300 bg-violet-50 text-violet-700"
    : done
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : skipped
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-500";
  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

function onEnterNext(event: KeyboardEvent<HTMLInputElement>, canAdvance: boolean, advance: () => void) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!canAdvance) return;
  advance();
}

export function VendorsSection({
  vendors,
  ownershipAccounts,
  onCreateVendor,
  onUpdateVendor,
  onCreateVendorSuccess
}: VendorsSectionProps) {
  const [state, action] = useFormState(onCreateVendor, null);
  const [handledCreateState, setHandledCreateState] = useState<ActionState>(null);
  const [createStep, setCreateStep] = useState(0);
  const [skippedCreateSteps, setSkippedCreateSteps] = useState<number[]>([]);
  const [tradeFilter, setTradeFilter] = useState("all");
  const [showCreateWhenEmpty, setShowCreateWhenEmpty] = useState(false);
  const [vendorDraft, setVendorDraft] = useState<VendorDraft>({
    name: "",
    email: "",
    phone: "",
    tradeCategory: "other",
    ownerAccountId: "",
    preferred: false
  });
  const filteredVendors = useMemo(() => {
    const sorted = [...vendors].sort((left, right) => {
      if (left.preferred !== right.preferred) {
        return Number(right.preferred) - Number(left.preferred);
      }
      return left.name.localeCompare(right.name);
    });

    if (tradeFilter === "all") {
      return sorted;
    }

    return sorted.filter((vendor) => (vendor.tradeCategory ?? "other") === tradeFilter);
  }, [tradeFilter, vendors]);

  useEffect(() => {
    if (!state?.success || !onCreateVendorSuccess) return;
    if (handledCreateState === state) return;
    setHandledCreateState(state);
    setCreateStep(0);
    setSkippedCreateSteps([]);
    setVendorDraft({
      name: "",
      email: "",
      phone: "",
      tradeCategory: "other",
      ownerAccountId: "",
      preferred: false
    });
    onCreateVendorSuccess();
  }, [handledCreateState, onCreateVendorSuccess, state]);

  const createRequiredComplete = Boolean(vendorDraft.name && vendorDraft.tradeCategory);
  const showCreateWorkflow = vendors.length > 0 || showCreateWhenEmpty;

  const createStepComplete = (step: number) => {
    if (step === 0) return Boolean(vendorDraft.name);
    if (step === 3) return Boolean(vendorDraft.tradeCategory);
    if (step === 1 || step === 2 || step === 4 || step === 5) return true;
    return createRequiredComplete;
  };

  const canSkipCreateStep = (step: number) => step === 1 || step === 2 || step === 4 || step === 5;

  return (
    <Card id="vendors">
      <CardHeader>
        <CardTitle>Vendors</CardTitle>
      </CardHeader>
      <CardContent>
        {showCreateWorkflow ? (
          <div className="mb-4 space-y-4">
          <p className="text-sm text-zinc-600">
            One field at a time. Press Enter or Next to continue. Optional steps can be skipped.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {CREATE_VENDOR_STEPS.map((label, index) => (
              <StepPill
                key={label}
                label={label}
                active={createStep === index}
                done={createStepComplete(index)}
                skipped={skippedCreateSteps.includes(index)}
              />
            ))}
          </div>

          {createStep === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">Step 1: Enter the vendor business name.</p>
              <Input
                value={vendorDraft.name}
                onChange={(event) =>
                  setVendorDraft((current) => ({ ...current, name: event.target.value }))
                }
                onKeyDown={(event) =>
                  onEnterNext(event, createStepComplete(createStep), () => setCreateStep(1))
                }
                placeholder="Vendor name"
                required
              />
            </div>
          )}

          {createStep === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">Step 2: Enter contact email (optional).</p>
              <Input
                value={vendorDraft.email}
                onChange={(event) =>
                  setVendorDraft((current) => ({ ...current, email: event.target.value }))
                }
                onKeyDown={(event) =>
                  onEnterNext(event, true, () => setCreateStep(2))
                }
                type="email"
                placeholder="Email"
              />
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">Step 3: Enter contact phone (optional).</p>
              <Input
                value={vendorDraft.phone}
                onChange={(event) =>
                  setVendorDraft((current) => ({ ...current, phone: event.target.value }))
                }
                onKeyDown={(event) =>
                  onEnterNext(event, true, () => setCreateStep(3))
                }
                placeholder="Phone"
              />
            </div>
          )}

          {createStep === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">Step 4: Choose the trade category.</p>
              <Select
                value={vendorDraft.tradeCategory}
                onChange={(event) =>
                  setVendorDraft((current) => ({ ...current, tradeCategory: event.target.value }))
                }
              >
                {tradeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {createStep === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">Step 5: Choose ownership account (optional).</p>
              <Select
                value={vendorDraft.ownerAccountId}
                onChange={(event) =>
                  setVendorDraft((current) => ({
                    ...current,
                    ownerAccountId: event.target.value
                  }))
                }
              >
                <option value="">Default ownership account</option>
                {ownershipAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {createStep === 5 && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">Step 6: Mark as preferred vendor (optional).</p>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={vendorDraft.preferred}
                  onChange={(event) =>
                    setVendorDraft((current) => ({ ...current, preferred: event.target.checked }))
                  }
                />
                Mark as preferred vendor
              </label>
            </div>
          )}

          {createStep === 6 && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">Final step: review and save vendor.</p>
              <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                <p><span className="font-semibold">Name:</span> {vendorDraft.name || "Not set"}</p>
                <p><span className="font-semibold">Trade:</span> {tradeLabel(vendorDraft.tradeCategory)}</p>
                <p><span className="font-semibold">Email:</span> {vendorDraft.email || "Not set"}</p>
                <p><span className="font-semibold">Phone:</span> {vendorDraft.phone || "Not set"}</p>
                <p><span className="font-semibold">Preferred:</span> {vendorDraft.preferred ? "Yes" : "No"}</p>
              </div>
              <form action={action} className="space-y-2">
                <input type="hidden" name="name" value={vendorDraft.name} />
                <input type="hidden" name="email" value={vendorDraft.email} />
                <input type="hidden" name="phone" value={vendorDraft.phone} />
                <input type="hidden" name="tradeCategory" value={vendorDraft.tradeCategory} />
                <input type="hidden" name="ownerAccountId" value={vendorDraft.ownerAccountId} />
                <input type="hidden" name="preferred" value={vendorDraft.preferred ? "true" : "false"} />
                <SubmitButton
                  size="sm"
                  className="w-full"
                  disabled={!createRequiredComplete}
                  title="Create this vendor record for future assignments."
                >
                  Save New Vendor
                </SubmitButton>
              </form>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCreateStep((current) => Math.max(current - 1, 0))}
              disabled={createStep === 0}
              title="Go back one step."
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setCreateStep((current) => Math.min(current + 1, CREATE_VENDOR_STEPS.length - 1))}
              disabled={createStep >= CREATE_VENDOR_STEPS.length - 1 || !createStepComplete(createStep)}
              title="Complete this step and move to the next step."
            >
              Next
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSkippedCreateSteps((previous) =>
                  previous.includes(createStep) ? previous : [...previous, createStep]
                );
                setCreateStep((current) => Math.min(current + 1, CREATE_VENDOR_STEPS.length - 1));
              }}
              disabled={!canSkipCreateStep(createStep)}
              title="Skip this optional step for now and continue."
            >
              Skip for now
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setCreateStep(0);
                setSkippedCreateSteps([]);
              }}
              title="Restart vendor entry from step one."
            >
              Restart
            </Button>
          </div>
          {state && !state.success && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{state.error}</p>
          )}
          {state && state.success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-600">Vendor added.</p>
          )}
          </div>
        ) : null}

        {vendors.length > 0 ? (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Filter by trade:</span>
            <Select value={tradeFilter} onChange={(event) => setTradeFilter(event.target.value)} className="h-8 w-44 text-xs">
              <option value="all">All trades</option>
              {tradeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {vendors.length === 0 && !showCreateWhenEmpty ? (
          <EmptyState
            icon={HardHat}
            title="No vendors yet"
            description="Add your first vendor to track maintenance contractors."
            actionLabel="Add Vendor"
            onAction={() => setShowCreateWhenEmpty(true)}
          />
        ) : filteredVendors.length === 0 ? (
          <EmptyState
            icon={HardHat}
            title="No vendors match this filter"
            description="Adjust the trade filter to see more vendor records."
          />
        ) : (
          <AnimatedList>
            {filteredVendors.map((vendor, i) => (
              <VendorRow
                key={vendor.id}
                vendor={vendor}
                onUpdateVendor={onUpdateVendor ?? unavailableAction}
                last={i === filteredVendors.length - 1}
              />
            ))}
          </AnimatedList>
        )}
      </CardContent>
    </Card>
  );
}

function VendorRow({
  vendor,
  onUpdateVendor,
  last
}: {
  vendor: VendorDTO;
  onUpdateVendor: StatefulAction;
  last: boolean;
}) {
  const [state, action] = useFormState(onUpdateVendor, null);
  const [isManaging, setIsManaging] = useState(false);

  useEffect(() => {
    if (state?.success) {
      setIsManaging(false);
    }
  }, [state]);

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{vendor.name}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {tradeLabel(vendor.tradeCategory)}
          {vendor.email ? ` • ${vendor.email}` : ""}
          {vendor.phone ? ` • ${vendor.phone}` : ""}
        </p>
        {isManaging && (
          <form action={action} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="vendorId" value={vendor.id} />
            <Input name="name" defaultValue={vendor.name} required />
            <Input name="email" type="email" defaultValue={vendor.email ?? ""} placeholder="Email" />
            <Input name="phone" defaultValue={vendor.phone ?? ""} placeholder="Phone" />
            <Select name="tradeCategory" defaultValue={vendor.tradeCategory ?? "other"} required>
              {tradeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <label className="sm:col-span-2 flex items-center gap-2 text-xs text-zinc-600">
              <input type="checkbox" name="preferred" value="true" defaultChecked={vendor.preferred} />
              Preferred vendor
            </label>
            <div className="sm:col-span-2">
              <SubmitButton size="sm" variant="outline" title="Save updates for this vendor.">
                Save Vendor
              </SubmitButton>
              {state && !state.success && <p className="mt-1 text-xs text-red-500">{state.error}</p>}
              {state && state.success && <p className="mt-1 text-xs text-emerald-600">Vendor updated.</p>}
            </div>
          </form>
        )}
      </div>

      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          size="sm"
          variant={isManaging ? "default" : "outline"}
          onClick={() => setIsManaging((current) => !current)}
          title={isManaging ? "Hide vendor edit controls." : "Open vendor edit controls."}
        >
          {isManaging ? "Done" : "Manage"}
        </Button>
        {vendor.preferred && <Badge variant="success">Preferred</Badge>}
        <Badge variant={vendor.active ? "outline" : "destructive"}>
          {vendor.active ? "Active" : "Inactive"}
        </Badge>
      </div>
    </DataRow>
  );
}
