"use client";

import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";
import type { VendorDTO } from "@/lib/vendors";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import { Select } from "@/components/ui/select";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface VendorsSectionProps {
  vendors: VendorDTO[];
  ownershipAccounts: OwnershipAccountDTO[];
  onCreateVendor: StatefulAction;
}

export function VendorsSection({ vendors, ownershipAccounts, onCreateVendor }: VendorsSectionProps) {
  const [state, action] = useFormState(onCreateVendor, null);

  return (
    <Card id="vendors">
      <CardHeader>
        <CardTitle>Vendors</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5">
          <Input name="name" placeholder="Vendor name" required />
          <Input name="trade" placeholder="Trade (Plumbing, HVAC...)" />
          <Input name="email" type="email" placeholder="Email" />
          <Input name="phone" placeholder="Phone" />
          <Select name="ownerAccountId">
            <option value="">Default ownership account</option>
            {ownershipAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}
              </option>
            ))}
          </Select>
          <div className="md:col-span-5">
            <SubmitButton size="sm">Add Vendor</SubmitButton>
            {state && !state.success && (
              <p className="mt-1 text-xs text-red-500">{state.error}</p>
            )}
            {state && state.success && (
              <p className="mt-1 text-xs text-emerald-600">Vendor added.</p>
            )}
          </div>
        </form>

        {vendors.length === 0 ? (
          <EmptyState message="No vendors yet." />
        ) : (
          <div>
            {vendors.map((vendor, i) => (
              <DataRow key={vendor.id} last={i === vendors.length - 1}>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{vendor.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {vendor.trade || "General"}
                    {vendor.email ? ` • ${vendor.email}` : ""}
                    {vendor.phone ? ` • ${vendor.phone}` : ""}
                  </p>
                </div>
                <Badge variant={vendor.active ? "success" : "outline"}>
                  {vendor.active ? "Active" : "Inactive"}
                </Badge>
              </DataRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
