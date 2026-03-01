"use client";

import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";
import type { OwnershipAccountDTO } from "@/lib/ownership";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface PropertyOption {
  id: string;
  name: string;
  ownerAccountName: string;
}

interface OwnershipSectionProps {
  accounts: OwnershipAccountDTO[];
  properties: PropertyOption[];
  onCreateOwnershipAccount: StatefulAction;
  onLinkPropertyToOwnershipAccount: StatefulAction;
}

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
      {state.error}
    </p>
  );
}

function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return (
    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
      {message}
    </p>
  );
}

export function OwnershipSection({
  accounts,
  properties,
  onCreateOwnershipAccount,
  onLinkPropertyToOwnershipAccount
}: OwnershipSectionProps) {
  const [createState, createAction] = useFormState(onCreateOwnershipAccount, null);
  const [linkState, linkAction] = useFormState(onLinkPropertyToOwnershipAccount, null);

  return (
    <div id="ownership" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Create Ownership Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" action={createAction}>
            <FormError state={createState} />
            <FormSuccess state={createState} message="Ownership account created." />
            <Select name="accountType" required>
              <option value="llc">LLC</option>
              <option value="individual">Individual</option>
            </Select>
            <Input name="displayName" placeholder="Display name (e.g., Smith Family LLC)" required />
            <SubmitButton className="w-full">Create Account</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Link Property to Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" action={linkAction}>
            <FormError state={linkState} />
            <FormSuccess state={linkState} message="Property account updated." />
            <Select name="propertyId" required>
              <option value="">Select property</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </Select>
            <Select name="ownershipAccountId" required>
              <option value="">Select ownership account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName}
                </option>
              ))}
            </Select>
            <SubmitButton className="w-full">Link Property</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ownership Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <EmptyState message="No ownership accounts yet." />
          ) : (
            <div>
              {accounts.map((account, index) => (
                <DataRow key={account.id} last={index === accounts.length - 1}>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{account.displayName}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 capitalize">
                      {account.accountType} account
                    </p>
                  </div>
                  <Badge variant="outline">
                    {account.memberCount} owner{account.memberCount === 1 ? "" : "s"}
                  </Badge>
                </DataRow>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
