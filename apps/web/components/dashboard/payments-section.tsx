import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";

interface Payment {
  id: string;
  amountCents: number;
  paidAt: string;
  method: string;
}

interface PaymentsSectionProps {
  payments: Payment[];
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

export function PaymentsSection({ payments }: PaymentsSectionProps) {
  return (
    <Card id="payments">
      <CardHeader>
        <CardTitle>Recent Payments</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <EmptyState message="No payments recorded yet." />
        ) : (
          <div>
            {payments.map((payment, i) => (
              <DataRow key={payment.id} last={i === payments.length - 1}>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {dollars(payment.amountCents)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {new Date(payment.paidAt).toLocaleString()}
                  </p>
                </div>
                <Badge variant="outline">{payment.method.toUpperCase()}</Badge>
              </DataRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
