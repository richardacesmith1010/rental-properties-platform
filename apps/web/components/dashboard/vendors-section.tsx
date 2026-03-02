"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
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

function tradeLabel(value: string | null) {
  if (!value) {
    return "Other";
  }
  return tradeOptions.find((option) => option.value === value)?.label ?? value;
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
  const [showCreateVendorForm, setShowCreateVendorForm] = useState(false);
  const [tradeFilter, setTradeFilter] = useState("all");
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
    setShowCreateVendorForm(false);
    onCreateVendorSuccess();
  }, [handledCreateState, onCreateVendorSuccess, state]);

  return (
    <Card id="vendors">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Vendors</CardTitle>
          <Button
            type="button"
            size="sm"
            variant={showCreateVendorForm ? "default" : "outline"}
            onClick={() => setShowCreateVendorForm((current) => !current)}
            title={showCreateVendorForm ? "Hide create vendor form." : "Open create vendor form."}
          >
            {showCreateVendorForm ? "Done" : "Add Vendor"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showCreateVendorForm ? (
          <form action={action} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5">
            <Input name="name" placeholder="Vendor name" required />
            <Input name="email" type="email" placeholder="Email" />
            <Input name="phone" placeholder="Phone" />
            <Select name="tradeCategory" defaultValue="other" required>
              {tradeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select name="ownerAccountId">
              <option value="">Default ownership account</option>
              {ownershipAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName}
                </option>
              ))}
            </Select>
            <label className="md:col-span-2 flex items-center gap-2 text-xs text-zinc-600">
              <input type="checkbox" name="preferred" value="true" />
              Mark as preferred vendor
            </label>
            <div className="md:col-span-5">
              <SubmitButton size="sm" title="Create this vendor record for future assignments.">
                Save New Vendor
              </SubmitButton>
              {state && !state.success && (
                <p className="mt-1 text-xs text-red-500">{state.error}</p>
              )}
              {state && state.success && (
                <p className="mt-1 text-xs text-emerald-600">Vendor added.</p>
              )}
            </div>
          </form>
        ) : (
          <p className="mb-4 text-sm text-zinc-500">
            Vendor creation form hidden. Click Add Vendor to create a new vendor.
          </p>
        )}

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

        {filteredVendors.length === 0 ? (
          <EmptyState message="No vendors match this filter." />
        ) : (
          <div>
            {filteredVendors.map((vendor, i) => (
              <VendorRow
                key={vendor.id}
                vendor={vendor}
                onUpdateVendor={onUpdateVendor ?? unavailableAction}
                last={i === filteredVendors.length - 1}
              />
            ))}
          </div>
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
