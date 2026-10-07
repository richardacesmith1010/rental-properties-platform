import { formatDate } from "@/lib/format";
import type { PropertyListItem, TenantOption, UnitListItem } from "@/lib/portfolio";
import type { LeaseWizardDraft } from "../lease-wizard-support";

export function LeaseWizardReview({
  draft,
  property,
  unit,
  tenant,
  effectiveEndDate
}: {
  draft: LeaseWizardDraft;
  property: PropertyListItem | null;
  unit: UnitListItem | null;
  tenant: TenantOption | null;
  effectiveEndDate: string;
}) {
  const tenantLabel =
    draft.tenantMode === "existing"
      ? tenant
        ? `${tenant.fullName} (${tenant.email})`
        : "Not selected"
      : `${draft.tenantFullName || "New tenant"} (${draft.tenantEmail || "email not set"})`;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-muted/40 p-5 text-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Property</p>
            <p className="mt-2 font-medium text-foreground">
              {property ? `${property.name} - ${property.addressLine1}` : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Unit</p>
            <p className="mt-2 font-medium text-foreground">
              {unit ? `${unit.unitNumber} (${unit.bedrooms} bd / ${unit.bathrooms} ba)` : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tenant</p>
            <p className="mt-2 font-medium text-foreground">{tenantLabel}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Lease term</p>
            <p className="mt-2 font-medium text-foreground">
              {draft.startDate ? formatDate(draft.startDate) : "Not set"}
              {draft.startDate ? " to " : ""}
              {effectiveEndDate ? formatDate(effectiveEndDate) : "Not set"}
              {draft.leaseType === "month_to_month" ? " (month-to-month)" : ""}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Rent</p>
            <p className="mt-2 font-medium text-foreground">
              {draft.monthlyRentDollars ? `$${Number(draft.monthlyRentDollars).toFixed(2)}/month` : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Deposit</p>
            <p className="mt-2 font-medium text-foreground">
              ${Number(draft.depositDollars || "0").toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

