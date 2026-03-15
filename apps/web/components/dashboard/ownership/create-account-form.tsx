"use client";

import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";

export interface PropertyOption {
  id: string;
  name: string;
  ownerAccountName: string;
}

export interface CreateAccountDraft {
  accountType: "llc" | "individual";
  displayName: string;
}

export interface LinkPropertyDraft {
  propertyId: string;
  ownershipAccountId: string;
}

const CREATE_ACCOUNT_STEPS = ["Account Type", "Display Name", "Review & Save"] as const;
const LINK_PROPERTY_STEPS = ["Select Property", "Select Account", "Review & Save"] as const;

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return <Alert variant="error">{state.error}</Alert>;
}

function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return <Alert variant="success">{message}</Alert>;
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

export function CreateAccountWorkflowCard({
  state,
  action,
  createStep,
  setCreateStep,
  createDraft,
  setCreateDraft
}: {
  state: ActionState;
  action: (formData: FormData) => void;
  createStep: number;
  setCreateStep: Dispatch<SetStateAction<number>>;
  createDraft: CreateAccountDraft;
  setCreateDraft: Dispatch<SetStateAction<CreateAccountDraft>>;
}) {
  const createRequiredComplete = Boolean(createDraft.accountType && createDraft.displayName);
  const createStepComplete = (step: number) => {
    if (step === 0) return Boolean(createDraft.accountType);
    if (step === 1) return Boolean(createDraft.displayName);
    return createRequiredComplete;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormError state={state} />
        <FormSuccess state={state} message="Ownership account created." />
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

        {createStep === 0 ? (
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
        ) : null}

        {createStep === 1 ? (
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
        ) : null}

        {createStep === 2 ? (
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
            <form className="space-y-2" action={action}>
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
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCreateStep((current) => Math.max(0, current - 1))}
            disabled={createStep === 0}
            title="Go back one step."
          >
            Back
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setCreateStep((current) => Math.min(CREATE_ACCOUNT_STEPS.length - 1, current + 1))}
            disabled={createStep >= CREATE_ACCOUNT_STEPS.length - 1 || !createStepComplete(createStep)}
            title="Go to the next step."
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function LinkPropertyWorkflowCard({
  state,
  action,
  linkStep,
  setLinkStep,
  linkDraft,
  setLinkDraft,
  properties,
  accountOptions
}: {
  state: ActionState;
  action: (formData: FormData) => void;
  linkStep: number;
  setLinkStep: Dispatch<SetStateAction<number>>;
  linkDraft: LinkPropertyDraft;
  setLinkDraft: Dispatch<SetStateAction<LinkPropertyDraft>>;
  properties: PropertyOption[];
  accountOptions: Array<{ id: string; displayName: string }>;
}) {
  const linkRequiredComplete = Boolean(linkDraft.propertyId && linkDraft.ownershipAccountId);
  const linkStepComplete = (step: number) => {
    if (step === 0) return Boolean(linkDraft.propertyId);
    if (step === 1) return Boolean(linkDraft.ownershipAccountId);
    return linkRequiredComplete;
  };

  const selectedProperty = properties.find((property) => property.id === linkDraft.propertyId);
  const selectedAccount = accountOptions.find((account) => account.id === linkDraft.ownershipAccountId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link Property</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormError state={state} />
        <FormSuccess state={state} message="Property linked to ownership account." />
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

        {linkStep === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 1: Choose the property to link.</p>
            <Select
              value={linkDraft.propertyId}
              onChange={(event) =>
                setLinkDraft((current) => ({
                  ...current,
                  propertyId: event.target.value
                }))
              }
              required
            >
              <option value="">Select a property</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {linkStep === 1 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 2: Choose the ownership account.</p>
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
              <option value="">Select an account</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {linkStep === 2 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Final step: review and link the property.</p>
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
              <p>
                <span className="font-semibold">Property:</span>{" "}
                {selectedProperty?.name ?? "Not selected"}
              </p>
              <p>
                <span className="font-semibold">Ownership Account:</span>{" "}
                {selectedAccount?.displayName ?? "Not selected"}
              </p>
            </div>
            <form className="space-y-2" action={action}>
              <input type="hidden" name="propertyId" value={linkDraft.propertyId} />
              <input type="hidden" name="ownershipAccountId" value={linkDraft.ownershipAccountId} />
              <SubmitButton
                className="w-full"
                disabled={!linkRequiredComplete}
                title="Link this property to the selected ownership account."
              >
                Link Property
              </SubmitButton>
            </form>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLinkStep((current) => Math.max(0, current - 1))}
            disabled={linkStep === 0}
            title="Go back one step."
          >
            Back
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setLinkStep((current) => Math.min(LINK_PROPERTY_STEPS.length - 1, current + 1))}
            disabled={linkStep >= LINK_PROPERTY_STEPS.length - 1 || !linkStepComplete(linkStep)}
            title="Go to the next step."
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
