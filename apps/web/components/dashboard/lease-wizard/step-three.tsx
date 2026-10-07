import { CheckCircle2, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { TenantOption } from "@/lib/portfolio";
import { type LeaseWizardDraft } from "../lease-wizard-support";

export function LeaseWizardStepThree({
  draft,
  tenants,
  onDraftChange,
  onInviteTenantAction
}: {
  draft: LeaseWizardDraft;
  tenants: TenantOption[];
  onDraftChange: (draft: LeaseWizardDraft) => void;
  onInviteTenantAction: () => void;
}) {
  const filteredTenants = draft.tenantSearch.trim()
    ? tenants.filter((tenant) => {
        const needle = draft.tenantSearch.toLowerCase();
        return (
          tenant.fullName.toLowerCase().includes(needle) || tenant.email.toLowerCase().includes(needle)
        );
      })
    : tenants;
  const selectedTenant = tenants.find((tenant) => tenant.id === draft.tenantProfileId) ?? null;

  if (tenants.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-5 text-sm">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 h-5 w-5 text-primary" />
          <div className="space-y-4">
            <div>
              <p className="font-medium text-foreground">No tenants available</p>
              <p className="mt-1 text-muted-foreground">
                Invite a tenant to this property first. They&apos;ll get an email to set up their account.
              </p>
            </div>
            <Button
              type="button"
              onClick={onInviteTenantAction}
              title="Open the tenant invite flow."
            >
              Invite Tenant
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">Tenant source</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={draft.tenantMode === "existing" ? "default" : "outline"}
            onClick={() => onDraftChange({ ...draft, tenantMode: "existing" })}
            title="Attach this lease to a tenant already in Domus."
          >
            Existing tenant
          </Button>
          <Button
            type="button"
            variant={draft.tenantMode === "invite_new" ? "default" : "outline"}
            onClick={() => onDraftChange({ ...draft, tenantMode: "invite_new" })}
            title="Invite a brand-new tenant as part of this lease setup."
          >
            Invite new tenant
          </Button>
        </div>
      </div>

      {draft.tenantMode === "existing" ? (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-tenant-search">
                Search tenants
              </label>
              <Input
                id="lease-wizard-tenant-search"
                value={draft.tenantSearch}
                onChange={(event) => onDraftChange({ ...draft, tenantSearch: event.target.value })}
                placeholder="Search by name or email"
                title="Filter existing tenants by name or email."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-tenant-select">
                Tenant
              </label>
              <Select
                id="lease-wizard-tenant-select"
                value={draft.tenantProfileId}
                onChange={(event) => onDraftChange({ ...draft, tenantProfileId: event.target.value })}
                disabled={filteredTenants.length === 0}
                title="Select an existing tenant profile for this lease."
              >
                <option value="">Select tenant</option>
                {filteredTenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.fullName} ({tenant.email})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {selectedTenant ? (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--pos)]" />
                <div>
                  <p className="font-medium text-foreground">Tenant selected</p>
                  <p className="mt-1">{selectedTenant.fullName}</p>
                  <p className="mt-1">{selectedTenant.email}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No tenant selected yet.</p>
              <p className="mt-1">Choose a tenant linked to this property. Or invite a new tenant.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-invite-name">
              Full name
            </label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="lease-wizard-invite-name"
                value={draft.tenantFullName}
                onChange={(event) => onDraftChange({ ...draft, tenantFullName: event.target.value })}
                className="pl-9"
                placeholder="Alex Tenant"
                title="Enter the new tenant's full name."
              />
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-invite-email">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="lease-wizard-invite-email"
                type="email"
                value={draft.tenantEmail}
                onChange={(event) => onDraftChange({ ...draft, tenantEmail: event.target.value })}
                className="pl-9"
                placeholder="tenant@example.com"
                title="Enter the new tenant's email address."
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground md:col-span-2">
            <p className="font-medium text-foreground">Domus will send a branded tenant invitation first.</p>
            <p className="mt-1">If the invite works, Domus may create the lease now. Otherwise, finish it later.</p>
          </div>
        </div>
      )}
    </div>
  );
}
