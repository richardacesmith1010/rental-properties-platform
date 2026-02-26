import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";

interface Charge {
  id: string;
  leaseId: string;
  dueDate: string;
  amountCents: number;
  status: "pending" | "paid" | "late";
}

interface ChargesSectionProps {
  charges: Charge[];
  onPayCharge: (formData: FormData) => Promise<void>;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

export function ChargesSection({ charges, onPayCharge }: ChargesSectionProps) {
  return (
    <Card id="charges">
      <CardHeader>
        <CardTitle>Upcoming / Late Charges</CardTitle>
      </CardHeader>
      <CardContent>
        {charges.length === 0 ? (
          <EmptyState message="No pending or late rent charges yet." />
        ) : (
          <div>
            {charges.map((charge, i) => (
              <DataRow key={charge.id} last={i === charges.length - 1}>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{charge.leaseId}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Due {charge.dueDate}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-900">
                      {dollars(charge.amountCents)}
                    </p>
                    <Badge
                      variant={charge.status === "late" ? "destructive" : "warning"}
                      className="mt-0.5"
                    >
                      {charge.status.toUpperCase()}
                    </Badge>
                  </div>
                  <form action={onPayCharge}>
                    <input type="hidden" name="chargeId" value={charge.id} />
                    <SubmitButton size="sm">Pay now</SubmitButton>
                  </form>
                </div>
              </DataRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
