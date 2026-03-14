"use client";

import { type KeyboardEvent, useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
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

type OwnershipFlow = "create_account" | "link_property";

interface CreateAccountDraft {
  accountType: "llc" | "individual";
  displayName: string;
}

interface LinkPropertyDraft {
  propertyId: string;
  ownershipAccountId: string;
}

const CREATE_ACCOUNT_STEPS = ["Account Type", "Display Name", "Review & Save"] as const;
const LINK_PROPERTY_STEPS = ["Select Property", "Select Account", "Review & Save"] as const;

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

function StepPill({
  label,
  active,
  done
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  const className = active
    ? "border-violet-300 bg-violet-50 text-violet-700"
    : done
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-zinc-200 bg-zinc-50 text-zinc-500";
  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

function onEnterNext(
  event: KeyboardEvent<HTMLInputElement>,
  canAdvance: boolean,
  advance: () => void
) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!canAdvance) return;
  advance();
}

export function OwnershipSection({
  accounts,
  properties,
  onCreateOwnershipAccount,
  onLinkPropertyToOwnershipAccount
}: OwnershipSectionProps) {
  const [createState, createAction] = useFormState(onCreateOwnershipAccount, null);
  const [linkState, linkAction] = useFormState(onLinkPropertyToOwnershipAccount, null);
  const [activeFlow, setActiveFlow] = useState<OwnershipFlow>("create_account");
  const [createStep, setCreateStep] = useState(0);
  const [linkStep, setLinkStep] = useState(0);
  const [createDraft, setCreateDraft] = useState<CreateAccountDraft>({
    accountType: "llc",
    displayName: ""
  });
  const [linkDraft, setLinkDraft] = useState<LinkPropertyDraft>({
    propertyId: "",
    ownershipAccountId: ""
  });

  const createRequiredComplete = Boolean(createDraft.accountType && createDraft.displayName);
  const linkRequiredComplete = Boolean(linkDraft.propertyId && linkDraft.ownershipAccountId);

  const createStepComplete = (step: number) => {
    if (step === 0) return Boolean(createDraft.accountType);
    if (step === 1) return Boolean(createDraft.displayName);
    return createRequiredComplete;
  };

  const linkStepComplete = (step: number) => {
    if (step === 0) return Boolean(linkDraft.propertyId);
    if (step === 1) return Boolean(linkDraft.ownershipAccountId);
    return linkRequiredComplete;
  };

  useEffect(() => {
    if (!createState?.success) return;
    setCreateStep(0);
    setCreateDraft({
      accountType: "llc",
      displayName: ""
    });
  }, [createState]);

  useEffect(() => {
    if (!linkState?.success) return;
    setLinkStep(0);
    setLinkDraft({
      propertyId: "",
      ownershipAccountId: ""
    });
  }, [linkState]);

  return (
    <div id="ownership" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Ownership Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">
            One field at a time. Press Enter or Next to continue.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={activeFlow === "create_account" ? "default" : "outline"}
              onClick={() => setActiveFlow("create_account")}
              title="Create a new individual or LLC ownership account."
            >
              Create Account
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeFlow === "link_property" ? "default" : "outline"}
              onClick={() => setActiveFlow("link_property")}
              title="Attach an existing property to an ownership account."
            >
              Link Property
            </Button>
          </div>

          {activeFlow === "create_account" && (
            <div className="space-y-4">
              <FormError state={createState} />
              <FormSuccess state={createState} message="Ownership account created." />
              <div className="grid grid-cols-3 gap-2">
                {CREATE_ACCOUNT_STEPS.map((label, index) => (
                  <StepPill
                    key={label}
                    label={label}
                    active={createStep === index}
                    done={createStepComplete(index)}
                  />
                ))}
              </div>

              {createStep === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 1: Choose account type.</p>
                  <Select
                    value={createDraft.accountType}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        accountType: event.target.value as "llc" | "individual"
                      }))
                    }
                    required
                  >
                    <option value="llc">LLC</option>
                    <option value="individual">Individual</option>
                  </Select>
                </div>
              )}

              {createStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 2: Enter display name.</p>
                  <Input
                    value={createDraft.displayName}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        displayName: event.target.value
                      }))
                    }
                    onKeyDown={(event) =>
                      onEnterNext(event, createStepComplete(createStep), () => setCreateStep(2))
                    }
                    placeholder="Display name (e.g., Smith Family LLC)"
                    required
                  />
                </div>
              )}

              {createStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Final step: review and create account.</p>
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                    <p>
                      <span className="font-semibold">Type:</span>{" "}
                      {createDraft.accountType === "llc" ? "LLC" : "Individual"}
                    </p>
                    <p>
                      <span className="font-semibold">Display Name:</span>{" "}
                      {createDraft.displayName || "Not set"}
                    </p>
                  </div>
                  <form className="space-y-2" action={createAction}>
                    <input type="hidden" name="accountType" value={createDraft.accountType} />
                    <input type="hidden" name="displayName" value={createDraft.displayName} />
                    <SubmitButton
                      className="w-full"
                      disabled={!createRequiredComplete}
                      title="Create this ownership account for individual or LLC use."
                    >
                      Create Account
                    </SubmitButton>
                  </form>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateStep((current) => Math.max(current - 1, 0))}
                  disabled={createStep === 0}
                  title="Go back one step."
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    setCreateStep((current) => Math.min(current + 1, CREATE_ACCOUNT_STEPS.length - 1))
                  }
                  disabled={createStep >= CREATE_ACCOUNT_STEPS.length - 1 || !createStepComplete(createStep)}
                  title="Complete this step and move to the next step."
                >
                  Next
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateStep(0);
                    setCreateDraft({ accountType: "llc", displayName: "" });
                  }}
                  title="Restart account creation."
                >
                  Restart
                </Button>
              </div>
            </div>
          )}

          {activeFlow === "link_property" && (
            <div className="space-y-4">
              <FormError state={linkState} />
              <FormSuccess state={linkState} message="Property account updated." />
              <div className="grid grid-cols-3 gap-2">
                {LINK_PROPERTY_STEPS.map((label, index) => (
                  <StepPill
                    key={label}
                    label={label}
                    active={linkStep === index}
                    done={linkStepComplete(index)}
                  />
                ))}
              </div>

              {linkStep === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 1: Select property.</p>
                  <Select
                    value={linkDraft.propertyId}
                    onChange={(event) =>
                      setLinkDraft((current) => ({ ...current, propertyId: event.target.value }))
                    }
                    required
                  >
                    <option value="">Select property</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {linkStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 2: Select ownership account.</p>
                  <Select
                    value={linkDraft.ownershipAccountId}
                    onChange={(event) =>
                      setLinkDraft((current) => ({
                        ...current,
                        ownershipAccountId: event.target.value
                      }))
                    }
                    required
                  >
                    <option value="">Select ownership account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.displayName}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {linkStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Final step: review and link property.</p>
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                    <p>
                      <span className="font-semibold">Property:</span>{" "}
                      {properties.find((property) => property.id === linkDraft.propertyId)?.name ?? "Not set"}
                    </p>
                    <p>
                      <span className="font-semibold">Account:</span>{" "}
                      {accounts.find((account) => account.id === linkDraft.ownershipAccountId)?.displayName ??
                        "Not set"}
                    </p>
                  </div>
                  <form className="space-y-2" action={linkAction}>
                    <input type="hidden" name="propertyId" value={linkDraft.propertyId} />
                    <input type="hidden" name="ownershipAccountId" value={linkDraft.ownershipAccountId} />
                    <SubmitButton
                      className="w-full"
                      disabled={!linkRequiredComplete}
                      title="Attach the selected property to this ownership account."
                    >
                      Link Property
                    </SubmitButton>
                  </form>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLinkStep((current) => Math.max(current - 1, 0))}
                  disabled={linkStep === 0}
                  title="Go back one step."
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    setLinkStep((current) => Math.min(current + 1, LINK_PROPERTY_STEPS.length - 1))
                  }
                  disabled={linkStep >= LINK_PROPERTY_STEPS.length - 1 || !linkStepComplete(linkStep)}
                  title="Complete this step and move to the next step."
                >
                  Next
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setLinkStep(0);
                    setLinkDraft({
                      propertyId: "",
                      ownershipAccountId: ""
                    });
                  }}
                  title="Restart property linking."
                >
                  Restart
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ownership Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No ownership accounts"
              description="Create an ownership account to organize your properties."
            />
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
