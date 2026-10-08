"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { ActionState } from "@/app/actions";

import type { KeyboardEvent } from "react";

export type UnifiedSetupAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export type PropertyType =
  | "single_family"
  | "duplex"
  | "triplex"
  | "apartment"
  | "condo"
  | "townhouse";
export type WizardStep = "property" | "unit" | "lease" | "confirm" | "success";

export interface UnitDraft {
  id: string;
  label: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  monthlyRentDollars: string;
}

export interface LeaseDraft {
  hasTenant: boolean;
  leasedUnitId: string;
  tenantEmail: string;
  startDate: string;
  endDate: string;
  monthlyRentDollars: string;
  depositDollars: string;
}

export const PROPERTY_TYPE_OPTIONS: Array<{ value: PropertyType; label: string }> = [
  { value: "single_family", label: "Single Family" },
  { value: "duplex", label: "Duplex" },
  { value: "triplex", label: "Triplex" },
  { value: "apartment", label: "Apartment" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
];

export const stepOrder: WizardStep[] = ["property", "unit", "lease", "confirm"];

export function createUnitDraft(index = 0): UnitDraft {
  return {
    id: crypto.randomUUID(),
    label: `Unit ${String.fromCharCode(65 + index)}`,
    bedrooms: "1",
    bathrooms: "1",
    squareFeet: "",
    monthlyRentDollars: "",
  };
}

export function createInitialLeaseDraft(unitId: string): LeaseDraft {
  return {
    hasTenant: false,
    leasedUnitId: unitId,
    tenantEmail: "",
    startDate: "",
    endDate: "",
    monthlyRentDollars: "",
    depositDollars: "0",
  };
}

export function getStepIndex(step: WizardStep) {
  return Math.max(0, stepOrder.indexOf(step));
}

export function getFirstInput(container: HTMLDivElement | null) {
  return container?.querySelector<HTMLElement>("[data-autofocus='true']") ?? null;
}

export function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function shouldAdvanceOnEnter(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" || event.shiftKey) {
    return false;
  }

  const target = event.target as HTMLElement | null;
  const tagName = target?.tagName ?? "";
  return tagName !== "TEXTAREA" && tagName !== "BUTTON" && tagName !== "SELECT";
}

export function getPropertyStepError(params: {
  propertyName: string;
  addressLine1: string;
  city: string;
  stateCode: string;
  postalCode: string;
}) {
  if (!params.propertyName.trim()) return "Property name is required.";
  if (!params.addressLine1.trim()) return "Street address is required.";
  if (!params.city.trim()) return "City is required.";
  if (!params.stateCode.trim()) return "State is required.";
  if (!/^\d{5}(-\d{4})?$/.test(params.postalCode.trim())) return "Enter a valid 5-digit ZIP code.";
  return null;
}

export function getUnitStepError(units: UnitDraft[]) {
  if (units.length === 0) {
    return "Add at least one unit.";
  }

  for (const unit of units) {
    if (!unit.label.trim()) return "Each unit needs a label.";
    if (parseNumber(unit.bedrooms, -1) < 0) return "Bedrooms must be 0 or more.";
    if (parseNumber(unit.bathrooms, -1) < 0) return "Bathrooms must be 0 or more.";
    if (parseNumber(unit.monthlyRentDollars, 0) <= 0)
      return "Each unit needs a monthly rent amount.";
  }

  return null;
}

export function getLeaseStepError(lease: LeaseDraft) {
  if (!lease.hasTenant) {
    return null;
  }

  if (!lease.tenantEmail.trim()) return "Tenant email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lease.tenantEmail.trim()))
    return "Enter a valid tenant email.";
  if (!lease.startDate) return "Lease start date is required.";
  if (!lease.endDate) return "Lease end date is required.";
  if (lease.endDate <= lease.startDate) return "End date must be after start date.";
  if (parseNumber(lease.monthlyRentDollars, 0) <= 0) return "Monthly rent must be greater than $0.";
  if (parseNumber(lease.depositDollars, 0) < 0) return "Deposit cannot be negative.";
  return null;
}

export function WizardProgress({ step }: { step: WizardStep }) {
  const current = getStepIndex(step) + 1;
  const percent = Math.round((current / stepOrder.length) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Step {current} of 4</span>
        <span className="text-muted-foreground">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

interface PropertyWizardSuccessProps {
  step: WizardStep;
  bankConnected?: boolean;
  bankSetupHref: string;
  finishSetup: () => void;
  returnToClientHref?: string;
}

export function PropertyWizardSuccess({
  step, bankConnected, bankSetupHref, finishSetup, returnToClientHref
}: PropertyWizardSuccessProps) {
  return (
    <>
          {step === "success" ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-5 px-4 py-8 text-center">
              <Badge variant="success" className="px-3 py-1 text-sm">
                Setup complete
              </Badge>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--line)]">
                <CheckCircle2 className="h-8 w-8 text-[var(--pos)]" />
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-semibold tracking-tight text-foreground">
                  Your home is added.
                </h3>
                <p className="mx-auto max-w-2xl text-base leading-7 text-muted-foreground">
                  {bankConnected === true
                    ? "Your home is ready. Tenants can pay rent here."
                    : bankConnected === false
                      ? "Your home is added. Connect your bank so tenants can pay you."
                      : "Your home is added. Check your bank setup before taking rent."}
                </p>
                {bankConnected !== true ? (
                  <Link
                    href={bankSetupHref}
                    className="inline-flex min-h-11 items-center font-semibold text-primary underline"
                    title="Connect your bank to receive rent."
                  >
                    Connect your bank
                  </Link>
                ) : null}
              </div>
              <Button
                type="button"
                size="lg"
                onClick={finishSetup}
                title={returnToClientHref ? "Return to this client." : "Go to the property overview on the dashboard."}
              >
                {returnToClientHref ? "Back to client" : "Go to Dashboard"}
              </Button>
            </div>
          ) : null}
    </>
  );
}
