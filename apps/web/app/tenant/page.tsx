import { createCheckoutForCharge, signOut } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { getTenantPaymentData } from "@/lib/tenant-payments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { LogOut, CreditCard } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TenantPage() {
  const { user } = await requireRole(["tenant"]);
  const paymentData = await getTenantPaymentData(user.id);

  return (
    <div className="min-h-screen bg-[#fafafa] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header card */}
        <Card>
          <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-5">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">
                Tenant Workspace
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Pay rent securely and track outstanding charges.
              </p>
            </div>
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit">
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Charges card */}
        <Card>
          <CardHeader>
            <CardTitle>Outstanding Rent Charges</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentData.charges.length === 0 ? (
              <EmptyState message="You currently have no pending rent charges." />
            ) : (
              <div>
                {paymentData.charges.map((charge, i) => (
                  <DataRow key={charge.id} last={i === paymentData.charges.length - 1}>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        {charge.propertyLabel}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">Due {charge.dueDate}</p>
                      <Badge
                        variant={charge.status === "late" ? "destructive" : "warning"}
                        className="mt-1"
                      >
                        {charge.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-zinc-900">
                        ${(charge.amountCents / 100).toLocaleString()}
                      </p>
                      <form action={createCheckoutForCharge} className="mt-2">
                        <input type="hidden" name="chargeId" value={charge.id} />
                        <Button size="sm" type="submit">
                          <CreditCard className="mr-2 h-3.5 w-3.5" />
                          Pay with Card
                        </Button>
                      </form>
                    </div>
                  </DataRow>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
